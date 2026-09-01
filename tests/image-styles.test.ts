import test from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_STYLES, composeImagePrompt, imageStyleName, imageStyleSuffix } from '../src/ai-platform/image-styles'

test('imageStyleSuffix returns the known tail for a style id', () => {
  const suffix = imageStyleSuffix('ink-wash')
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
  assert.ok(composeImagePrompt('一只猫', 'ink-wash').includes('一只猫'))
  assert.ok(composeImagePrompt('一只猫', 'cinematic').includes('电影'))
})

test('IMAGE_STYLES has unique ids and a curated set', () => {
  assert.ok(IMAGE_STYLES.length >= 8)
  const ids = IMAGE_STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})
