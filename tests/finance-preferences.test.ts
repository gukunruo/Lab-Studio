import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FINANCE_PREFERENCES,
  normalizeFinancePreferences,
} from '../server/finance'

test('default preferences have sensible terminal values', () => {
  assert.equal(DEFAULT_FINANCE_PREFERENCES.leftCollapsed, false)
  assert.equal(DEFAULT_FINANCE_PREFERENCES.rightCollapsed, false)
  assert.equal(DEFAULT_FINANCE_PREFERENCES.rightPanel, 'ai')
  assert.equal(DEFAULT_FINANCE_PREFERENCES.chartView, 'candle')
  assert.equal(DEFAULT_FINANCE_PREFERENCES.candlePeriod, 'day')
  assert.equal(DEFAULT_FINANCE_PREFERENCES.interval, '5')
  assert.equal(DEFAULT_FINANCE_PREFERENCES.showMA, true)
  assert.deepEqual(DEFAULT_FINANCE_PREFERENCES.enabledMA, [5, 10, 20, 60])
  assert.equal(DEFAULT_FINANCE_PREFERENCES.subIndicator, 'VOL')
})

test('normalization returns defaults for null input', () => {
  assert.deepEqual(normalizeFinancePreferences(null), DEFAULT_FINANCE_PREFERENCES)
  assert.deepEqual(normalizeFinancePreferences({}), DEFAULT_FINANCE_PREFERENCES)
})

test('left and right widths clamp to allowed range', () => {
  const wide = normalizeFinancePreferences({ leftWidth: 100, rightWidth: 9999 })
  assert.equal(wide.leftWidth, 200)
  assert.equal(wide.rightWidth, 480)
  const narrow = normalizeFinancePreferences({ leftWidth: 400, rightWidth: 200 })
  assert.equal(narrow.leftWidth, 360)
  assert.equal(narrow.rightWidth, 280)
})

test('rightPanel falls back to default for unknown values', () => {
  assert.equal(normalizeFinancePreferences({ rightPanel: 'boards' }).rightPanel, 'boards')
  assert.equal(normalizeFinancePreferences({ rightPanel: 'nope' }).rightPanel, 'ai')
})

test('candlePeriod falls back to day for unknown values', () => {
  assert.equal(normalizeFinancePreferences({ candlePeriod: 'week' }).candlePeriod, 'week')
  assert.equal(normalizeFinancePreferences({ candlePeriod: '5d' }).candlePeriod, 'day')
})

test('interval falls back to default for unsupported values', () => {
  assert.equal(normalizeFinancePreferences({ interval: '15' }).interval, '15')
  assert.equal(normalizeFinancePreferences({ interval: '120' }).interval, '5')
})

test('enabledMA filters to known periods, deduplicates, and sorts', () => {
  const result = normalizeFinancePreferences({ enabledMA: [250, 5, 5, 999, 10, 20] })
  assert.deepEqual(result.enabledMA, [5, 10, 20, 250])
})

test('normalization ignores userKey, id, updatedAt, and credentials', () => {
  const result = normalizeFinancePreferences({
    userKey: 'attacker',
    id: 42,
    updatedAt: '2099-01-01',
    token: 'secret',
    leftWidth: 300,
  })
  assert.equal(result.leftWidth, 300)
  assert.equal('userKey' in result, false)
  assert.equal('id' in result, false)
  assert.equal('updatedAt' in result, false)
  assert.equal('token' in result, false)
})

test('leftCollapsed, rightCollapsed, and showMA coerce non-booleans to defaults', () => {
  assert.equal(normalizeFinancePreferences({ leftCollapsed: 'yes' }).leftCollapsed, false)
  assert.equal(normalizeFinancePreferences({ leftCollapsed: 1 }).leftCollapsed, false)
  assert.equal(normalizeFinancePreferences({ rightCollapsed: 'yes' }).rightCollapsed, false)
  assert.equal(normalizeFinancePreferences({ rightCollapsed: 1 }).rightCollapsed, false)
  assert.equal(normalizeFinancePreferences({ rightCollapsed: true }).rightCollapsed, true)
  assert.equal(normalizeFinancePreferences({ showMA: 'true' }).showMA, false)
  assert.equal(normalizeFinancePreferences({ showMA: 0 }).showMA, false)
})

 test('rightCollapsed uses the default when omitted or null', () => {
  assert.equal(normalizeFinancePreferences({}).rightCollapsed, false)
  assert.equal(normalizeFinancePreferences({ rightCollapsed: null }).rightCollapsed, false)
})

test('subIndicator falls back to VOL for unknown values', () => {
  assert.equal(normalizeFinancePreferences({ subIndicator: 'MACD' }).subIndicator, 'MACD')
  assert.equal(normalizeFinancePreferences({ subIndicator: 'XYZ' }).subIndicator, 'VOL')
})

test('chartView falls back to candle for unknown values', () => {
  assert.equal(normalizeFinancePreferences({ chartView: 'minute' }).chartView, 'minute')
  assert.equal(normalizeFinancePreferences({ chartView: 'unknown' }).chartView, 'candle')
})
