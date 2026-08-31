// Agent 工具循环 —— 把「联网搜索」写死的单工具循环，推广成通用服务端工具循环 +
// 工具注册表。模型可在同一轮回合发起多个、多种工具调用；服务端读流 → 累积 tool_calls
// → 按注册表分发执行 → 回填结果 → 继续，直到无工具调用或到轮次上限。
//
// 设计（见 docs/superpowers/specs/2026-08-29-agent-tool-loop-design.md）：
// - 纯函数为主：SSE 归一化读取、工具定义构建、消息回填、循环编排都不依赖外部 IO；
//   外部 IO（联网、抓取、行情）注入在 executor。
// - 对用户不可见：工具是让模型答得更准的「管道」，前端只收纯文本 SSE。
// - 双 provider 归一化：readOpenAiTurn / readAnthropicTurn 都产出统一的 AgentTurn，
//   让 runAgentLoop 对 openai-compatible 与 anthropic 通用。

import { readOpenAiStream, runWebSearch, type AnthropicSearchConfig } from './web-search'
import { agentFinanceQuote } from './finance'

export interface AgentTool {
  name: string
  description: string
  /** JSON Schema（参数）—— 既用于生成发给上游的工具定义，也用于分发执行。 */
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<string>
}

export type AgentToolRegistry = Record<string, AgentTool>

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentTurn {
  content: string
  toolCalls: AgentToolCall[]
  finishReason: string | null
  done: boolean
}

export interface AgentChatMessage {
  role: string
  content?: unknown
  tool_calls?: unknown[]
  tool_call_id?: string
}

export interface AgentRoundRequest {
  url: string
  headers: Headers
  body: string | FormData | null
}

export interface AgentToolResult {
  id: string
  name?: string
  content: string
}

export type AgentProvider = 'openai-compatible' | 'anthropic'

// 每轮最多落地这么多次工具调用，超出即在下一轮强制结束，避免模型无限精化工具查询递归。
// 多步任务（如「先搜背景再查行情再汇总」）往往需要超过 3 轮，放宽到 8 轮，超出才收尾。
export const MAX_AGENT_ROUNDS = 8
// tool_call 事件里返回预览的最大长度，避免把工具大结果（如 web_fetch 全文）原样塞进 SSE。
export const TOOL_CALL_RESULT_PREVIEW = 200

// 追加到「本轮有工具可用」的系统提示里，指导模型自主决定是否调工具，并忠实转述工具结果。
export const AGENT_TOOL_GUIDANCE = `你可以在回答中使用工具获取实时、外部或精确的信息。是否需要调用工具，由你自己判断，不必等用户点明工具名：

- 用户索要当前时刻数据（天气、行情、实时新闻/事件、正在发生的事）或你没把握的精确事实时，应当优先调用工具，而不是凭记忆编造。
- 用户没说用哪个工具也要判断：只要「查一下」就能答得更准，就用对应的工具；闲聊、常识、观点、创作等无需外部信息的，不要为了用而用。
- 一次回合可以并行调用多个互不依赖的工具，再综合结果作答。
- 工具返回后，你必须忠实转述真实结果：数字、状况、结论都以工具返回为准，不得编造、润色成与结果不符的内容。
- 若工具查询失败或未命中（例如查无此地），如实说明，并给用户可操作的下一步建议，绝不能假装查到了。
- 较复杂的多步任务，先用 agent_plan 列出步骤清单，再逐步执行；每完成一步，用 agent_plan 把该步标为已完成（done），让用户看到你的进度。不要把所有步骤堆在大段文字里。
- 用简洁的中文把工具结果整理成面向用户的回答。`

// ---- 瞬态失败重试 ----
//
// Claude Code 对一次失败的工具操作会重试再判定，而不是把第一次错误直接抛给模型。
// 我们只重试「瞬态」失败（网络抖动、5xx、超时），这类重试一次往往就能成功；
// 参数错误等非瞬态失败立即上抛，不浪费轮次。

export class TransientToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransientToolError'
  }
}

// 判定一个错误是否值得重试：网络/超时/连接类、以及 5xx 属于瞬态；4xx、解析错误等不是。
export function isTransientError(e: unknown): boolean {
  if (e instanceof TransientToolError) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /fetch |network|网络|timeout|timed out|ECONNRESET|ETIMEDOUT|ECONNREFUSED|abort|5\d\d|503|502|504|gateway/i.test(msg)
}

