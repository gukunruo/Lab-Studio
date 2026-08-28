import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnthropicPlatformRequest,
  buildImageGenerationRequest,
  buildUpstreamRequest,
  normalizeImageGenerationResponse,
  type ChatRequestBody,
} from '../server/ai-platform'
import {
  appendToolLoopMessages,
  applyOpenAiDelta,
  buildOpenAiWebSearchTool,
  createOpenAiStreamAccumulator,
  extractWebSearchQuery,
  readOpenAiStream,
} from '../server/web-search'
import { buildOpenAiTools, type AgentToolRegistry } from '../server/agent-engine'

test('buildUpstreamRequest formats openai-compatible requests correctly', () => {
  const body: ChatRequestBody = {
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hello' }],
    system: 'You are helpful.',
    params: { reasoningEffort: 'high' },
  }
  const result = buildUpstreamRequest(body, {
    provider: 'openai-compatible',
    modelId: 'gpt-5.4',
    baseUrl: 'http://ai-service.tal.com',
    appId: '300000636',
    appKey: 'test-key',
  })
  assert.equal(result.url, 'http://ai-service.tal.com/openai-compatible/v1/chat/completions')
  assert.equal(result.headers.get('Authorization'), 'Bearer 300000636:test-key')
  assert.equal(result.headers.get('Content-Type'), 'application/json')
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.model, 'gpt-5.4')
  assert.equal(parsed.stream, true)
  assert.equal(parsed.reasoning_effort, 'high')
  // system message should be prepended to messages
  assert.equal(parsed.messages[0].role, 'system')
  assert.equal(parsed.messages[0].content, 'You are helpful.')
  assert.equal(parsed.messages[1].role, 'user')
})

test('buildImageGenerationRequest maps each image model to its confirmed endpoint', () => {
  const config = {
    baseUrl: 'https://ai.example.test/',
    appId: 'test-app',
    appKey: 'test-key',
  }

  const gpt = buildImageGenerationRequest({
    modelId: 'gpt-image-2',
    prompt: '孙悟空',
    aspectRatio: '1:1',
  }, config)
  assert.equal(gpt.url, 'https://ai.example.test/openai-compatible/v1/images/generations')
  assert.deepEqual(JSON.parse(gpt.body), { model: 'gpt-image-2', prompt: '孙悟空' })

  const gemini = buildImageGenerationRequest({
    modelId: 'gemini-3-pro-image',
    prompt: '生成一个猫咪图片',
    aspectRatio: '1:1',
  }, config)
  assert.equal(gemini.url, 'https://ai.example.test/openai-compatible/v1/chat/completions')
  assert.deepEqual(JSON.parse(gemini.body), {
    model: 'gemini-3-pro-image',
    messages: [{ role: 'user', content: '生成一个猫咪图片' }],
    modalities: ['text', 'image'],
  })
})

test('normalizeImageGenerationResponse only accepts HTTPS image URLs', () => {
  assert.deepEqual(normalizeImageGenerationResponse({
    data: [{ url: 'https://cdn.example.test/image.png' }],
  }), { kind: 'url', imageUrl: 'https://cdn.example.test/image.png' })
  assert.equal(normalizeImageGenerationResponse({
    choices: [{ message: { images: [{ url: 'http://cdn.example.test/image.png' }] } }],
  }), null)
})

test('buildUpstreamRequest formats anthropic requests correctly', () => {
  const body: ChatRequestBody = {
    modelId: 'claude-opus-5',
    messages: [{ role: 'user', content: 'hello' }],
    system: 'You are helpful.',
    params: {},
  }
  const result = buildUpstreamRequest(body, {
    provider: 'anthropic',
    modelId: 'claude-opus-5',
    baseUrl: 'http://ai-service.tal.com',
    appId: '300000636',
    appKey: 'test-key',
  })
  assert.equal(result.url, 'http://ai-service.tal.com/v1/messages')
  assert.equal(result.headers.get('Authorization'), 'Bearer 300000636:test-key')
  assert.equal(result.headers.get('Content-Type'), 'application/json')
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.model, 'claude-opus-5')
  assert.equal(parsed.stream, true)
  assert.equal(parsed.system, 'You are helpful.')
  assert.equal(parsed.max_tokens, 4096)
})

