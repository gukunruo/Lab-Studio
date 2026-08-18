import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConversationUpdate, type ConversationUpdate } from '../server/ai-platform'

test('normalizeConversationUpdate only allows valid fields', () => {
  const input: ConversationUpdate = {
    title: 'My Chat',
    modelId: 'claude-opus-5',
    systemPrompt: 'Be helpful',
    params: { reasoningEffort: 'high' },
    messages: [{ role: 'user', content: 'hi' }],
  }
  const result = normalizeConversationUpdate(input)
  assert.equal(result.title, 'My Chat')
  assert.equal(result.modelId, 'claude-opus-5')
  assert.equal(result.systemPrompt, 'Be helpful')
  assert.deepEqual(result.params, { reasoningEffort: 'high' })
  assert.equal(result.messages.length, 1)
})

test('normalizeConversationUpdate strips unknown fields', () => {
  const input = {
    title: 'Test',
    modelId: 'gpt-5.4',
    systemPrompt: '',
    params: {},
    messages: [],
    id: 999,
    userKey: 'hacker',
    createdAt: 'fake',
  } as unknown as ConversationUpdate
  const result = normalizeConversationUpdate(input)
  assert.equal((result as Record<string, unknown>).id, undefined)
  assert.equal((result as Record<string, unknown>).userKey, undefined)
  assert.equal((result as Record<string, unknown>).createdAt, undefined)
})

test('normalizeConversationUpdate clamps title length', () => {
  const input: ConversationUpdate = {
    title: 'x'.repeat(300),
    modelId: 'gpt-5.4',
    systemPrompt: '',
    params: {},
    messages: [],
  }
  const result = normalizeConversationUpdate(input)
  assert.ok(result.title!.length <= 200)
})

test('normalizeConversationUpdate rejects non-array messages', () => {
  const input = {
    title: 'Test',
    modelId: 'gpt-5.4',
    systemPrompt: '',
    params: {},
    messages: 'not an array',
  } as unknown as ConversationUpdate
  const result = normalizeConversationUpdate(input)
  assert.deepEqual(result.messages, [])
})