// 包装一次工具执行：遇到瞬态错误重试（默认最多 2 次尝试 = 重试 1 次），退避递增；非瞬态或已重试完仍失败则上抛最后一次错误。
export async function runWithRetry(
  execute: AgentTool['execute'],
  args: Record<string, unknown>,
  opts?: { attempts?: number; backoffMs?: number; isTransient?: (e: unknown) => boolean },
): Promise<string> {
  const attempts = Math.max(1, opts?.attempts ?? 2)
  const backoffMs = opts?.backoffMs ?? 150
  const isTransient = opts?.isTransient ?? isTransientError
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await execute(args)
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, backoffMs * (i + 1)))
    }
  }
  throw lastErr
}

// ---- agent_plan：可见的任务规划（TodoWrite 式） ----
//
// Claude Code 会先把复杂任务拆成可见的待办清单，再逐步推进。这里给模型一个 agent_plan
// 工具：任务分多步时先声明清单，每完成一步再调用一次更新状态。工具调用痕迹本身就会在
// 前端把「AI 在按计划推进」展示给用户，让 agent 的过程从不可见变得可跟踪。

export type PlanTaskStatus = 'pending' | 'in_progress' | 'done'
export interface PlanTask {
  text: string
  status?: PlanTaskStatus
}

function parsePlanTasks(value: unknown): PlanTask[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .map((t) => {
      const status: PlanTaskStatus =
        t.status === 'done' || t.status === 'in_progress' ? t.status : 'pending'
      return {
        text: typeof t.text === 'string' ? t.text.trim() : '',
        status,
      }
    })
    .filter((t) => t.text)
}

// 把任务清单渲染成一行一步、带状态标记的简洁文本，既作为工具结果回填给模型，也作为用户可见的计划卡。
export function renderPlan(tasks: PlanTask[]): string {
  if (!tasks.length) return '（计划为空）'
  const lines = tasks.map((t, i) => {
    const mark = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◐' : '○'
    return `${mark} ${i + 1}. ${t.text}`
  })
  return `计划（${tasks.length} 步）：\n${lines.join('\n')}`
}

export function createPlanExecutor(): AgentTool['execute'] {
  return async (args) => renderPlan(parsePlanTasks(args?.tasks))
}

// 把「当前日期/时间」格式化为可读中文串，用于 current_date 工具与工具系统提示（注入今天基准日期）。
export function formatAgentCurrentDate(now: Date, tz?: string): string {
  const resolvedTz = tz ?? (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: resolvedTz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const timeStr = new Intl.DateTimeFormat('zh-CN', { timeZone: resolvedTz || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: resolvedTz || undefined, weekday: 'long' }).format(now)
  return `今天是 ${dateStr}（${weekday}）${timeStr}${resolvedTz ? `（${resolvedTz}）` : ''}`
}

// ---- 工具参数解析 ----

// 把上游下发的工具参数（JSON 字符串）解析成对象；非 JSON 时兜底为 { raw: 原文 }。
function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  const text = (raw ?? '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    return { raw: parsed }
  } catch {
    return { raw: text }
  }
}

// ---- 归一化读取：openai-compatible ----

export async function readOpenAiTurn(
  stream: ReadableStream<Uint8Array>,
  onContent?: (text: string) => void,
  signal?: AbortSignal,
): Promise<AgentTurn> {
  const acc = await readOpenAiStream(stream, onContent, signal)
  const toolCalls = acc.toolCalls
    .filter((tc) => tc.name)
    .map((tc) => ({ id: tc.id, name: tc.name, arguments: parseToolArgs(tc.arguments) }))
  return { content: acc.content, toolCalls, finishReason: acc.finishReason, done: acc.done }
}

// ---- 归一化读取：anthropic ----

interface AnthropicStreamState {
  content: string
  toolBuffer: Record<number, { id: string; name: string; argsJson: string }>
  finishReason: string | null
  done: boolean
}

function applyAnthropicJson(
  state: AnthropicStreamState,
  parsed: unknown,
  onContent?: (text: string) => void,
): void {
  if (!parsed || typeof parsed !== 'object') return
  const evt = parsed as Record<string, unknown>
  const type = evt.type
  if (type === 'content_block_start') {
    const block = (evt.content_block ?? {}) as Record<string, unknown>
    if (block.type === 'tool_use') {
      const index = typeof evt.index === 'number' ? evt.index : 0
      const input = block.input
      // 流式下 input 也常先给空对象占位，真正的 JSON 靠 input_json_delta 补全；
      // 仅当 start 块已给出非空 input 时才用它作为初始 JSON，否则从空串开始累积。
      const isNonEmpty =
        input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input as object).length > 0
      state.toolBuffer[index] = {
        id: typeof block.id === 'string' ? block.id : '',
        name: typeof block.name === 'string' ? block.name : '',
        argsJson: isNonEmpty ? JSON.stringify(input) : '',
      }
    }
  } else if (type === 'content_block_delta') {
    const delta = (evt.delta ?? {}) as Record<string, unknown>
    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
      state.content += delta.text
      onContent?.(delta.text)
    } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
      const index = typeof evt.index === 'number' ? evt.index : 0
      const slot = state.toolBuffer[index]
      if (slot) slot.argsJson += delta.partial_json
    }
  } else if (type === 'message_delta') {
    const delta = (evt.delta ?? {}) as Record<string, unknown>
    if (typeof delta.stop_reason === 'string') state.finishReason = delta.stop_reason
  } else if (type === 'message_stop') {
    state.done = true
  }
}

