import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasMultimodalContent } from './detect.ts'

describe('hasMultimodalContent', () => {
  it('纯文本 messages（content 为 string）返回 false', () => {
    assert.equal(hasMultimodalContent({
      messages: [{ role: 'user', content: 'hello' }],
    }), false)
  })

  it('content 数组中只有 text 块返回 false', () => {
    assert.equal(hasMultimodalContent({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    }), false)
  })

  it('content 数组中含 image 块返回 true', () => {
    assert.equal(hasMultimodalContent({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'xxx' } },
          { type: 'text', text: 'what is this?' },
        ],
      }],
    }), true)
  })

  it('content 数组中含 document 块返回 true', () => {
    assert.equal(hasMultimodalContent({
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'xxx' } },
        ],
      }],
    }), true)
  })

  it('system 为数组且含 image 块返回 true', () => {
    assert.equal(hasMultimodalContent({
      system: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'xxx' } }],
      messages: [{ role: 'user', content: 'hi' }],
    }), true)
  })

  it('system 为字符串返回 false', () => {
    assert.equal(hasMultimodalContent({
      system: 'you are helpful',
      messages: [{ role: 'user', content: 'hi' }],
    }), false)
  })

  it('多轮对话中任意一轮含图片返回 true', () => {
    assert.equal(hasMultimodalContent({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: [{ type: 'image', source: { type: 'url' } }] },
      ],
    }), true)
  })

  it('null/undefined body 返回 false', () => {
    assert.equal(hasMultimodalContent(null), false)
    assert.equal(hasMultimodalContent(undefined), false)
    assert.equal(hasMultimodalContent({}), false)
  })

  it('messages 不是数组返回 false', () => {
    assert.equal(hasMultimodalContent({ messages: 'not array' }), false)
  })
})
