import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUpstreamRequest, type ChatRequestBody } from '../server/ai-platform'

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