function finalizeAnthropicTurn(state: AnthropicStreamState): AgentTurn {
  const toolCalls = Object.values(state.toolBuffer)
    .filter((tc) => tc.name)
    .map((tc) => ({ id: tc.id, name: tc.name, arguments: parseToolArgs(tc.argsJson) }))
  return { content: state.content, toolCalls, finishReason: state.finishReason, done: state.done }
}

export async function readAnthropicTurn(
  stream: ReadableStream<Uint8Array>,
  onContent?: (text: string) => void,
  signal?: AbortSignal,
): Promise<AgentTurn> {
  const state: AnthropicStreamState = { content: '', toolBuffer: {}, finishReason: null, done: false }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const processFrame = (frame: string) => {
    for (const line of frame.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice('data:'.length).trimStart()
      if (!data) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(data)
      } catch {
        continue
      }
      applyAnthropicJson(state, parsed, onContent)
    }
  }

  try {
    while (!state.done) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while (!state.done && (sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        if (frame.trim()) processFrame(frame)
      }
    }
    if (!state.done && buffer.trim()) processFrame(buffer)
  } catch (e) {
    state.done = true
    return finalizeAnthropicTurn(state)
  } finally {
    reader.releaseLock()
  }
  return finalizeAnthropicTurn(state)
}

// ---- 工具定义构建 ----

export function buildOpenAiTools(registry: AgentToolRegistry): unknown[] {
  return Object.values(registry).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

export function buildAnthropicTools(registry: AgentToolRegistry): unknown[] {
  return Object.values(registry).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
}

// ---- 消息回填 ----

export function appendToolMessages(
  messages: AgentChatMessage[],
  turn: AgentTurn,
  results: AgentToolResult[],
  provider: AgentProvider,
): AgentChatMessage[] {
  if (provider === 'anthropic') {
    const assistantContent: unknown[] = []
    if (turn.content) assistantContent.push({ type: 'text', text: turn.content })
    for (const tc of turn.toolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
    }
    const assistantMsg: AgentChatMessage = { role: 'assistant', content: assistantContent }
    const toolResultMsg: AgentChatMessage = {
      role: 'user',
      content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })),
    }
    return [...messages, assistantMsg, toolResultMsg]
  }

  const assistantMessage: AgentChatMessage = { role: 'assistant', content: turn.content || null }
  if (turn.toolCalls.length) {
    assistantMessage.tool_calls = turn.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
    }))
  }
  const toolMessages: AgentChatMessage[] = results.map((r) => ({
    role: 'tool',
    tool_call_id: r.id,
    content: r.content,
  }))
  return [...messages, assistantMessage, ...toolMessages]
}

// ---- 统一编排 ----

