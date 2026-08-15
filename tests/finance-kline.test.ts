import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterKlinesBefore,
  isSupportedKlinePeriod,
  supportsTencentMinuteSymbol,
  mergeKlines,
  parseBeforeDate,
  normalizeMinuteKlineInterval,
} from '../server/finance'
import {
  buildKlineParams,
  klineErrorMessage,
  parseTencentKlineTimestamp,
  createHistoryRequestState,
  oldestKlineDate,
  calculatePrependCompensation,
  shouldLoadMoreHistory,
  shouldShowBlockingKlineError,
  shouldContinueHistory,
  createRequestSequence,
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

test('request sequence rejects responses from an earlier selection', () => {
  const sequence = createRequestSequence()
  const first = sequence.begin()
  const second = sequence.begin()
  assert.equal(sequence.isCurrent(first), false)
  assert.equal(sequence.isCurrent(second), true)
})

test('kline periods allow daily, weekly, monthly, and supported minute intervals only', () => {
  assert.equal(isSupportedKlinePeriod('101'), true)
  assert.equal(isSupportedKlinePeriod('102'), true)
  assert.equal(isSupportedKlinePeriod('103'), true)
  assert.equal(isSupportedKlinePeriod('1'), true)
  assert.equal(isSupportedKlinePeriod('60'), true)
  assert.equal(isSupportedKlinePeriod('5d'), false)
  assert.equal(isSupportedKlinePeriod('240'), false)
})

test('minute K-line interval accepts only real provider intervals', () => {
  assert.equal(normalizeMinuteKlineInterval('1'), '1')
  assert.equal(normalizeMinuteKlineInterval('5'), '5')
  assert.equal(normalizeMinuteKlineInterval('15'), '15')
  assert.equal(normalizeMinuteKlineInterval('30'), '30')
  assert.equal(normalizeMinuteKlineInterval('60'), '60')
  assert.equal(normalizeMinuteKlineInterval('5d'), null)
  assert.equal(normalizeMinuteKlineInterval('120'), null)
})

test('minute K-lines are limited to Tencent China and Hong Kong symbols', () => {
  assert.equal(supportsTencentMinuteSymbol('sh600000'), true)
  assert.equal(supportsTencentMinuteSymbol('sz000001'), true)
  assert.equal(supportsTencentMinuteSymbol('hk00700'), true)
  assert.equal(supportsTencentMinuteSymbol('us.DJI'), false)
})

test('K-line errors retain the server-provided unsupported reason', () => {
  assert.equal(klineErrorMessage({ error: '该标的不支持分钟 K 线' }), '该标的不支持分钟 K 线')
  assert.equal(klineErrorMessage(null), '加载失败')
})

test('Tencent local minute timestamps use the exchange offset', () => {
  assert.equal(parseTencentKlineTimestamp('2026-08-15 10:00'), Date.parse('2026-08-15T10:00:00+08:00'))
  assert.equal(parseTencentKlineTimestamp('2026-08-15'), Date.parse('2026-08-15T00:00:00Z'))
})
