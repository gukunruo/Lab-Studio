import test from 'node:test'
import assert from 'node:assert/strict'
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenElement,
  fullscreenState,
} from '../src/apps/finance/fullscreen'

test('fullscreen helper enters through the standard API', async () => {
  let entered = false
  const target = {
    requestFullscreen: async () => {
      entered = true
    },
  }
  const doc = { fullscreenElement: null }

  assert.equal(await enterFullscreen(target, doc), true)
  assert.equal(entered, true)
})

test('fullscreen helper exits through the standard API', async () => {
  let exited = false
  const doc = {
    fullscreenElement: {} as Element,
    exitFullscreen: async () => {
      exited = true
    },
  }

  assert.equal(await exitFullscreen(doc), true)
  assert.equal(exited, true)
})

test('fullscreen state supports the webkit element fallback', () => {
  const element = {} as Element
  const doc = { fullscreenElement: null, webkitFullscreenElement: element }

  assert.equal(fullscreenElement(doc), element)
  assert.equal(fullscreenState(doc), true)
})

test('fullscreen helper reports unsupported APIs without throwing', async () => {
  const target = {}
  const doc = { fullscreenElement: {} as Element }

  assert.equal(await enterFullscreen(target, { fullscreenElement: null }), false)
  assert.equal(await exitFullscreen(doc), false)
})
