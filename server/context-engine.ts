// 上下文工程 —— 把"全量塞进 prompt"替换为分层 / 窗口化 / 截断 / 预算感知的管线。
//
// 设计参照（见 docs/ai-capability-design.md）：
// - pi：工具结果按"开头重要"用 truncateHead、"结尾重要"用 truncateTail，绝不无脑全塞。
// - Claude Code / Cursor / Codex：分层系统提示 + 持久记忆 + 旧对话压缩成摘要 +
//   单条内容上限 + 上下文窗口预算控制。
//
// 本模块是纯函数、provider 无关：输入 messages + system + 模型上下文窗口，
// 输出工程化后的 messages、分层 system、以及在窗口内有所保留的 maxTokens。

const DEFAULT_CONTEXT_WINDOW = 128_000
const OUTPUT_RESERVE = 4_096
const SAFETY_MARGIN = 1.15
const MSG_CONTENT_MAX = 6_000
const TAIL_SNIPPET_MAX = 300
const HISTORY_WINDOW = 40
const SUMMARY_PREFIX_MAX = 1_600
const LAST_MSG_MAX = 40_000
const MIN_MAX_TOKENS = 256

const CJK_RE = /[　-〿一-鿿＀-￯]/g

const BASE_SYSTEM = '你是 Lab-Studio 的 AI 助手。请用与用户相同的语言回答，内容准确、清晰、可执行；信息不足时明确说明，不要编造。对话中，以用户最新一条消息为当前任务；仅当其与对话前文相关时才参考前文，不要把无关的旧主题与当前问题强行结合。'

export interface EngineeredContextMessage {
  role: 'user' | 'assistant'
  content: string
  /** 该条消息附带的受控图床 URL（对话多模态）。仅原样透传，不参与压缩/截断。 */
  images?: string[]
}

export interface EngineerContextInput {
  messages: ContextEngineMessage[]
  system?: string
  summary?: string
  contextWindow?: number | null
  maxTokens?: number
}

// 消息的统一结构：`images` 是可选的附件，压缩/截断只看 `content`，附件原样透传。
export type ContextEngineMessage = { role: string; content: string; images?: string[] }

export interface EngineerContextResult {
  system: string
  messages: EngineeredContextMessage[]
  maxTokens: number
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(CJK_RE) ?? []).length
  const rest = text.length - cjk
  return Math.ceil(cjk + rest / 3.5)
}

export function truncateHead(content: string, max: number, marker = '…'): string {
  if (content.length <= max) return content
  return content.slice(0, Math.max(1, max - marker.length)) + marker
}

export function truncateTail(content: string, max: number, marker = '…'): string {
  if (content.length <= max) return content
  return marker + content.slice(Math.max(1, content.length - (max - marker.length)))
}

