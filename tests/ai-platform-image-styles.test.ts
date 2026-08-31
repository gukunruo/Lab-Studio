import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STYLE_PRESETS,
  NEGATIVE_PRESETS,
  QUALITY_BOOSTER,
  activeStylePresetId,
  applyStylePreset,
  clearStylePreset,
  enhancePrompt,
  findStylePreset,
  isNegativeActive,
  toggleNegative,
} from '../src/ai-platform/image-styles'
import type { ImageDraftFacets } from '../src/ai-platform/types'

const EMPTY: ImageDraftFacets = { subject: '', style: '', composition: '', details: '', negative: '' }

test('style presets are curated and non-empty', () => {
  assert.ok(STYLE_PRESETS.length >= 8)
  for (const preset of STYLE_PRESETS) {
    assert.ok(preset.id && preset.label && preset.style)
    assert.match(preset.style, /，|,/)
  }
})

test('applyStylePreset fills the style facet and clearStylePreset empties it', () => {
  const applied = applyStylePreset(EMPTY, 'cinema')
  assert.equal(applied.style, '电影镜头感，戏剧性打光，胶片颗粒，色彩分级，宽银幕构图')
  assert.equal(applyStylePreset(EMPTY, 'missing').style, EMPTY.style)
  assert.equal(activeStylePresetId(applied), 'cinema')
  assert.equal(activeStylePresetId(clearStylePreset(applied)), null)
})

test('activeStylePresetId only matches an exact preset phrase', () => {
  const facets: ImageDraftFacets = { ...EMPTY, style: '极简摄影' }
  assert.equal(activeStylePresetId(facets), null)
  assert.equal(activeStylePresetId({ ...EMPTY, style: STYLE_PRESETS[0].style }), STYLE_PRESETS[0].id)
})

test('findStylePreset resolves by id and returns undefined for unknown', () => {
  assert.equal(findStylePreset('photo')?.id, 'photo')
  assert.equal(findStylePreset('nope'), undefined)
})

test('toggleNegative appends and removes a multi-term preset', () => {
  let facets = toggleNegative(EMPTY, NEGATIVE_PRESETS[0])
  assert.equal(isNegativeActive(facets, NEGATIVE_PRESETS[0]), true)
  assert.equal(facets.negative, '模糊，失焦')

  const second = toggleNegative(facets, NEGATIVE_PRESETS[1])
  assert.equal(isNegativeActive(second, NEGATIVE_PRESETS[1]), true)
  assert.equal(second.negative, '模糊，失焦，文字，水印，签名')

  const removed = toggleNegative(second, NEGATIVE_PRESETS[0])
  assert.equal(isNegativeActive(removed, NEGATIVE_PRESETS[0]), false)
  assert.equal(removed.negative, '文字，水印，签名')
})

test('toggleNegative removes by term without corrupting substring phrases', () => {
  const facets: ImageDraftFacets = { ...EMPTY, negative: '杂乱背景、过多文字水印、卡通化' }
  const withPreset = toggleNegative(facets, NEGATIVE_PRESETS[1])
  assert.equal(withPreset.negative, '杂乱背景、过多文字水印、卡通化，文字，水印，签名')
  const removed = toggleNegative(withPreset, NEGATIVE_PRESETS[1])
  assert.equal(removed.negative, '杂乱背景，过多文字水印，卡通化')
})

test('negative preset is active only when all its terms are present', () => {
  const facets: ImageDraftFacets = { ...EMPTY, negative: '文字' }
  assert.equal(isNegativeActive(facets, NEGATIVE_PRESETS[1]), false)
  assert.equal(isNegativeActive({ ...EMPTY, negative: '文字，水印' }, NEGATIVE_PRESETS[1]), false)
  assert.equal(isNegativeActive({ ...EMPTY, negative: '文字，水印，签名' }, NEGATIVE_PRESETS[1]), true)
})

test('enhancePrompt appends a quality booster and leaves empty prompts empty', () => {
  const enhanced = enhancePrompt('主题：一个 logo')
  assert.match(enhanced, /^主题：一个 logo/)
  assert.match(enhanced, /画质：/)
  assert.match(enhanced, /8k/)
  assert.equal(enhanced, `主题：一个 logo\n画质：${QUALITY_BOOSTER}`)
  assert.equal(enhancePrompt('   '), '')
})
