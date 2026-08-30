import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendToolMessages,
  buildAnthropicTools,
  buildOpenAiTools,
  createFinanceQuoteExecutor,
  createWebFetchExecutor,
  readAnthropicTurn,
  readOpenAiTurn,
  runAgentLoop,
  type AgentChatMessage,
  type AgentToolRegistry,
  type AgentTurn,
} from '../server/agent-engine'
import { agentFinanceQuote, formatQuotesSummary, type Quote } from '../server/finance'

const encoder = new TextEncoder()

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function makeQuote(partial: Partial<Quote>): Quote {
  return {
    symbol: '',
    name: '',
    code: '',
    price: 0,
    prevClose: 0,
    change: 0,
    pct: 0,
    open: 0,
    high: 0,
    low: 0,
    volume: 0,
    amount: 0,
    time: '',
    turnover: 0,
    amplitude: 0,
    volumeRatio: 0,
    pe: 0,
    totalMarketCap: 0,
    floatMarketCap: 0,
    ...partial,
  }
}

test('buildOpenAiTools produces type:function shapes from the registry', () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '查行情', parameters: { type: 'object', properties: {} }, execute: async () => '' },
  }
  const tools = buildOpenAiTools(registry) as { type: string; function: { name: string } }[]
  assert.equal(tools.length, 1)
  assert.equal(tools[0]?.type, 'function')
  assert.equal(tools[0]?.function?.name, 'finance_quote')
})

test('buildAnthropicTools produces client-tool shapes from the registry', () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '查行情', parameters: { type: 'object', properties: {} }, execute: async () => '' },
  }
  const tools = buildAnthropicTools(registry) as { name: string; input_schema: unknown; description: string }[]
  assert.equal(tools.length, 1)
  assert.equal(tools[0]?.name, 'finance_quote')
  assert.deepEqual(tools[0]?.input_schema, { type: 'object', properties: {} })
})

test('appendToolMessages openai-compatible appends assistant tool_calls + tool messages', () => {
  const initial: AgentChatMessage[] = [{ role: 'user', content: 'hi' }]
  const turn: AgentTurn = {
    content: '我来查',
    toolCalls: [
      { id: 'c1', name: 'finance_quote', arguments: { q: '600519' } },
      { id: 'c2', name: 'web_fetch', arguments: { url: 'https://x.com' } },
    ],
    finishReason: 'tool_calls',
    done: true,
  }
  const messages = appendToolMessages(
    initial,
    turn,
    [
      { id: 'c1', name: 'finance_quote', content: '贵州茅台 1500.00' },
      { id: 'c2', name: 'web_fetch', content: '正文…' },
    ],
    'openai-compatible',
  )
  assert.equal(messages[0]?.role, 'user')
  const assistant = messages[1] as AgentChatMessage & { tool_calls: { id: string; function: { name: string; arguments: string } }[] }
  assert.equal(assistant.role, 'assistant')
  assert.equal(assistant.tool_calls.length, 2)
  assert.equal(assistant.tool_calls[0]?.function?.arguments, '{"q":"600519"}')
  const toolMsgs = messages.slice(2)
  assert.equal(toolMsgs.length, 2)
  assert.deepEqual(
    toolMsgs.map((m) => (m as { role: string; tool_call_id: string }).role),
    ['tool', 'tool'],
  )
  assert.equal((toolMsgs[0] as { content: string }).content, '贵州茅台 1500.00')
})