export function looksLikeCodeOrOutput(content: string): boolean {
  const lines = content.split('\n')
  const hasCodeFence = /```/.test(content)
  const hasErrorSig = /(error|exception|traceback|failed|failed to|\bat\s+\S+\s+\d+:\d+)/i.test(content)
  const hasManyLines = lines.length > 8
  const hasVeryLongLine = lines.some((line) => line.length > 400)
  return hasCodeFence || hasErrorSig || (hasManyLines && hasVeryLongLine)
}

export function truncateMessageContent(content: string, max: number): string {
  if (content.length <= max) return content
  if (looksLikeCodeOrOutput(content)) {
    const omitted = content.length - max
    const marker = `\n…[已省略约 ${omitted.toLocaleString()} 字符]…\n`
    const headLen = Math.max(1, max - TAIL_SNIPPET_MAX - marker.length)
    const head = content.slice(0, headLen)
    const tail = content.slice(Math.max(1, content.length - TAIL_SNIPPET_MAX))
    return head + marker + tail
  }
  return truncateHead(content, max)
}

export function splitWindow(
  messages: ContextEngineMessage[],
  windowSize: number,
): { prefix: ContextEngineMessage[]; recent: ContextEngineMessage[] } {
  const total = messages.length
  if (total <= windowSize) return { prefix: [], recent: messages }
  const cut = total - windowSize
  return { prefix: messages.slice(0, cut), recent: messages.slice(cut) }
}

export function buildPrefixSummary(
  prefix: { role: string; content: string }[],
  providedSummary?: string,
): string {
  if (!prefix.length) return ''
  const trimmed = providedSummary?.trim()
  if (trimmed) return trimmed.slice(0, SUMMARY_PREFIX_MAX)
  const firstUser = prefix.find((m) => m.role === 'user' && m.content.trim())
  const anchor = firstUser
    ? truncateHead(firstUser.content.replace(/\s+/g, ' ').trim(), 160)
    : ''
  const parts = [`（本轮之前已省略 ${prefix.length} 条消息`]
  if (anchor) parts.push(`，最初的提问：${anchor}`)
  parts.push('）')
  return parts.join('')
}

export function buildSystemPrompt(input: { userSystem?: string; summary?: string }): string {
  const sections: string[] = []
  sections.push(BASE_SYSTEM)
  const userSystem = input.userSystem?.trim()
  if (userSystem) sections.push(`【用户设定】\n${userSystem}`)
  if (input.summary?.trim()) sections.push(`【对话前情摘要】\n${input.summary.trim()}`)
  return sections.join('\n\n')
}

// ---- 上下文相关性：判断「最新一条用户消息」是否开启了与上文无关的新主题 ----
//
// 豆包式的行为：上下文明显无关时，把新问题当作独立的全新请求作答（忽略旧主题），
// 而不是把旧主题与当前问题强行拼在一起。反映到工程上是两层：
//   1) 结构层 —— 判定为 fresh 时，只保留当前这条消息、抑制前情摘要注入；
//   2) 提示层 —— 无论如何都让模型「以最新一条为当前任务，相关才用前文」（见 BASE_SYSTEM）。
// 判定用规则驱动、默认保守（拿不准一律 continue=带上文），漏判由提示层兜底。

type IntentDomain = 'weather' | 'time' | 'quote' | 'search' | 'image' | 'code'

const INTENT_KEYWORDS: Record<IntentDomain, string[]> = {
  weather: ['天气', '下雨', '气温', '温度', '湿度', '风速', '台风', '下雪', '雾', '晴', '阴天', '降水', '天冷', '天热'],
  quote: ['股价', '行情', '股票', '大盘', '基金', '涨跌', '市盈率', 'k线', '收盘', '开盘', '指数', '市值', '跌幅', '涨幅'],
  time: ['几点', '现在几点', '几点了', '几点钟', '今天几号', '星期几', '几号', '周几', '时间', '日期'],
  image: ['画', '图', 'logo', '设计', '海报', '插画', '头像', '壁纸', '配色', '生图', '图片', '参考图', '背景', '排版'],
  code: ['代码', '函数', 'bug', '报错', '重构', '接口', '组件', '脚本', '依赖', '类型', '编译', '框架', '样式'],
  search: ['搜索', '搜一下', '查一下', '查查', '搜搜', '最新', '新闻', '百科', '是什么', '是谁', '为什么', '消息', '资讯'],
}

// 具体任务域优先于通用「搜索」动作；同分时按此顺序取先者（如「查一下北京的天气」→ weather 而非 search）。
const DOMAIN_PRECEDENCE: IntentDomain[] = ['weather', 'time', 'quote', 'image', 'code', 'search']

const RESET_MARKERS = ['换个话题', '换话题', '重新开始', '开始新话题', '另起', '不说这个', '跟前面没关系', '跟前面无关', '另外问', '再问一个', '无关', '新对话']

const ANCHOR_TURNS = 6
const FRESH_CONTEXT_NOTE = '【上下文】检测到本条消息与对话前文主题无关，已按独立的新请求处理：请忽略对话前文，仅围绕本条消息作答。'

export interface ContextShiftDecision {
  mode: 'continue' | 'fresh'
  /** 保留起始下标；更早的消息因主题无关而被丢弃。continue 时恒为 0。 */
  retainFrom: number
  /** fresh 时抑制对话前情摘要注入。 */
  suppressSummary: boolean
  /** fresh 时追加到系统提示的说明。 */
  note: string
}

function hasResetMarker(text: string): boolean {
  return RESET_MARKERS.some((marker) => text.includes(marker))
}

function classifyDomain(text: string): { domain: IntentDomain; score: number } | null {
  const scores = new Map<IntentDomain, number>()
  for (const domain of DOMAIN_PRECEDENCE) {
    let score = 0
    for (const keyword of INTENT_KEYWORDS[domain]) {
      if (text.includes(keyword)) score += 1
    }
    scores.set(domain, score)
  }
  let best: IntentDomain | null = null
  let bestScore = 0
  for (const domain of DOMAIN_PRECEDENCE) {
    const score = scores.get(domain) ?? 0
    if (score > bestScore) {
      best = domain
      bestScore = score
    }
  }
  return bestScore > 0 ? { domain: best as IntentDomain, score: bestScore } : null
}

function intentOverlap(a: string, b: string): number {
  let overlap = 0
  for (const domain of DOMAIN_PRECEDENCE) {
    for (const keyword of INTENT_KEYWORDS[domain]) {
      if (a.includes(keyword) && b.includes(keyword)) overlap += 1
    }
  }
  return overlap
}

export function detectContextShift(messages: { role: string; content: string }[]): ContextShiftDecision {
  const continueDecision: ContextShiftDecision = { mode: 'continue', retainFrom: 0, suppressSummary: false, note: '' }
  if (messages.length === 0) return continueDecision

  // 从右往左找「最后一条 user」；用 acc === -1 守住一旦命中就停止覆盖。
  const lastUserIndex = messages.reduceRight((acc, message, i) => (acc === -1 && message.role === 'user' ? i : acc), -1)
  if (lastUserIndex < 0) return continueDecision

  const query = messages[lastUserIndex]?.content ?? ''
  if (!query.trim()) return continueDecision

  // 明确的「换话题 / 重新开始」措辞，直接按全新请求处理。
  if (hasResetMarker(query)) {
    return { mode: 'fresh', retainFrom: lastUserIndex, suppressSummary: true, note: FRESH_CONTEXT_NOTE }
  }

  const queryDomain = classifyDomain(query)
  if (!queryDomain) return continueDecision

  const anchorText = messages
    .slice(Math.max(0, lastUserIndex - ANCHOR_TURNS), lastUserIndex)
    .map((message) => message.content)
    .join('\n')
  const anchorDomain = classifyDomain(anchorText)
  if (!anchorDomain) return continueDecision

  if (queryDomain.domain === anchorDomain.domain) return continueDecision

  // 主题不同：仅当当前问题没有引用前文（无共同意图词）时才判定为全新请求，否则仍按「继续」处理。
  if (intentOverlap(query, anchorText) === 0) {
    return { mode: 'fresh', retainFrom: lastUserIndex, suppressSummary: true, note: FRESH_CONTEXT_NOTE }
  }
  return continueDecision
}

interface TryResult {
  system: string
  messages: EngineeredContextMessage[]
  estimatedTokens: number
}

function tryEngineer(
  messages: ContextEngineMessage[],
  summary: string | undefined,
  system: string | undefined,
  windowSize: number,
  truncationMax: number,
): TryResult {
  const { prefix, recent } = splitWindow(messages, windowSize)
  const prefixSummary = buildPrefixSummary(prefix, summary)
  const compactedSystem = buildSystemPrompt({ userSystem: system, summary: prefixSummary })
  const engineeredMessages = recent.map((message, index) => {
    const isLast = index === recent.length - 1
    const max = isLast
      ? Math.max(LAST_MSG_MAX, truncationMax)
      : truncationMax
    return {
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: truncateMessageContent(message.content, max),
      ...(message.images?.length ? { images: message.images } : {}),
    }
  })
  const estimatedTokens = estimateTokens(compactedSystem)
    + engineeredMessages.reduce((total, message) => total + estimateTokens(message.content), 0)
  return { system: compactedSystem, messages: engineeredMessages, estimatedTokens }
}

export function engineerContext(input: EngineerContextInput): EngineerContextResult {
  const messages = input.messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  )
  // 主题相关性判定：fresh 时只保留当前这条消息、抑制摘要、并在末尾追加「独立新请求」说明。
  const decision = detectContextShift(messages)
  const baseMessages = decision.mode === 'fresh' ? messages.slice(decision.retainFrom) : messages
  const baseSummary = decision.suppressSummary ? undefined : (input.summary ?? undefined)

  const contextWindow = input.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const requestedMax = input.maxTokens ?? OUTPUT_RESERVE
  const reserve = Math.max(OUTPUT_RESERVE, requestedMax)
  const budget = Math.max(0, contextWindow - reserve)

  let windowSize = HISTORY_WINDOW
  let truncationMax = MSG_CONTENT_MAX
  let result = tryEngineer(baseMessages, baseSummary, input.system, windowSize, truncationMax)
  let iterations = 0
  while (result.estimatedTokens * SAFETY_MARGIN > budget && windowSize > 2 && iterations < 6) {
    windowSize = Math.max(2, Math.floor(windowSize / 2))
    truncationMax = Math.max(1_200, Math.floor(truncationMax / 2))
    result = tryEngineer(baseMessages, baseSummary, input.system, windowSize, truncationMax)
    iterations += 1
  }

  // 说明作为独立顶层区块追加，不混入【用户设定】。
  const system = decision.note ? [result.system, decision.note].filter(Boolean).join('\n\n') : result.system
  const maxTokens = Math.max(MIN_MAX_TOKENS, Math.min(requestedMax, contextWindow - result.estimatedTokens))
  return { system, messages: result.messages, maxTokens }
}
