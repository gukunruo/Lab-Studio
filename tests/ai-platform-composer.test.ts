import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  IMAGE_ASPECT_RATIOS,
  composerSubmitMatches,
  nextTextareaHeight,
} from '../src/ai-platform/composer'

test('Composer textarea height grows until the visible 160px cap', () => {
  assert.equal(COMPOSER_INPUT_MAX_HEIGHT, 160)
  assert.equal(nextTextareaHeight(24), 24)
  assert.equal(nextTextareaHeight(160), 160)
  assert.equal(nextTextareaHeight(400), 160)
})

test('Composer sends on Enter and preserves a newline on Shift plus Enter', () => {
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: false }), true)
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: true }), false)
  assert.equal(composerSubmitMatches({ key: 'Escape', shiftKey: false }), false)
})

test('Composer does not send while an input method is committing a candidate', () => {
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 }), false)
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 }), false)
})

test('image mode retains the application-level aspect ratio metadata', () => {
  assert.deepEqual(IMAGE_ASPECT_RATIOS, ['1:1', '16:9', '9:16'])
})
