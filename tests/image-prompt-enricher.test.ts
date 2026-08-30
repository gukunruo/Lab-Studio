import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildImageEnrichmentRequest,
  DEFAULT_IMAGE_ENRICH_MODEL,
  extractEnrichedPrompt,
  enrichImagePrompt,
  readImageEnrichModel,
} from '../server/image-prompt-enricher'

const config = {
  apiKey: 'sk-anthropic-test',
  baseUrl: 'https://ai.example.test/',
  model: 'claude-sonnet-4.6',
}

test('buildImageEnrichmentRequest targets the Anthropic messages endpoint', () => {
  const request = buildImageEnrichmentRequest('生成一只橘猫', config, 2)

  assert.equal(request.url, 'https://ai.example.test/v1/messages')
  assert.equal(request.headers.get('x-api-key'), 'sk-anthropic-test')
  assert.equal(request.headers.get('anthropic-version'), '2023-06-01')
})

test('buildImageEnrichmentRequest includes system, user prompt, and native web_search tool', () => {
  const request = buildImageEnrichmentRequest('生成字节跳动的豆包形象', config, 2)
  const body = JSON.parse(String(request.body))

  assert.equal(body.model, 'claude-haiku-4-5-20251001')
  assert.equal(typeof body.system, 'string')
  assert.deepEqual(body.messages, [{ role: 'user', content: '生成字节跳动的豆包形象' }])
  assert.deepEqual(body.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }])
})

test('buildImageEnrichmentRequest uses the cheapest model instead of the chat model', () => {
  const request = buildImageEnrichmentRequest('生成一只橘猫', config, 2)
  const body = JSON.parse(String(request.body))

  assert.equal(body.model, DEFAULT_IMAGE_ENRICH_MODEL)
  assert.notEqual(body.model, config.model)
})

test('buildImageEnrichmentRequest accepts an explicit model override', () => {
  const request = buildImageEnrichmentRequest('生成一只橘猫', config, 2, 'claude-sonnet-4-6')

  assert.equal(JSON.parse(String(request.body)).model, 'claude-sonnet-4-6')
})

test('readImageEnrichModel defaults to Haiku and honors an env override', () => {
  const original = process.env.ANTHROPIC_ENRICH_MODEL
  delete process.env.ANTHROPIC_ENRICH_MODEL
  try {
    assert.equal(readImageEnrichModel(), DEFAULT_IMAGE_ENRICH_MODEL)
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_ENRICH_MODEL = original
  }

  process.env.ANTHROPIC_ENRICH_MODEL = 'claude-haiku-4-5'
  try {
    assert.equal(readImageEnrichModel(), 'claude-haiku-4-5')
  } finally {
    if (original !== undefined) process.env.ANTHROPIC_ENRICH_MODEL = original
    else delete process.env.ANTHROPIC_ENRICH_MODEL
  }
})

test('extractEnrichedPrompt reads the <prompt> marker even after narration', () => {
  const payload = {
    content: [
      { type: 'text', text: '我来检索一下豆包的具体形象。' },
      { type: 'server_tool_use', id: 'toolu_1', name: 'web_search', input: { query: '豆包' } },
      { type: 'web_search_tool_result', tool_use_id: 'toolu_1', content: '...' },
      { type: 'text', text: '我已经确认。\n\n<prompt>生成字节跳动旗下AI助手"豆包"的官方拟人化形象…</prompt>' },
    ],
  }

  assert.equal(extractEnrichedPrompt(payload), '生成字节跳动旗下AI助手"豆包"的官方拟人化形象…')
})

test('extractEnrichedPrompt falls back to the last text block without a marker', () => {
  const payload = { content: [{ type: 'text', text: '一只橘猫在窗台上。' }] }

  assert.equal(extractEnrichedPrompt(payload), '一只橘猫在窗台上。')
})

test('extractEnrichedPrompt returns null when there is no usable text', () => {
  assert.equal(extractEnrichedPrompt({ content: [] }), null)
  assert.equal(extractEnrichedPrompt({ content: [{ type: 'server_tool_use' }] }), null)
  assert.equal(extractEnrichedPrompt(null), null)
})

test('enrichImagePrompt returns the original prompt when config/fetch fails', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network down') }
  try {
    assert.equal(await enrichImagePrompt('一只橘猫', config), '一只橘猫')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('enrichImagePrompt returns the original prompt when the upstream is non-ok', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('nope', { status: 502 })
  try {
    assert.equal(await enrichImagePrompt('一只橘猫', config), '一只橘猫')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('enrichImagePrompt returns the enriched prompt on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    content: [
      { type: 'text', text: '我来检索。' },
      { type: 'text', text: '<prompt>生成字节跳动旗下AI助手"豆包"的官方形象…</prompt>' },
    ],
  })
  try {
    assert.equal(
      await enrichImagePrompt('生成字节跳动的豆包形象', config),
      '生成字节跳动旗下AI助手"豆包"的官方形象…',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