test('buildUpstreamRequest does not add reasoning_effort for anthropic', () => {
  const body: ChatRequestBody = {
    modelId: 'claude-opus-5',
    messages: [{ role: 'user', content: 'hi' }],
    system: '',
    params: { reasoningEffort: 'high' },
  }
  const result = buildUpstreamRequest(body, {
    provider: 'anthropic',
    modelId: 'claude-opus-5',
    baseUrl: 'http://ai-service.tal.com',
    appId: 'id',
    appKey: 'key',
  })
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.reasoning_effort, undefined)
})

test('buildAnthropicPlatformRequest forwards the selected Playground model', () => {
  const body: ChatRequestBody = {
    modelId: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hello' }],
    params: { reasoningEffort: 'high' },
  }
  const result = buildAnthropicPlatformRequest(body, {
    apiKey: 'test-key',
    baseUrl: 'https://example.test',
    model: 'claude-sonnet-4.6',
  })
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.model, 'claude-sonnet-5')
  assert.equal(parsed.reasoning_effort, undefined)
})

test('buildUpstreamRequest handles empty system prompt', () => {
  const body: ChatRequestBody = {
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hi' }],
    system: '',
    params: {},
  }
  const result = buildUpstreamRequest(body, {
    provider: 'openai-compatible',
    modelId: 'gpt-5.4',
    baseUrl: 'http://ai-service.tal.com',
    appId: 'id',
    appKey: 'key',
  })
  const parsed = JSON.parse(result.body)
  // No system message prepended when system is empty
  assert.equal(parsed.messages[0].role, 'user')
  assert.equal(parsed.messages.length, 1)
})

test('buildUpstreamRequest enables Kimi K3 thinking with the selected effort', () => {
  const result = buildUpstreamRequest({
    modelId: 'kimi-k3',
    messages: [{ role: 'user', content: '解释数据库索引' }],
    params: { reasoningEffort: 'high' },
  }, {
    provider: 'openai-compatible',
    modelId: 'kimi-k3',
    baseUrl: 'https://ai.example.test/',
    appId: 'test-app',
    appKey: 'test-key',
  })

  assert.equal(result.url, 'https://ai.example.test/openai-compatible/v1/chat/completions')
  assert.deepEqual(JSON.parse(result.body), {
    model: 'kimi-k3',
    messages: [{ role: 'user', content: '解释数据库索引' }],
    stream: true,
    reasoning: { mode: 'enabled', effort: 'high' },
  })
})

// ---- 联网搜索 ----

test('buildUpstreamRequest injects the provided tools array', () => {
  const registry: AgentToolRegistry = {
    web_search: {
      name: 'web_search',
      description: '联网检索',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      execute: async () => '',
    },
  }
  const body: ChatRequestBody = {
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: '今天 AI 有什么新闻' }],
  }
  const result = buildUpstreamRequest(
    body,
    {
      provider: 'openai-compatible',
      modelId: 'gpt-5.4',
      baseUrl: 'http://ai-service.tal.com',
      appId: '300000636',
      appKey: 'test-key',
    },
    buildOpenAiTools(registry),
  )
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.tools[0].type, 'function')
  assert.equal(parsed.tools[0].function.name, 'web_search')
  assert.deepEqual(Object.keys(parsed.tools[0].function.parameters.properties), ['query'])
  assert.deepEqual(parsed.tools[0].function.parameters.required, ['query'])
})

test('buildUpstreamRequest omits tools when none are provided', () => {
  const body: ChatRequestBody = {
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hi' }],
    params: { webSearch: false },
  }
  const result = buildUpstreamRequest(body, {
    provider: 'openai-compatible',
    modelId: 'gpt-5.4',
    baseUrl: 'http://ai-service.tal.com',
    appId: '300000636',
    appKey: 'test-key',
  })
  assert.equal(JSON.parse(result.body).tools, undefined)
})