test('appendToolMessages anthropic appends tool_use content + tool_result blocks', () => {
  const initial: AgentChatMessage[] = [{ role: 'user', content: 'hi' }]
  const turn: AgentTurn = {
    content: '我来查',
    toolCalls: [{ id: 'toolu_1', name: 'finance_quote', arguments: { q: '600519' } }],
    finishReason: 'tool_use',
    done: true,
  }
  const messages = appendToolMessages(initial, turn, [{ id: 'toolu_1', name: 'finance_quote', content: '贵州茅台 1500.00' }], 'anthropic')
  const assistant = messages[1] as AgentChatMessage & { content: { type: string; id?: string; name?: string; input?: unknown }[] }
  assert.equal(assistant.role, 'assistant')
  const toolUse = assistant.content.find((c) => c.type === 'tool_use')
  assert.ok(toolUse, 'has a tool_use block')
  assert.equal(toolUse?.id, 'toolu_1')
  assert.equal(toolUse?.name, 'finance_quote')
  assert.deepEqual(toolUse?.input, { q: '600519' })
  const toolResult = messages[2] as AgentChatMessage & { content: { type: string; tool_use_id: string; content: string }[] }
  assert.equal(toolResult.role, 'user')
  assert.equal(toolResult.content[0]?.type, 'tool_result')
  assert.equal(toolResult.content[0]?.tool_use_id, 'toolu_1')
})

test('readOpenAiTurn accumulates text and multiple tool_calls by index, stops at [DONE]', async () => {
  const stream = toStream([
    'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"finance_quote","arguments":"{\\"q\\":\\"贵州"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"茅台\\"}"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
    'data: [DONE]\n\n',
  ])
  const streamed: string[] = []
  const turn = await readOpenAiTurn(stream, (text) => streamed.push(text))
  assert.equal(turn.content, '你好')
  assert.equal(turn.toolCalls.length, 1)
  assert.equal(turn.toolCalls[0]?.name, 'finance_quote')
  assert.deepEqual(turn.toolCalls[0]?.arguments, { q: '贵州茅台' })
  assert.equal(turn.finishReason, 'tool_calls')
  assert.equal(turn.done, true)
  assert.deepEqual(streamed, ['你', '好'])
})

test('readAnthropicTurn accumulates text_delta and tool_use via input_json_delta', async () => {
  const stream = toStream([
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}\n\n',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"世界"}}\n\n',
    'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"finance_quote","input":{}}}\n\n',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"q\\":"}}\n\n',
    'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"贵州茅台\\"}"}}\n\n',
    'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
    'data: {"type":"message_stop"}\n\n',
  ])
  const streamed: string[] = []
  const turn = await readAnthropicTurn(stream, (text) => streamed.push(text))
  assert.equal(turn.content, '你好世界')
  assert.equal(turn.toolCalls.length, 1)
  assert.equal(turn.toolCalls[0]?.id, 'toolu_1')
  assert.equal(turn.toolCalls[0]?.name, 'finance_quote')
  assert.deepEqual(turn.toolCalls[0]?.arguments, { q: '贵州茅台' })
  assert.equal(turn.finishReason, 'tool_use')
  assert.equal(turn.done, true)
  assert.deepEqual(streamed, ['你好', '世界'])
})

test('runAgentLoop dispatches multiple tools in one round, streams content, and loops', async () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '', parameters: {}, execute: async (args) => `quote:${args.q}` },
    web_fetch: { name: 'web_fetch', description: '', parameters: {}, execute: async (args) => `fetch:${args.url}` },
  }
  const turns: AgentTurn[] = [
    {
      content: '前期正文',
      toolCalls: [
        { id: 'c1', name: 'finance_quote', arguments: { q: '600519' } },
        { id: 'c2', name: 'web_fetch', arguments: { url: 'https://x.com' } },
      ],
      finishReason: 'tool_calls',
      done: true,
    },
    { content: '最终答案', toolCalls: [], finishReason: 'stop', done: true },
  ]
  let idx = 0
  const readTurn = async (_stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void) => {
    const turn = turns[idx++]
    if (turn.content) onContent?.(turn.content)
    return turn
  }
  const builtMessages: unknown[][] = []
  const buildRequest = (messages: unknown[]) => {
    builtMessages.push(messages)
    return { url: 'http://upstream.test', headers: new Headers(), body: JSON.stringify({ messages }) }
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('')
  let consumed = ''
  try {
    const out = runAgentLoop({
      provider: 'openai-compatible',
      initialMessages: [{ role: 'user', content: 'hi' }],
      modelId: 'm',
      params: {},
      registry,
      buildRequest,
      readTurn,
      initialResponse: new Response(''),
      maxRounds: 3,
    })
    const parts: string[] = []
    for await (const chunk of out) parts.push(new TextDecoder().decode(chunk))
    consumed = parts.join('')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.ok(consumed.includes('前期正文'))
  assert.ok(consumed.includes('最终答案'))
  assert.ok(consumed.endsWith('data: [DONE]\n\n'))
  assert.equal(builtMessages.length, 1)
  const messages = builtMessages[0] as AgentChatMessage[]
  const assistant = messages.find((m) => m.role === 'assistant') as AgentChatMessage & { tool_calls: unknown[] }
  assert.equal(assistant.tool_calls?.length, 2)
  const toolMsgs = messages.filter((m) => m.role === 'tool')
  assert.equal(toolMsgs.length, 2)
  assert.ok(toolMsgs.some((m) => (m.content as string).startsWith('quote:')))
  assert.ok(toolMsgs.some((m) => (m.content as string).startsWith('fetch:')))
})