export function runAgentLoop(opts: {
  provider: AgentProvider
  initialMessages: AgentChatMessage[]
  modelId: string
  params?: { reasoningEffort?: string; maxTokens?: number }
  registry: AgentToolRegistry
  buildRequest: (
    messages: AgentChatMessage[],
    modelId: string,
    params?: { reasoningEffort?: string; maxTokens?: number },
  ) => AgentRoundRequest
  readTurn: (stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void, signal?: AbortSignal) => Promise<AgentTurn>
  initialResponse: Response
  maxRounds: number
  signal?: AbortSignal
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const writeContent = (controller: ReadableStreamDefaultController<Uint8Array>, text: string) => {
    if (!text) return
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`))
    } catch {
      // 客户端已断开：停止写入即可，后续 fetch 会被 signal 中止。
    }
  }
  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    } catch {
      // 客户端已断开
    }
  }
  // 每次执行工具时吐一条 tool_call 事件，前端据此渲染「模型调了哪个工具、入参、
  // 返回预览」，让 agent 的工具使用对用户可见。内置工具与 MCP 工具通用。
  // status: 'running'（开始执行）→ 'done'（拿到结果），前端据此做「正在调用…」→「结果」动效。
  const writeToolCall = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    name: string,
    args: Record<string, unknown>,
    result: string,
    status: 'running' | 'done',
  ) => {
    const preview = status === 'done' && result.length > TOOL_CALL_RESULT_PREVIEW
      ? `${result.slice(0, TOOL_CALL_RESULT_PREVIEW)}…`
      : result
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_call: { name, arguments: args ?? {}, result: preview, status } })}\n\n`))
    } catch {
      // 客户端已断开
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let messages = opts.initialMessages
      let rounds = 0
      let currentRes = opts.initialResponse

      while (true) {
        const turn = await opts.readTurn(
          currentRes.body ?? new ReadableStream<Uint8Array>(),
          (text) => writeContent(controller, text),
          opts.signal,
        )
        if (turn.toolCalls.length === 0) {
          close(controller)
          return
        }
        if (rounds >= opts.maxRounds) {
          writeContent(controller, '\n（已连续调用工具，本轮先用已有信息作答）')
          close(controller)
          return
        }
        const results: AgentToolResult[] = []
        for (const tc of turn.toolCalls) {
          const tool = opts.registry[tc.name]
          let content: string
          if (!tool) {
            content = `（工具 ${tc.name} 不存在）`
          } else {
            writeToolCall(controller, tc.name, tc.arguments, '', 'running')
            try {
              // 瞬态失败（网络抖动/5xx/超时）内部重试一次，再交给模型；避免把一次抖动误判成失败。
              content = await runWithRetry(tool.execute, tc.arguments)
            } catch (e) {
              content = `（工具 ${tc.name} 出错：${e instanceof Error ? e.message : String(e)}）`
            }
          }
          writeToolCall(controller, tc.name, tc.arguments, content, 'done')
          results.push({ id: tc.id, name: tc.name, content })
        }
        messages = appendToolMessages(messages, turn, results, opts.provider)
        rounds += 1
        const req = opts.buildRequest(messages, opts.modelId, opts.params)
        let res: Response
        try {
          res = await fetch(req.url, {
            method: 'POST',
            headers: req.headers,
            body: req.body,
            signal: opts.signal,
          })
        } catch {
          writeContent(controller, '\n（工具循环重连失败）')
          close(controller)
          return
        }
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => res.statusText)
          writeContent(controller, `\n（工具循环下一轮失败：${errText || res.status}）`)
          close(controller)
          return
        }
        currentRes = res
      }
    },
  })
}

// ---- 三个首批工具的 executor ----

const WEB_FETCH_MAX_CHARS = 4_000
const WEB_FETCH_TIMEOUT_MS = 10_000

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function createWebFetchExecutor(): AgentTool['execute'] {
  return async (args) => {
    const url = typeof args.url === 'string' ? args.url.trim() : ''
    if (!url) return '（web_fetch 需要 url 参数）'
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return `（web_fetch 收到无效 URL：${url}）`
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `（web_fetch 仅支持 http/https，收到 ${parsed.protocol}）`
    }
    let res: Response
    try {
      res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (LabStudio agent)' },
        signal: AbortSignal.timeout(WEB_FETCH_TIMEOUT_MS),
      })
    } catch (e) {
      // 网络抖动/超时属于瞬态，抛给 runWithRetry 重试一次再判定，而不是直接判失败。
      throw new TransientToolError(`web_fetch 获取失败：${e instanceof Error ? e.message : String(e)}`)
    }
    // 5xx 是服务端临时抖动，值得重试；4xx（404/403 等）是确定性问题，直接如实返回。
    if (!res.ok) {
      if (res.status >= 500) throw new TransientToolError(`web_fetch 返回 ${res.status}`)
      return `（web_fetch 返回 ${res.status}）`
    }
    const text = await res.text().catch(() => '')
    const stripped = stripHtml(text)
    return stripped.length > WEB_FETCH_MAX_CHARS
      ? `${stripped.slice(0, WEB_FETCH_MAX_CHARS)}\n…（已截断）`
      : stripped
  }
}

export function createWebSearchExecutor(config: AnthropicSearchConfig): AgentTool['execute'] {
  return async (args) => {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (!query) return '（未提供有效的搜索关键词）'
    return runWebSearch(query, config)
  }
}

export function createFinanceQuoteExecutor(): AgentTool['execute'] {
  return async (args) => {
    const q = typeof args.q === 'string' ? args.q.trim() : ''
    return agentFinanceQuote(q)
  }
}
