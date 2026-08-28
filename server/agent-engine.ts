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
export const MAX_AGENT_ROUNDS = 3

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
          writeContent(controller, '\n（已连续调用工具，以下为本地生成结果）')
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
            try {
              content = await tool.execute(tc.arguments)
            } catch (e) {
              content = `（工具 ${tc.name} 出错：${e instanceof Error ? e.message : String(e)}）`
            }
          }
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
      return `（web_fetch 获取失败：${e instanceof Error ? e.message : String(e)}）`
    }
    if (!res.ok) return `（web_fetch 返回 ${res.status}）`
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