test('runAgentLoop emits a tool_call event per executed tool, truncating the result preview', async () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '', parameters: {}, execute: async () => 'x'.repeat(300) },
  }
  const turns: AgentTurn[] = [
    { content: '准备调用', toolCalls: [{ id: 'c1', name: 'finance_quote', arguments: { q: '600519' } }], finishReason: 'tool_calls', done: true },
    { content: '最终答案', toolCalls: [], finishReason: 'stop', done: true },
  ]
  let idx = 0
  const readTurn = async (_stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void) => {
    const turn = turns[idx++]
    if (turn.content) onContent?.(turn.content)
    return turn
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('')
  let consumed = ''
  try {
    const out = runAgentLoop({
      provider: 'openai-compatible',
      initialMessages: [{ role: 'user', content: 'hi' }],
      modelId: 'm',
      params: {},
      registry,
      buildRequest: () => ({ url: 'http://upstream.test', headers: new Headers(), body: '' }),
      readTurn,
      initialResponse: new Response(''),
      maxRounds: 3,
    })
    const parts: string[] = []
    for await (const chunk of out) parts.push(new TextDecoder().decode(chunk))
    consumed = parts.join('')
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.ok(consumed.includes('"tool_call"'))
  assert.ok(consumed.includes('"name":"finance_quote"'))
  assert.ok(consumed.includes('"arguments":{"q":"600519"}'))
  // 结果预览截断到 TOOL_CALL_RESULT_PREVIEW(200) + 省略号。
  const previewMatch = consumed.match(/"result":"(x+)…"/)
  assert.ok(previewMatch, 'should contain a truncated result preview ending with …')
  assert.equal(previewMatch?.[1]?.length, 200)
})

test('runAgentLoop falls back gracefully when the tool is not registered', async () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '', parameters: {}, execute: async (args) => `quote:${args.q}` },
  }
  const turns: AgentTurn[] = [
    { content: '', toolCalls: [{ id: 'c1', name: 'missing_tool', arguments: {} }], finishReason: 'tool_calls', done: true },
    { content: '好', toolCalls: [], finishReason: 'stop', done: true },
  ]
  let idx = 0
  const readTurn = async (_stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void) => {
    const turn = turns[idx++]
    if (turn.content) onContent?.(turn.content)
    return turn
  }
  const builtMessages: unknown[][] = []
  const buildRequest = (messages: unknown[]) => {
    builtMessages.push(messages)
    return { url: 'http://upstream.test', headers: new Headers(), body: JSON.stringify({ messages }) }
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('')
  try {
    const out = runAgentLoop({
      provider: 'openai-compatible',
      initialMessages: [{ role: 'user', content: 'hi' }],
      modelId: 'm',
      params: {},
      registry,
      buildRequest,
      readTurn,
      initialResponse: new Response(''),
      maxRounds: 3,
    })
    for await (const _ of out) {
      // consume
    }
  } finally {
    globalThis.fetch = originalFetch
  }
  const messages = builtMessages[0] as AgentChatMessage[]
  const toolMsgs = messages.filter((m) => m.role === 'tool')
  assert.ok(toolMsgs.some((m) => (m.content as string).includes('missing_tool 不存在')))
})

