import test from 'node:test'
import assert from 'node:assert/strict'
import { filterKlinesBefore, mergeKlines, parseBeforeDate } from '../server/finance'
import {
  buildKlineParams,
  createHistoryRequestState,
  oldestKlineDate,
  calculatePrependCompensation,
  shouldLoadMoreHistory,
  shouldShowBlockingKlineError,
  shouldContinueHistory,
} from '../src/apps/finance/useFinance'

const bar = (date: string, close: number) => ({
  date, open: close, close, high: close, low: close,
  volume: 0, amount: 0, amplitude: 0, pct: 0, change: 0, turnover: 0,
})

test('parseBeforeDate accepts date and rejects future or malformed values', () => {
  assert.equal(parseBeforeDate('2026-08-01'), '2026-08-01')
  assert.equal(parseBeforeDate('2026-08-01T00:00:00.000Z'), '2026-08-01')
  assert.equal(parseBeforeDate('not-a-date'), null)
})

test('filterKlinesBefore keeps today, removes cursor and future bars', () => {
  const result = filterKlinesBefore([
    bar('2026-08-01', 3),
    bar('2026-08-02', 4),
    bar('2026-08-03', 5),
  ], '2026-08-03', '2026-08-02')
  assert.deepEqual(result.map((item) => item.date), ['2026-08-01', '2026-08-02'])
})

test('mergeKlines deduplicates by date and sorts ascending', () => {
  const result = mergeKlines([bar('2026-08-02', 2), bar('2026-08-03', 3)], [bar('2026-08-01', 1), bar('2026-08-02', 9)])
  assert.deepEqual(result.map((item) => [item.date, item.close]), [['2026-08-01', 1], ['2026-08-02', 9], ['2026-08-03', 3]])
})

test('buildKlineParams includes selected symbol, period, and history cursor', () => {
  const params = buildKlineParams({ quoteId: '1.600000', code: '600000', name: '浦发银行' }, 'sh600000', '2026-08-01')
  assert.equal(params.get('secid'), 'sh600000')
  assert.equal(params.get('symbol'), 'sh600000')
  assert.equal(params.get('klt'), '101')
  assert.equal(params.get('before'), '2026-08-01')
})

test('history request state accepts one request and rejects stale completion', () => {
  const state = createHistoryRequestState()
  assert.equal(state.begin(), 1)
  assert.equal(state.begin(), null)
  assert.equal(state.isCurrent(1), true)
  state.finish(1)
  assert.equal(state.isCurrent(1), false)
  assert.equal(state.begin(), 2)
})

test('prepend compensation restores old visible date by its new index', () => {
  assert.equal(
    calculatePrependCompensation(['2026-08-01', '2026-08-02', '2026-08-03'], '2026-08-03', 6),
    12,
  )
})

test('oldestKlineDate finds the true cursor regardless of order', () => {
  assert.equal(oldestKlineDate([bar('2026-08-03', 3), bar('2026-08-01', 1)]), '2026-08-01')
})

test('minute to day reset clears pending history state', () => {
  const state = createHistoryRequestState()
  state.begin()
  state.setPendingCompensation(18)
  state.reset()
  assert.equal(state.isLocked(), false)
  assert.equal(state.pendingCompensation(), 0)
})


test('future bars never enter merged history', () => {
  assert.deepEqual(
    filterKlinesBefore([bar('2026-08-15', 1), bar('2026-08-16', 2)], null, '2026-08-15').map((item) => item.date),
    ['2026-08-15'],
  )
})

test('history loading starts only near the left edge', () => {
  assert.equal(shouldLoadMoreHistory({ realFrom: 0, realTo: 20 }, true, false, true), true)
  assert.equal(shouldLoadMoreHistory({ realFrom: 12, realTo: 20 }, true, false, true), false)
  assert.equal(shouldLoadMoreHistory({ realFrom: 0, realTo: 20 }, false, false, true), false)
  assert.equal(shouldLoadMoreHistory({ realFrom: 0, realTo: 20 }, true, true, true), false)
  assert.equal(shouldLoadMoreHistory({ realFrom: 0, realTo: 20 }, true, false, false), false)
})

test('blocking K-line error requires no existing data', () => {
  assert.equal(shouldShowBlockingKlineError(true, false), true)
  assert.equal(shouldShowBlockingKlineError(true, true), false)
  assert.equal(shouldShowBlockingKlineError(false, false), false)
})

test('empty history pages stop further cursor requests', () => {
  assert.equal(shouldContinueHistory(true, 3), true)
  assert.equal(shouldContinueHistory(true, 0), false)
  assert.equal(shouldContinueHistory(false, 0), false)
})
