// 联网搜索 —— 为「必要时保证 AI 返回正确、最新内容」提供统一检索能力。
//
// 设计（见 docs/ai-capability-design.md 的联网搜索节）分两条路：
// - anthropic 模型：直接用 Anthropic 服务端的 web_search 工具（模型自行决定何时检索、
//   如何在单流内执行，前端无需改动）。
// - openai-compatible 模型：网关只接受 type:'function' 工具，所以注入一个 web_search
//   函数工具，由本模块在服务端执行工具循环（模型发起 tool_calls → 用 Claude web_search
//   落地检索 → 把 tool 结果回填 → 继续），流式写回 OpenAI 格式 SSE。
//
// 本模块以纯函数为主（工具定义、SSE 解析、query 提取、round 上限），执行器 runWebSearch
// 是唯一的外部调用（走 Anthropic web_search，零新增 Key）。

export const ANTHROPIC_WEB_SEARCH_TOOL_TYPE = 'web_search_20260209'
export const WEB_SEARCH_TOOL_NAME = 'web_search'
// 工具循环最多落地这么多次检索，超出即在下一轮强制结束，避免模型无限精化查询递归。
export const MAX_WEB_SEARCH_ROUNDS = 2

export type AnthropicSearchConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

export interface OpenAiToolCallChunk {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

export interface OpenAiAccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

export interface OpenAiStreamAccumulator {
  content: string
  toolCalls: OpenAiAccumulatedToolCall[]
  finishReason: string | null
  done: boolean
}

export interface WebSearchChatMessage {
  role: string
  content?: string | null
  tool_calls?: unknown[]
  tool_call_id?: string
}

export interface WebSearchRoundRequest {
  url: string
  headers: Headers
  body: string | FormData | null
}

export type WebSearchRequestBuilder = (
  messages: WebSearchChatMessage[],
  modelId: string,
  params: { reasoningEffort?: string; maxTokens?: number } | undefined,
) => WebSearchRoundRequest

export type WebSearchExecutor = (query: string) => Promise<string>

export function buildAnthropicWebSearchTools(maxUses = 3): unknown[] {
  return [
    {
      type: ANTHROPIC_WEB_SEARCH_TOOL_TYPE,
      name: WEB_SEARCH_TOOL_NAME,
      max_uses: maxUses,
    },
  ]
}

export function buildOpenAiWebSearchTool(): unknown[] {
  return [
    {
      type: 'function',
      function: {
        name: WEB_SEARCH_TOOL_NAME,
        description:
          '联网检索最新、实时或事实性问题，返回权威来源的摘要。当用户的提问涉及最新信息、时效性问题、或需要核实事实时使用。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词，应精炼并突出核心实体与时间' },
          },
          required: ['query'],
        },
      },
    },
  ]
}

export function createOpenAiStreamAccumulator(): OpenAiStreamAccumulator {
  return { content: '', toolCalls: [], finishReason: null, done: false }
}

// 把单个 choices[0].delta 累积进 acc。content 逐段拼（并即时回调，保证流式）；tool_calls
// 按 index 补齐槽位，id/name/arguments 跨 chunk 拼接（网关可能把 JSON 参数拆成多段）。
export function applyOpenAiDelta(
  acc: OpenAiStreamAccumulator,
  delta: { content?: unknown; tool_calls?: OpenAiToolCallChunk[] },
  onContent?: (text: string) => void,
): void {
  if (typeof delta.content === 'string' && delta.content) {
    acc.content += delta.content
    onContent?.(delta.content)
  }
  if (Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      const index = tc.index ?? 0
      let slot = acc.toolCalls[index]
      if (!slot) {
        slot = { id: '', name: '', arguments: '' }
        acc.toolCalls[index] = slot
      }
      if (tc.id) slot.id += tc.id
      if (tc.function?.name) slot.name += tc.function.name
      if (tc.function?.arguments) slot.arguments += tc.function.arguments
    }
  }
}

