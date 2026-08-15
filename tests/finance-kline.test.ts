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
  CHART_MA_PERIODS,
  chartRightOffsetLimit,
  clampSplitterWidth,
  klineErrorMessage,
  parseTencentKlineTimestamp,
  createHistoryRequestState,
  oldestKlineDate,
  calculatePrependCompensation,
  shouldLoadMoreHistory,
  shouldShowBlockingKlineError,
  shouldContinueHistory,
  createRequestSequence,
  financeGridTemplate,
  watchlistLayout,
  candleAxisConfig,
  parseTencentMinuteRow,
  parseEastmoneyMinuteKlineRow,
  minuteChartLines,
  searchSelectionIndex,
  nextDrawerState,
  isPrimaryPointer,
  splitterAriaValue,
  restoreSearchSelection,
  searchErrorMessage,
  marketBoardGroups,
  type Quote,
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

test('chart MA periods include common short and long windows', () => {
  assert.deepEqual(CHART_MA_PERIODS, [5, 10, 20, 30, 60, 120, 250])
})

test('chart disallows right-side offset beyond the latest data', () => {
  assert.equal(chartRightOffsetLimit(), 0)
})

test('splitter width clamps to allowed range', () => {
  assert.equal(clampSplitterWidth(250, 200, 360), 250)
  assert.equal(clampSplitterWidth(100, 200, 360), 200)
  assert.equal(clampSplitterWidth(500, 200, 360), 360)
  assert.equal(clampSplitterWidth(300, 280, 480), 300)
  assert.equal(clampSplitterWidth(200, 280, 480), 280)
})

test('collapsed grid keeps a compact watchlist and 12px module spacing', () => {
  assert.equal(financeGridTemplate(true, 280, 360), '96px 12px minmax(520px, 1fr) 12px 360px')
  assert.equal(financeGridTemplate(false, 280, 360), '280px 12px minmax(520px, 1fr) 12px 360px')
})

test('candle axes keep price on the left and percentage on the right', () => {
  assert.deepEqual(candleAxisConfig(), {
    layout: { yAxis: { position: 'left' } },
    percentageAxis: {
      id: 'candle_percentage_axis',
      paneId: 'candle_pane',
      name: 'percentage',
      position: 'right',
    },
  })
})

test('market board groups keep domestic indexes before overseas indexes', () => {
  const domestic = [{ symbol: 'sh000001', name: '上证指数' }] as Quote[]
  const overseas = [{ symbol: 'usDJI', name: '道琼斯' }] as Quote[]
  assert.deepEqual(marketBoardGroups({ domestic, overseas }), [
    { key: 'domestic', label: '国内指数', quotes: domestic },
    { key: 'overseas', label: '海外指数', quotes: overseas },
  ])
})

test('watchlist layout stacks compact quote values inside the collapsed rail', () => {
  assert.equal(watchlistLayout(280), 'wide')
  assert.equal(watchlistLayout(96), 'compact')
  assert.equal(watchlistLayout(120), 'compact')
})

test('Tencent minute rows preserve average price and cumulative values', () => {
  assert.deepEqual(parseTencentMinuteRow('0930 3930.02 100 123456.00'), {
    time: '0930',
    price: 3930.02,
    avg: 1234.56,
    volume: 100,
    amount: 123456,
  })
})

test('Eastmoney minute K rows map to real OHLC and turnover data', () => {
  assert.deepEqual(parseEastmoneyMinuteKlineRow('2026-08-15 09:35,10,10.2,10.3,9.9,1000,20000,3,2,0.2,1.5'), {
    date: '2026-08-15 09:35',
    open: 10,
    close: 10.2,
    high: 10.3,
    low: 9.9,
    volume: 1000,
    amount: 20000,
    amplitude: 4.040404040404043,
    pct: 2,
    change: 0.2,
    turnover: 1.5,
  })
})

test('minute chart lines keep price, average, and volume as separate series', () => {
  assert.deepEqual(minuteChartLines([
    { time: '0930', price: 10, avg: 9.9, volume: 100, amount: 1000 },
    { time: '0931', price: 10.2, avg: 10, volume: 150, amount: 1500 },
  ], 9.8), {
    price: [10, 10.2],
    average: [9.9, 10],
    volume: [100, 150],
    baseline: [9.8, 9.8],
  })
})

test('minute chart points retain data source failure separately from empty data', () => {
  assert.equal(parseEastmoneyMinuteKlineRow(''), null)
})

test('search selection falls back to the first suggestion', () => {
  assert.equal(searchSelectionIndex(-1, 3), 0)
  assert.equal(searchSelectionIndex(1, 3), 1)
  assert.equal(searchSelectionIndex(3, 3), 0)
  assert.equal(searchSelectionIndex(-1, 0), -1)
})

test('drawer state keeps only one mobile drawer open', () => {
  assert.deepEqual(nextDrawerState('left', true), { left: true, right: false })
  assert.deepEqual(nextDrawerState('right', true), { left: false, right: true })
  assert.deepEqual(nextDrawerState('left', false), { left: false, right: false })
})

test('splitter only accepts the primary pointer', () => {
  assert.equal(isPrimaryPointer({ button: 0 }), true)
  assert.equal(isPrimaryPointer({ button: 2 }), false)
})

test('splitter aria value stays inside its configured range', () => {
  assert.equal(splitterAriaValue(180, 200, 360), 200)
  assert.equal(splitterAriaValue(300, 200, 360), 300)
  assert.equal(splitterAriaValue(420, 200, 360), 360)
})

test('search selection resets when suggestions disappear or shrink', () => {
  assert.equal(restoreSearchSelection(2, 3), 2)
  assert.equal(restoreSearchSelection(2, 2), -1)
  assert.equal(restoreSearchSelection(0, 0), -1)
})

test('search errors expose a user-facing retry message', () => {
  assert.equal(searchErrorMessage(new Error('网络不可用')), '网络不可用')
  assert.equal(searchErrorMessage(new Error()), '搜索失败，请稍后重试')
})
