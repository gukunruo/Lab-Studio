import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLLAPSE_DRAFT_LABELS,
  COMPOSER_INPUT_MAX_HEIGHT,
  IMAGE_ASPECT_RATIOS,
  collapseDraftToPrompt,
  composerSubmitMatches,
  imageDraftConfirmFlow,
  nextTextareaHeight,
} from '../src/ai-platform/composer'
import type { ChatMessage } from '../src/ai-platform/types'

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

test('collapseDraftToPrompt mirrors the server template, labeling facets in order', () => {
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

test('collapseDraftToPrompt skips empty facets, all-empty returns empty string', () => {
  assert.equal(collapseDraftToPrompt({ subject: 'logo', style: '', composition: '', details: '', negative: '' }), '主题：logo')
  assert.equal(collapseDraftToPrompt({ subject: '', style: '', composition: '', details: '', negative: '' }), '')
})

test('imageDraftConfirmFlow routes a GPT draft to the image generation path', () => {
  const messages = [
    { type: 'image-request', role: 'user', requestId: 'req-gpt', prompt: '做个 logo', aspectRatio: '1:1', modelId: 'gpt-image-2', status: 'completed', createdAt: '2026-08-31T00:00:00Z' },
    { type: 'image-draft', role: 'assistant', requestId: 'req-gpt', modelId: 'gpt-image-2', facets: { subject: 'logo', style: '', composition: '', details: '', negative: '' }, prompt: '主题：logo', status: 'ready', createdAt: '2026-08-31T00:00:01Z' },
  ] as ChatMessage[]
  assert.equal(imageDraftConfirmFlow(messages, 1), 'gpt-image')
})

test('imageDraftConfirmFlow routes a Gemini draft to the Gemini creation path', () => {
  const messages = [
    { type: 'gemini-multimodal-user', role: 'user', requestId: 'req-gemini', content: '宇航员回望地球', createdAt: '2026-08-31T00:00:00Z' },
    { type: 'image-draft', role: 'assistant', requestId: 'req-gemini', modelId: 'gemini-3-pro-image', facets: { subject: '宇航员', style: '', composition: '', details: '', negative: '' }, prompt: '主题：宇航员', status: 'ready', createdAt: '2026-08-31T00:00:01Z' },
  ] as ChatMessage[]
  assert.equal(imageDraftConfirmFlow(messages, 1), 'gemini')
})

test('imageDraftConfirmFlow returns null for a non-draft message', () => {
  const messages = [
    { type: 'image-request', role: 'user', requestId: 'req-gpt', prompt: '做个 logo', aspectRatio: '1:1', modelId: 'gpt-image-2', status: 'completed', createdAt: '2026-08-31T00:00:00Z' },
  ] as ChatMessage[]
  assert.equal(imageDraftConfirmFlow(messages, 0), null)
  assert.equal(imageDraftConfirmFlow([], 0), null)
})
