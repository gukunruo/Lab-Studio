import test from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_STYLES, composeImagePrompt, imageStyleName, imageStyleSuffix } from '../src/ai-platform/image-styles'

test('imageStyleSuffix returns the known tail for a style id', () => {
  const suffix = imageStyleSuffix('ink_wash_painting')
  assert.ok(suffix.includes('水墨'))
})

test('imageStyleSuffix returns empty for unknown/empty id', () => {
  assert.equal(imageStyleSuffix(''), '')
  assert.equal(imageStyleSuffix('nope'), '')
})

test('imageStyleName returns the Chinese display name', () => {
  assert.equal(imageStyleName('cyberpunk'), '赛博朋克')
  assert.equal(imageStyleName(''), '')
})

test('composeImagePrompt appends the suffix and keeps a bare prompt unchanged', () => {
  assert.equal(composeImagePrompt('一只猫'), '一只猫')
  assert.ok(composeImagePrompt('一只猫', 'ink_wash_painting').includes('一只猫'))
  assert.ok(composeImagePrompt('一只猫', 'film').includes('电影'))
})

test('IMAGE_STYLES has unique ids, Doubao-aligned names, and per-style icon/suffix', () => {
  assert.equal(IMAGE_STYLES.length, 32)
  const ids = IMAGE_STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const s of IMAGE_STYLES) {
    assert.ok(s.name, `${s.id} has a name`)
    assert.ok(s.suffix, `${s.id} has a suffix`)
    assert.equal(s.image, `/ai-styles/style-${s.id}.webp`, `${s.id} points at its thumbnail`)
  }
})
