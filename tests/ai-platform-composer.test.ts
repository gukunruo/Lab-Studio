import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  IMAGE_ASPECT_RATIOS,
  imageShortcutMatches,
  nextTextareaHeight,
} from '../src/ai-platform/composer'

test('Composer textarea height grows until the visible 160px cap', () => {
  assert.equal(COMPOSER_INPUT_MAX_HEIGHT, 160)
  assert.equal(nextTextareaHeight(24), 24)
  assert.equal(nextTextareaHeight(160), 160)
  assert.equal(nextTextareaHeight(400), 160)
})

test('image generation shortcut requires Command or Ctrl plus Enter', () => {
  assert.equal(imageShortcutMatches({ key: 'Enter', metaKey: true, ctrlKey: false }), true)
  assert.equal(imageShortcutMatches({ key: 'Enter', metaKey: false, ctrlKey: true }), true)
  assert.equal(imageShortcutMatches({ key: 'Enter', metaKey: false, ctrlKey: false }), false)
  assert.equal(imageShortcutMatches({ key: 'a', metaKey: true, ctrlKey: false }), false)
})

test('image mode retains the application-level aspect ratio metadata', () => {
  assert.deepEqual(IMAGE_ASPECT_RATIOS, ['1:1', '16:9', '9:16'])
})