test('buildAnthropicPlatformRequest injects native web_search tool when webSearch enabled', () => {
  const body: ChatRequestBody = {
    modelId: 'claude-sonnet-4.6',
    messages: [{ role: 'user', content: 'hi' }],
    params: { webSearch: true },
  }
  const result = buildAnthropicPlatformRequest(body, {
    apiKey: 'k',
    baseUrl: 'http://ai-service.tal.com',
    model: 'claude-sonnet-4.6',
  })
  const parsed = JSON.parse(result.body)
  assert.equal(parsed.tools[0].type, 'web_search_20260209')
  assert.equal(parsed.tools[0].name, 'web_search')
  assert.equal(parsed.tools[0].max_uses, 3)
})

test('applyOpenAiDelta accumulates content and reconcatenates tool_calls by index', () => {
  const acc = createOpenAiStreamAccumulator()
  let streamed = ''
  applyOpenAiDelta(acc, { content: 'Hello' }, (t) => { streamed += t })
  applyOpenAiDelta(
    acc,
    { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"q' } }] },
  )
  applyOpenAiDelta(acc, { content: ' world' }, (t) => { streamed += t })
  applyOpenAiDelta(acc, { tool_calls: [{ index: 0, function: { arguments: 'uery":"x"}' } }] })
  assert.equal(acc.content, 'Hello world')
  assert.equal(streamed, 'Hello world')
  assert.equal(acc.toolCalls.length, 1)
  assert.equal(acc.toolCalls[0].id, 'call_1')
  assert.equal(acc.toolCalls[0].name, 'web_search')
  assert.equal(acc.toolCalls[0].arguments, '{"query":"x"}')
})

test('extractWebSearchQuery parses query from JSON and falls back to raw', () => {
  assert.equal(extractWebSearchQuery({ id: '', name: 'web_search', arguments: '{"query":"AI 最新进展"}' }), 'AI 最新进展')
  assert.equal(extractWebSearchQuery({ id: '', name: 'web_search', arguments: 'not-json' }), 'not-json')
  assert.equal(extractWebSearchQuery({ id: '', name: 'web_search', arguments: '' }), '')
})

test('readOpenAiStream accumulates content and tool_calls and stops at [DONE]', async () => {
  const ev = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
  const sse = [
    ev({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }),
    ev({ choices: [{ delta: { content: ' world' } }] }),
    ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"query":"' } }] } }] }),
    ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'AI 最新进展"}' } }] } }] }),
    ev({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    'data: [DONE]\n\n',
  ].join('')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse))
      controller.close()
    },
  })
  let streamed = ''
  const acc = await readOpenAiStream(stream, (text) => { streamed += text })
  assert.equal(acc.content, 'Hello world')
  assert.equal(streamed, 'Hello world')
  assert.equal(acc.toolCalls.length, 1)
  assert.equal(acc.toolCalls[0].id, 'call_1')
  assert.equal(acc.toolCalls[0].name, 'web_search')
  assert.equal(acc.toolCalls[0].arguments, '{"query":"AI 最新进展"}')
  assert.equal(acc.finishReason, 'tool_calls')
})

test('appendToolLoopMessages appends assistant tool_calls and tool result messages', () => {
  const base = [{ role: 'user', content: 'hi' }]
  const next = appendToolLoopMessages(
    base,
    { content: null, toolCalls: [{ id: 'call_1', name: 'web_search', arguments: '{"query":"q"}' }] },
    [{ id: 'call_1', content: '检索结果' }],
  )
  assert.equal(next.length, 3)
  assert.equal(next[1].role, 'assistant')
  assert.equal(next[1].tool_calls[0].id, 'call_1')
  assert.equal(next[1].tool_calls[0].function.name, 'web_search')
  assert.equal(next[2].role, 'tool')
  assert.equal(next[2].tool_call_id, 'call_1')
  assert.equal(next[2].content, '检索结果')
})

test('buildOpenAiWebSearchTool declares a query-only schema', () => {
  const tools = buildOpenAiWebSearchTool()
  assert.equal(tools[0].type, 'function')
  assert.equal(tools[0].function.name, 'web_search')
  assert.equal(tools[0].function.parameters.type, 'object')
})
