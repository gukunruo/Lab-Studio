import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { supportsMultimodal } from './models.ts'

describe('supportsMultimodal', () => {
  it('已知支持多模态的模型返回 true', () => {
    assert.equal(supportsMultimodal('gpt-5.6-terra'), true)
    assert.equal(supportsMultimodal('gpt-5.6-luna'), true)
    assert.equal(supportsMultimodal('gpt-5.5'), true)
    assert.equal(supportsMultimodal('gpt-5.4'), true)
    assert.equal(supportsMultimodal('gpt-5.3-codex'), true)
    assert.equal(supportsMultimodal('gpt-5.2-codex'), true)
    assert.equal(supportsMultimodal('deepseek-v4-pro'), true)
    assert.equal(supportsMultimodal('kimi-k2.7-code'), true)
    assert.equal(supportsMultimodal('glm-4.7'), true)
    assert.equal(supportsMultimodal('glm-5.1'), true)
    assert.equal(supportsMultimodal('glm-5'), true)
  })

  it('已知不支持多模态的模型返回 false', () => {
    assert.equal(supportsMultimodal('glm-5.2'), false)
    assert.equal(supportsMultimodal('doubao-seed-evolving'), false)
    assert.equal(supportsMultimodal('deepseek-v4-flash'), false)
    assert.equal(supportsMultimodal('qwen3.7-max'), false)
  })

  it('所有 claude- 前缀模型返回 false（网关映射到 glm-5.2）', () => {
    assert.equal(supportsMultimodal('claude-sonnet-4.6'), false)
    assert.equal(supportsMultimodal('claude-sonnet-5'), false)
    assert.equal(supportsMultimodal('claude-opus-4.8'), false)
    assert.equal(supportsMultimodal('claude-haiku-4.5'), false)
  })

  it('未知模型返回 false（安全默认）', () => {
    assert.equal(supportsMultimodal('some-future-model'), false)
    assert.equal(supportsMultimodal(''), false)
  })
})