test('runAgentLoop stops after maxRounds and emits a notice', async () => {
  const registry: AgentToolRegistry = {
    finance_quote: { name: 'finance_quote', description: '', parameters: {}, execute: async () => 'q' },
  }
  const turns: AgentTurn[] = [
    { content: '', toolCalls: [{ id: 'c1', name: 'finance_quote', arguments: {} }], finishReason: 'tool_calls', done: true },
    { content: '', toolCalls: [{ id: 'c1', name: 'finance_quote', arguments: {} }], finishReason: 'tool_calls', done: true },
  ]
  let idx = 0
  const readTurn = async (_stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void) => {
    const turn = turns[idx++]
    if (turn.content) onContent?.(turn.content)
    return turn
  }
  const builtMessages: unknown[][] = []
  const buildRequest = (messages: unknown[]) => {
    builtMessages.push(messages)
    return { url: 'http://upstream.test', headers: new Headers(), body: JSON.stringify({ messages }) }
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('')
  let consumed = ''
  try {
    const out = runAgentLoop({
      provider: 'openai-compatible',
      initialMessages: [{ role: 'user', content: 'hi' }],
      modelId: 'm',
      params: {},
      registry,
      buildRequest,
      readTurn,
      initialResponse: new Response(''),
      maxRounds: 1,
    })
    const parts: string[] = []
    for await (const chunk of out) parts.push(new TextDecoder().decode(chunk))
    consumed = parts.join('')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.ok(consumed.includes('已连续调用工具'))
  assert.ok(consumed.endsWith('data: [DONE]\n\n'))
  assert.equal(builtMessages.length, 1, 'only one round is requested before the cap kicks in')
})

test('createWebFetchExecutor validates url and rejects non-http schemes', async () => {
  const exec = createWebFetchExecutor()
  assert.ok((await exec({})).includes('web_fetch 需要 url 参数'))
  assert.ok((await exec({ url: 'not a url' })).includes('无效 URL'))
  assert.ok((await exec({ url: 'ftp://x.com' })).includes('仅支持 http/https'))
  assert.ok((await exec({ url: 'javascript:alert(1)' })).includes('仅支持 http/https'))
})

test('financeQuoteExecutor / agentFinanceQuote handle empty input without network', async () => {
  const exec = createFinanceQuoteExecutor()
  const result = await exec({ q: '  ' })
  assert.equal(result, '（未提供有效的标的名或代码）')
  const direct = await agentFinanceQuote('')
  assert.equal(direct, '（未提供有效的标的名或代码）')
})

test('formatQuotesSummary renders a compact real-time quote line', () => {
  const quotes = [
    makeQuote({
      name: '贵州茅台',
      code: '600519',
      price: 1500,
      pct: 1.23,
      change: 18.2,
      open: 1480,
      high: 1520,
      low: 1470,
      amount: 500_000,
      pe: 30.5,
    }),
  ]
  const summary = formatQuotesSummary(quotes)
  assert.ok(summary.includes('贵州茅台（600519）'))
  assert.ok(summary.includes('现价1500.00'))
  assert.ok(summary.includes('涨跌幅+1.23%'))
  assert.ok(summary.includes('成交额50.00亿'))
  assert.ok(summary.includes('市盈率30.50'))
})

test('formatQuotesSummary tolerates non-finite numbers', () => {
  const quotes = [makeQuote({ name: '某股', code: '000001', price: NaN, pct: NaN, amount: NaN })]
  const summary = formatQuotesSummary(quotes)
  assert.ok(summary.includes('某股（000001）'))
  assert.ok(summary.includes('现价—'))
  assert.ok(summary.includes('成交额—'))
})
