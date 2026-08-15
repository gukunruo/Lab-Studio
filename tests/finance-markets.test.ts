import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MARKET_KEYS,
  MARKET_CATALOG,
  buildMarketGroups,
  normalizeMarketQuotes,
  type Quote,
} from '../server/finance'
import {
  FRONTEND_MARKET_KEYS,
  createMarketRequestState,
  marketGroupForKey,
} from '../src/apps/finance/useFinance'
import type { MarketGroup } from '../src/apps/finance/types'

const marketGroup = (key: MarketGroup['key'], status: MarketGroup['status'] = 'ok'): MarketGroup => ({
  key,
  label: key,
  provider: 'tencent',
  source: 'qt.gtimg.cn',
  status,
  quotes: [],
})

const quote = (symbol: string, overrides: Partial<Quote> = {}): Quote => ({
  symbol,
  name: '测试指数',
  code: symbol,
  price: 100,
  prevClose: 99,
  change: 1,
  pct: 1.01,
  open: 99,
  high: 101,
  low: 98,
  volume: 100,
  amount: 1000,
  time: '2026-08-16 10:00:00',
  turnover: 0,
  amplitude: 3,
  volumeRatio: 1,
  pe: 0,
  totalMarketCap: 0,
  floatMarketCap: 0,
  ...overrides,
})

test('market catalog exposes the four markets in stable order', () => {
  assert.deepEqual(MARKET_KEYS, ['cn', 'global', 'hk', 'us'])
  assert.ok(MARKET_CATALOG.cn.length >= 5)
  assert.ok(MARKET_CATALOG.global.length >= 4)
  assert.ok(MARKET_CATALOG.hk.length >= 3)
  assert.ok(MARKET_CATALOG.us.length >= 4)
})

test('normalizing market quotes keeps provider data only once and adds source metadata', () => {
  const items = [{ symbol: 'sh000001', name: '上证指数' }]
  const result = normalizeMarketQuotes(
    [quote('sh000001'), quote('sh000001', { price: 101 }), quote('sz399001')],
    items,
    '2026-08-16T00:00:00.000Z',
  )
  assert.equal(result.length, 1)
  assert.equal(result[0]?.price, 100)
  assert.equal(result[0]?.name, '上证指数')
  assert.equal(result[0]?.provider, 'tencent')
  assert.equal(result[0]?.source, 'qt.gtimg.cn')
  assert.equal(result[0]?.fetchedAt, '2026-08-16T00:00:00.000Z')
})

test('normalizing market quotes rejects missing or non-finite quote values', () => {
  const items = [{ symbol: 'sh000001', name: '上证指数' }]
  const result = normalizeMarketQuotes(
    [
      quote('sh000001', { price: Number.NaN }),
      quote('sh000001', { pct: Number.POSITIVE_INFINITY }),
      quote('sh000001', { price: 101, pct: 2 }),
    ],
    items,
    '2026-08-16T00:00:00.000Z',
  )
  assert.equal(result.length, 1)
  assert.equal(result[0]?.price, 101)
})

test('frontend market navigation keeps the provider order and selects one group', () => {
  assert.deepEqual(FRONTEND_MARKET_KEYS, ['cn', 'global', 'hk', 'us'])
  const groups = FRONTEND_MARKET_KEYS.map((key) => marketGroup(key))
  assert.equal(marketGroupForKey(groups, 'hk')?.key, 'hk')
  assert.equal(marketGroupForKey(groups, 'us')?.label, 'us')
  assert.equal(marketGroupForKey(groups, 'cn')?.status, 'ok')
})

test('market request state ignores a stale response after switching markets', () => {
  const state = createMarketRequestState()
  const first = state.begin()
  const second = state.begin()
  assert.equal(state.isCurrent(first), false)
  assert.equal(state.isCurrent(second), true)
  state.finish(first)
  assert.equal(state.isCurrent(second), true)
  state.finish(second)
  assert.equal(state.isCurrent(second), false)
})

test('market groups preserve order and mark empty provider groups unavailable', () => {
  const groups = buildMarketGroups(
    {
      cn: [quote('sh000001')],
      global: [],
      hk: [quote('hkHSI')],
      us: [],
    },
    '2026-08-16T00:00:00.000Z',
  )
  assert.deepEqual(groups.map((group) => group.key), ['cn', 'global', 'hk', 'us'])
  assert.equal(groups[0]?.status, 'ok')
  assert.equal(groups[1]?.status, 'unavailable')
  assert.equal(groups[1]?.quotes.length, 0)
  assert.match(groups[1]?.error ?? '', /provider/i)
})
