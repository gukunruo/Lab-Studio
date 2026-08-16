import test from 'node:test'
import assert from 'node:assert/strict'
import { createBoardPageState, heatmapAvailability, heatmapFlexWeights } from '../src/apps/finance/boards'

const availableMeta = {
  status: 'available' as const,
  provider: 'tushare',
  source: 'ths_member+daily_basic.total_mv',
  tradeDate: '2026-08-14',
}

const unavailableMeta = {
  status: 'unavailable' as const,
  provider: 'tushare',
  source: 'ths_member+daily_basic.total_mv',
  tradeDate: null,
}

const partialMeta = { ...availableMeta, status: 'partial' as const }

const weightedRows = [
  { weight: 75, weightProvider: 'tushare', weightSource: 'ths_member+daily_basic.total_mv', weightTradeDate: '2026-08-14', memberCount: 4, coveredMemberCount: 4 },
  { weight: 25, weightProvider: 'tushare', weightSource: 'ths_member+daily_basic.total_mv', weightTradeDate: '2026-08-14', memberCount: 2, coveredMemberCount: 2 },
]

const weightMeta = { status: 'available' as const, provider: 'tushare', source: 'ths_member+daily_basic.total_mv', tradeDate: '2026-08-14' }

test('board page state keeps kind and order query values', () => {
  const state = createBoardPageState({ kind: 'concept', order: 'down' })
  assert.deepEqual(state, { kind: 'concept', order: 'down', view: 'list' })
})

test('board page state falls back to list and valid defaults', () => {
  const state = createBoardPageState({ kind: 'invalid', order: 'invalid', view: 'heatmap' })
  assert.deepEqual(state, { kind: 'industry', order: 'up', view: 'list' })
})

test('heatmap requires available provider metadata and complete real weights', () => {
  assert.deepEqual(heatmapAvailability(weightedRows, weightMeta), { available: true, reason: '' })
  assert.equal(heatmapAvailability(weightedRows, unavailableMeta).available, false)
  assert.equal(heatmapAvailability(weightedRows, partialMeta).available, false)
  assert.deepEqual(heatmapFlexWeights(weightedRows, weightMeta), [0.75, 0.25])
})

test('heatmap rejects inconsistent provider, source, date, and coverage', () => {
  assert.equal(heatmapAvailability([{ ...weightedRows[0], weightProvider: 'other' }, weightedRows[1]], weightMeta).available, false)
  assert.equal(heatmapAvailability([{ ...weightedRows[0], weightSource: 'other' }, weightedRows[1]], weightMeta).available, false)
  assert.equal(heatmapAvailability([{ ...weightedRows[0], weightTradeDate: '2026-08-13' }, weightedRows[1]], weightMeta).available, false)
  assert.equal(heatmapAvailability([{ ...weightedRows[0], coveredMemberCount: 3 }, weightedRows[1]], weightMeta).available, false)
  assert.equal(heatmapAvailability([{ ...weightedRows[0], weight: Number.NaN }, weightedRows[1]], weightMeta).available, false)
})

test('heatmap remains unavailable without metadata or real finite weights', () => {
  assert.equal(heatmapAvailability([]).available, false)
  assert.equal(heatmapAvailability([{ weight: 20, weightProvider: 'provider', weightSource: 'source' }]).available, false)
})

test('heatmap requires explicit member coverage', () => {
  assert.equal(heatmapAvailability([{ ...weightedRows[0], memberCount: undefined, coveredMemberCount: undefined }, weightedRows[1]], weightMeta).available, false)
})

test('heatmap weights normalize provider values only', () => {
  assert.deepEqual(heatmapFlexWeights(weightedRows, weightMeta), [0.75, 0.25])
})

test('board page still defaults to list when heatmap data is unavailable', () => {
  assert.equal(createBoardPageState({ kind: 'industry', order: 'up' }).view, 'list')
})

test('unavailable weight reasons use business copy instead of provider internals', () => {
  assert.equal(
    heatmapAvailability([], {
      ...unavailableMeta,
      reason: 'Tushare token is unavailable',
    }).reason,
    '暂无真实权重数据，热力图暂不可用',
  )
})
