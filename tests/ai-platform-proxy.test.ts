import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnthropicPlatformRequest,
  buildDeepSeekHarnessRequest,
  buildImageGenerationRequest,
  buildUpstreamRequest,
  normalizeImageGenerationResponse,
  type ChatRequestBody,
} from '../server/ai-platform'

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

test('buildDeepSeekHarnessRequest uses the standard OpenAI streaming contract', () => {
  const result = buildDeepSeekHarnessRequest({
    modelId: 'deepseek-chat',
    messages: [{ role: 'user', content: 'hello' }],
    system: 'You are helpful.',
    params: { maxTokens: 1024, reasoningEffort: 'high' },
  }, {
    baseUrl: 'https://harness.example.test/',
    apiKey: 'harness-test-key',
  })

  assert.equal(result.url, 'https://harness.example.test/v1/chat/completions')
  assert.equal(result.headers.get('Authorization'), 'Bearer harness-test-key')
  assert.equal(result.headers.get('api-key'), null)
  const parsed = JSON.parse(result.body)
  assert.deepEqual(parsed, {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' },
    ],
    stream: true,
    max_tokens: 1024,
  })
  assert.equal(parsed.reasoning_effort, undefined)
  assert.equal(parsed.tools, undefined)
})

test('buildDeepSeekHarnessRequest excludes invalid max_tokens', () => {
  const result = buildDeepSeekHarnessRequest({
    modelId: 'deepseek-chat',
    messages: [{ role: 'user', content: 'hello' }],
    params: { maxTokens: Number.NaN },
  }, {
    baseUrl: 'https://harness.example.test',
    apiKey: 'harness-test-key',
  })

  assert.equal(JSON.parse(result.body).max_tokens, undefined)
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