// 从累积的 tool_call 里提取查询词：优先取 JSON 的 query 字段，参数非 JSON 时兜底整段文本。
export function extractWebSearchQuery(toolCall: OpenAiAccumulatedToolCall): string {
  const raw = toolCall.arguments?.trim() ?? ''
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { query?: unknown }
      if (typeof parsed.query === 'string' && parsed.query.trim()) return parsed.query.trim()
    } catch {
      // 非 JSON：当作裸查询词兜底
    }
    if (raw && raw !== 'null' && raw !== 'undefined') return raw
  }
  return ''
}

// 把一帧 OpenAI SSE 文本处理进 acc，遇 [DONE] 置 done。SSE 帧可能含多行 data:。
function handleOpenAiFrame(
  acc: OpenAiStreamAccumulator,
  frame: string,
  onContent?: (text: string) => void,
): void {
  for (const line of frame.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice('data:'.length).trimStart()
    if (data === '[DONE]') {
      acc.done = true
      continue
    }
    if (!data) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      continue
    }
    const choice = (parsed as { choices?: { delta?: unknown; finish_reason?: string | null }[] })?.choices?.[0]
    if (!choice) continue
    applyOpenAiDelta(acc, (choice.delta ?? {}) as { content?: unknown; tool_calls?: OpenAiToolCallChunk[] }, onContent)
    if (choice.finish_reason) acc.finishReason = choice.finish_reason
  }
}

// 读取一个 OpenAI 格式 SSE 流，增量返回累积结果；每段正文通过 onContent 回调逐字吐出（流式）。
// 遇 AbortError（客户端断开）静默返回已累积内容。
export async function readOpenAiStream(
  stream: ReadableStream<Uint8Array>,
  onContent?: (text: string) => void,
  signal?: AbortSignal,
): Promise<OpenAiStreamAccumulator> {
  const acc = createOpenAiStreamAccumulator()
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!acc.done) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while (!acc.done && (sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        if (!frame.trim()) continue
        handleOpenAiFrame(acc, frame, onContent)
      }
    }
    if (!acc.done && buffer.trim()) handleOpenAiFrame(acc, buffer, onContent)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      acc.done = true
      return acc
    }
    // 流中途出错：返回已累积的正文，调用方据此决定是否回退。
    acc.done = true
    return acc
  } finally {
    reader.releaseLock()
  }
  return acc
}

export interface WebSearchAssistantTurn {
  content: string | null
  toolCalls: OpenAiAccumulatedToolCall[]
}

export interface WebSearchToolResult {
  id: string
  content: string
}

// 拼装工具循环下一轮的 messages：追加 assistant（含 tool_calls）+ 各 tool 结果消息。
export function appendToolLoopMessages(
  messages: WebSearchChatMessage[],
  assistant: WebSearchAssistantTurn,
  results: WebSearchToolResult[],
): WebSearchChatMessage[] {
  const assistantMessage: WebSearchChatMessage = { role: 'assistant', content: assistant.content }
  if (assistant.toolCalls.length) {
    assistantMessage.tool_calls = assistant.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    }))
  }
  const toolMessages: WebSearchChatMessage[] = results.map((r) => ({
    role: 'tool',
    tool_call_id: r.id,
    content: r.content,
  }))
  return [...messages, assistantMessage, ...toolMessages]
}

// 执行一次检索落地：让 Claude 用 web_search 工具对给定 query 检索，返回模型给出的
// 带来源的摘要文本（服务端已加密 snippet，模型侧仍可见原文，我们取它给出的 grounded 回答）。
export async function runWebSearch(query: string, config: AnthropicSearchConfig): Promise<string> {
  const body = JSON.stringify({
    model: config.model,
    max_tokens: 1_024,
    messages: [
      {
        role: 'user',
        content: `请使用 web_search 工具联网检索，并基于检索结果、用与查询相同的语言给出简明、准确、附来源的摘要：\n\n${query}`,
      },
    ],
    tools: buildAnthropicWebSearchTools(1),
  })
  const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: new Headers({
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'User-Agent': 'claude-cli/2.0.0 (external, cli)',
      'x-app': 'cli',
      'x-stainless-lang': 'js',
      'x-stainless-runtime': 'node',
    }),
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    return `（联网检索失败：${res.status} ${text}）`
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  const texts = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .filter(Boolean)
  return texts.join('\n') || '（未获取到检索结果）'
}
