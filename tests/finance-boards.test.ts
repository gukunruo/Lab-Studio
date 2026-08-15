import test from 'node:test'
import assert from 'node:assert/strict'
import { createBoardPageState, heatmapAvailability } from '../src/apps/finance/boards'

test('board page state keeps kind and order query values', () => {
  const state = createBoardPageState({ kind: 'concept', order: 'down' })
  assert.deepEqual(state, { kind: 'concept', order: 'down', view: 'list' })
})

test('board page state falls back to list and valid defaults', () => {
  const state = createBoardPageState({ kind: 'invalid', order: 'invalid', view: 'heatmap' })
  assert.deepEqual(state, { kind: 'industry', order: 'up', view: 'list' })
})

test('heatmap remains unavailable without real finite weights and source', () => {
  assert.deepEqual(heatmapAvailability([]), { available: false, reason: '暂无真实权重数据，热力图不可用' })
  assert.deepEqual(heatmapAvailability([{ weight: Number.NaN }]), { available: false, reason: '暂无真实权重数据，热力图不可用' })
  assert.deepEqual(heatmapAvailability([{ weight: 20 }]), { available: false, reason: '暂无真实权重数据，热力图不可用' })
  assert.deepEqual(heatmapAvailability([{ weight: 20, weightProvider: 'provider', weightSource: 'source' }]), { available: true, reason: '' })
})
