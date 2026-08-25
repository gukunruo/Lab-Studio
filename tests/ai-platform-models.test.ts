import test from 'node:test'
import assert from 'node:assert/strict'
import { SEED_MODELS } from '../server/ai-platform-seed'

test('seed contains all required models', () => {
  const modelIds = SEED_MODELS.map((m) => m.modelId)
  // OpenAI compatible
  assert.ok(modelIds.includes('gpt-5.4'))
  assert.ok(modelIds.includes('gpt-5.5'))
  assert.ok(modelIds.includes('gpt-5.6-sol'))
  assert.ok(modelIds.includes('deepseek-v4-pro'))
  assert.ok(modelIds.includes('deepseek-v4-flash'))
  assert.equal(modelIds.includes('deepseek-chat'), false)
  assert.ok(modelIds.includes('glm-5.2'))
  assert.ok(modelIds.includes('kimi-k2-7-code'))
  assert.ok(modelIds.includes('gpt-image-2'))
  assert.ok(modelIds.includes('gemini-3-pro-image'))
  // Anthropic
  assert.ok(modelIds.includes('claude-opus-4.6'))
  assert.ok(modelIds.includes('claude-opus-4.7'))
  assert.ok(modelIds.includes('claude-opus-4.8'))
  assert.ok(modelIds.includes('claude-opus-5'))
  assert.ok(modelIds.includes('claude-sonnet-4.6'))
  assert.ok(modelIds.includes('claude-sonnet-5'))
})

test('Kimi K3 has the documented chat configuration', () => {
  const model = SEED_MODELS.find((candidate) => candidate.modelId === 'kimi-k3')
  assert.deepEqual(model, {
    modelId: 'kimi-k3',
    displayName: 'Kimi K3',
    provider: 'openai-compatible',
    category: 'chat',
    vendor: 'moonshot',
    capabilities: ['streaming', 'reasoning_mode'],
    contextWindow: 1_000_000,
    rpmLimit: 50,
    tpmLimit: 500_000,
    sortOrder: 31,
  })
})

test('DeepSeek Chat is absent from the seed inventory', () => {
  assert.equal(SEED_MODELS.some((model) => model.modelId === 'deepseek-chat'), false)
})

test('every model has valid provider', () => {
  for (const m of SEED_MODELS) {
    assert.ok(
      m.provider === 'openai-compatible' || m.provider === 'anthropic',
      `${m.modelId} has invalid provider: ${m.provider}`,
    )
  }
})

test('every model has valid category', () => {
  for (const m of SEED_MODELS) {
    assert.ok(
      m.category === 'chat' || m.category === 'reasoning' || m.category === 'image',
      `${m.modelId} has invalid category: ${m.category}`,
    )
  }
})

test('image models are excluded from chat and keep GPT-Image-2 first', () => {
  const imageModels = SEED_MODELS.filter((m) => m.category === 'image')
  assert.deepEqual(imageModels.map((model) => model.modelId), [
    'gpt-image-2',
    'gemini-3-pro-image',
  ])
  assert.ok(imageModels.every((model) => model.capabilities.includes('image_generation')))
  assert.ok(imageModels[0]!.sortOrder < imageModels[1]!.sortOrder)
})

test('all modelIds are unique', () => {
  const ids = SEED_MODELS.map((m) => m.modelId)
  assert.equal(new Set(ids).size, ids.length)
})
