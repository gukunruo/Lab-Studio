import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildImageDraftRequest,
  collapseDraftToPrompt,
  DEFAULT_IMAGE_DRAFT_MODEL,
  draftImagePrompt,
  parseImageDraftResponse,
  readImageDraftModel,
  type ImageDraftFacets,
} from '../server/image-prompt-drafter'

const config = { apiKey: 'sk-anthropic-test', baseUrl: 'https://ai.example.test/' }

test('readImageDraftModel defaults to Haiku and honors ANTHROPIC_DRAFT_MODEL', () => {
  assert.equal(readImageDraftModel(), DEFAULT_IMAGE_DRAFT_MODEL)
  const prev = process.env.ANTHROPIC_DRAFT_MODEL
  process.env.ANTHROPIC_DRAFT_MODEL = 'claude-sonnet-4-6'
  try {
    assert.equal(readImageDraftModel(), 'claude-sonnet-4-6')
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_DRAFT_MODEL
    else process.env.ANTHROPIC_DRAFT_MODEL = prev
  }
})

test('buildImageDraftRequest targets the Anthropic messages endpoint', () => {
  const request = buildImageDraftRequest('生成一个 AI 平台的 logo', config, 2)
  assert.equal(request.url, 'https://ai.example.test/v1/messages')
  assert.equal(request.headers.get('x-api-key'), 'sk-anthropic-test')
  assert.equal(request.headers.get('anthropic-version'), '2023-06-01')
})

test('buildImageDraftRequest includes system, desire, web_search tool, and default model', () => {
  const request = buildImageDraftRequest('生成一个 AI 平台的 logo', config, 2)
  const body = JSON.parse(String(request.body))
  assert.equal(body.model, DEFAULT_IMAGE_DRAFT_MODEL)
  assert.equal(typeof body.system, 'string')
  assert.deepEqual(body.messages, [{ role: 'user', content: '生成一个 AI 平台的 logo' }])
  assert.deepEqual(body.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2 }])
})

test('buildImageDraftRequest threads history and a reference hint', () => {
  const request = buildImageDraftRequest('背景改深蓝色', config, 2, {
    referenceHint: '前一版 logo：极简扁平、深蓝配色',
    history: [{ role: 'assistant', content: '这是上一版提示词卡' }],
  })
  const body = JSON.parse(String(request.body))
  assert.equal(body.messages.length, 2)
  assert.deepEqual(body.messages[0], { role: 'assistant', content: '这是上一版提示词卡' })
  assert.equal(body.messages[1]?.role, 'user')
  assert.match(String(body.messages[1]?.content), /背景改深蓝色/)
  assert.match(String(body.messages[1]?.content), /前一版 logo：极简扁平、深蓝配色/)
})

test('buildImageDraftRequest system urges brand/IP disambiguation, not literal reading', () => {
  const request = buildImageDraftRequest('生成一个豆包', config, 2)
  const system = String(JSON.parse(String(request.body)).system)
  assert.match(system, /官方拟人化形象/)
  assert.match(system, /facets/)
})

test('collapseDraftToPrompt labels only non-empty facets in a fixed order', () => {
  const prompt = collapseDraftToPrompt({
    subject: '一个圆角方形字母 A 标志',
    style: '极简扁平',
    composition: '居中，16:9',
    details: '深蓝渐变背景，柔和光影',
    negative: '杂乱背景，多余文字',
  })
  assert.match(prompt, /^主题：一个圆角方形字母 A 标志/)
  assert.match(prompt, /风格：极简扁平/)
  assert.match(prompt, /构图：居中，16:9/)
  assert.match(prompt, /细节：深蓝渐变背景，柔和光影/)
  assert.match(prompt, /避免：杂乱背景，多余文字/)
})

test('collapseDraftToPrompt skips empty facets and returns empty string when all empty', () => {
  const prompt = collapseDraftToPrompt({ subject: 'logo', style: '', composition: '', details: '', negative: '' })
  assert.equal(prompt, '主题：logo')
  assert.equal(collapseDraftToPrompt({ subject: '', style: '', composition: '', details: '', negative: '' }), '')
})

test('parseImageDraftResponse extracts facets from <facets> JSON and derives the prompt', () => {
  const payload = {
    content: [
      { type: 'text', text: '我提炼了一下要点：' },
      { type: 'text', text: '<facets>{"subject":"一个 AI 平台 logo","style":"极简扁平","composition":"居中","details":"深蓝渐变","negative":"杂乱背景"}</facets>' },
    ],
  }
  const draft = parseImageDraftResponse(payload)
  assert.ok(draft)
  assert.equal(draft.facets.subject, '一个 AI 平台 logo')
  assert.equal(draft.facets.style, '极简扁平')
  assert.match(draft.prompt, /主题：一个 AI 平台 logo/)
  assert.match(draft.prompt, /避免：杂乱背景/)
})

test('parseImageDraftResponse returns null on missing or malformed facets', () => {
  assert.equal(parseImageDraftResponse(null), null)
  assert.equal(parseImageDraftResponse({ content: [{ type: 'text', text: '没有标记' }] }), null)
  assert.equal(parseImageDraftResponse({ content: [{ type: 'text', text: '<facets>not json</facets>' }] }), null)
  assert.equal(parseImageDraftResponse({ content: 'not array' }), null)
})

test('parseImageDraftResponse rejects a facets object with wrong shape', () => {
  const payload = { content: [{ type: 'text', text: '<facets>{"subject":123}</facets>' }] }
  assert.equal(parseImageDraftResponse(payload), null)
})

test('draftImagePrompt degrades to the raw desire as a single-facet draft on network failure', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network down') }
  try {
    const draft = await draftImagePrompt('生成一个 AI 平台的 logo', config)
    assert.equal(draft.prompt, '生成一个 AI 平台的 logo')
    assert.equal(draft.facets.subject, '生成一个 AI 平台的 logo')
    assert.equal(draft.facets.style, '')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('draftImagePrompt degrades when upstream returns non-ok or unparseable', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('server error', { status: 502 })
    let draft = await draftImagePrompt('生成一个 AI 平台的 logo', config)
    assert.equal(draft.prompt, '生成一个 AI 平台的 logo')

    globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '没有标记' }] }), { status: 200 })
    draft = await draftImagePrompt('生成一个 AI 平台的 logo', config)
    assert.equal(draft.prompt, '生成一个 AI 平台的 logo')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('draftImagePrompt returns the parsed draft on success', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: '<facets>{"subject":"AI 平台 logo","style":"极简扁平","composition":"","details":"","negative":""}</facets>' }],
  }), { status: 200 })
  try {
    const draft = await draftImagePrompt('生成一个 AI 平台的 logo', config)
    assert.deepEqual(draft.facets, { subject: 'AI 平台 logo', style: '极简扁平', composition: '', details: '', negative: '' } satisfies ImageDraftFacets)
  } finally {
    globalThis.fetch = originalFetch
  }
})
