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

const BASE_SYSTEM = '你是 Lab-Studio 的 AI 助手。请用与用户相同的语言回答，内容准确、清晰、可执行；信息不足时明确说明，不要编造。'

export interface EngineeredContextMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EngineerContextInput {
  messages: { role: string; content: string }[]
  system?: string
  summary?: string
  contextWindow?: number | null
  maxTokens?: number
}

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
  messages: { role: string; content: string }[],
  windowSize: number,
): { prefix: { role: string; content: string }[]; recent: { role: string; content: string }[] } {
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

interface TryResult {
  system: string
  messages: EngineeredContextMessage[]
  estimatedTokens: number
}

function tryEngineer(
  messages: { role: string; content: string }[],
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
  const contextWindow = input.contextWindow ?? DEFAULT_CONTEXT_WINDOW
  const requestedMax = input.maxTokens ?? OUTPUT_RESERVE
  const reserve = Math.max(OUTPUT_RESERVE, requestedMax)
  const budget = Math.max(0, contextWindow - reserve)

  let windowSize = HISTORY_WINDOW
  let truncationMax = MSG_CONTENT_MAX
  let result = tryEngineer(messages, input.summary, input.system, windowSize, truncationMax)
  let iterations = 0
  while (result.estimatedTokens * SAFETY_MARGIN > budget && windowSize > 2 && iterations < 6) {
    windowSize = Math.max(2, Math.floor(windowSize / 2))
    truncationMax = Math.max(1_200, Math.floor(truncationMax / 2))
    result = tryEngineer(messages, input.summary, input.system, windowSize, truncationMax)
    iterations += 1
  }

  const maxTokens = Math.max(MIN_MAX_TOKENS, Math.min(requestedMax, contextWindow - result.estimatedTokens))
  return { system: result.system, messages: result.messages, maxTokens }
}
