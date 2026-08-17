import test from 'node:test'
import assert from 'node:assert/strict'
import { boardPageQuery, createBoardPageState, heatmapAvailability, heatmapFlexWeights } from '../src/apps/finance/boards'

const availableMeta = {
  status: 'available' as const,
  provider: 'eastmoney',
  source: 'eastmoney_board_directory.f20.total_market_cap',
  tradeDate: '2026-08-14',
}

const unavailableMeta = {
  status: 'unavailable' as const,
  provider: 'eastmoney',
  source: 'eastmoney_board_directory.f20.total_market_cap',
  tradeDate: null,
}

const partialMeta = { ...availableMeta, status: 'partial' as const }

const weightedRows = [
  { weight: 75, weightProvider: 'eastmoney', weightSource: 'eastmoney_board_directory.f20.total_market_cap', weightTradeDate: '2026-08-14', memberCount: 4, coveredMemberCount: 4 },
  { weight: 25, weightProvider: 'eastmoney', weightSource: 'eastmoney_board_directory.f20.total_market_cap', weightTradeDate: '2026-08-14', memberCount: 2, coveredMemberCount: 2 },
]

const weightMeta = { status: 'available' as const, provider: 'eastmoney', source: 'eastmoney_board_directory.f20.total_market_cap', tradeDate: '2026-08-14' }

test('board page state keeps kind and order values while defaulting to heatmap', () => {
  const state = createBoardPageState({ kind: 'concept', order: 'down' })
  assert.deepEqual(state, { kind: 'concept', order: 'down', view: 'heatmap' })
})

test('board page state normalizes invalid and legacy list values to heatmap', () => {
  const state = createBoardPageState({ kind: 'invalid', order: 'invalid', view: 'list' })
  assert.deepEqual(state, { kind: 'industry', order: 'up', view: 'heatmap' })
})

test('board query only writes the category and order filters', () => {
  assert.deepEqual(boardPageQuery(createBoardPageState({ kind: 'concept', order: 'down' })), {
    kind: 'concept',
    order: 'down',
  })
})

test('product and board tracking labels stay stable', () => {
  assert.equal('AI Finance', 'AI Finance')
  assert.equal('板块跟踪', '板块跟踪')
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

test('heatmap accepts an explicitly labeled board-total weight without member coverage', () => {
  const rows = [
    { ...weightedRows[0], memberCount: undefined, coveredMemberCount: undefined, weightCoverage: 'board-total' as const, weightCoverageLabel: '板块总市值' },
    { ...weightedRows[1], memberCount: undefined, coveredMemberCount: undefined, weightCoverage: 'board-total' as const, weightCoverageLabel: '板块总市值' },
  ]
  assert.equal(heatmapAvailability(rows, weightMeta).available, true)
})

test('heatmap accepts an explicitly labeled provider value without market-cap semantics', () => {
  const rows = weightedRows.map((row) => ({
    ...row,
    weightProvider: 'wenyuan' as const,
    weightSource: 'map.wenyuanw.me/api/heatmap/treemap' as const,
    memberCount: undefined,
    coveredMemberCount: undefined,
    weightCoverage: 'provider-value' as const,
    weightCoverageLabel: '公开热力图面积值',
  }))
  assert.equal(heatmapAvailability(rows, {
    ...weightMeta,
    provider: 'wenyuan',
    source: 'map.wenyuanw.me/api/heatmap/treemap',
  }).available, true)
  assert.equal(heatmapAvailability(rows, {
    ...weightMeta,
    provider: 'wenyuan',
    source: 'map.wenyuanw.me/api/heatmap/treemap',
  }).reason, '')
})

test('heatmap rejects an unlabeled provider value', () => {
  const rows = weightedRows.map((row) => ({
    ...row,
    weightCoverage: 'provider-value' as const,
    weightCoverageLabel: undefined,
  }))
  assert.equal(heatmapAvailability(rows, {
    ...weightMeta,
    provider: 'wenyuan',
    source: 'map.wenyuanw.me/api/heatmap/treemap',
  }).available, false)
})

test('heatmap requires explicit member coverage', () => {
  assert.equal(heatmapAvailability([{ ...weightedRows[0], memberCount: undefined, coveredMemberCount: undefined }, weightedRows[1]], weightMeta).available, false)
})


test('heatmap weights normalize provider values only', () => {
  assert.deepEqual(heatmapFlexWeights(weightedRows, weightMeta), [0.75, 0.25])
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
