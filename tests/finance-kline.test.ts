import test from 'node:test'
import assert from 'node:assert/strict'
import { filterKlinesBefore, mergeKlines, parseBeforeDate } from '../server/finance'

const bar = (date: string, close: number) => ({
  date, open: close, close, high: close, low: close,
  volume: 0, amount: 0, amplitude: 0, pct: 0, change: 0, turnover: 0,
})

test('parseBeforeDate accepts date and rejects future or malformed values', () => {
  assert.equal(parseBeforeDate('2026-08-01'), '2026-08-01')
  assert.equal(parseBeforeDate('2026-08-01T00:00:00.000Z'), '2026-08-01')
  assert.equal(parseBeforeDate('not-a-date'), null)
})

test('filterKlinesBefore removes bars at and after cursor and future bars', () => {
  const result = filterKlinesBefore([bar('2026-08-01', 3), bar('2026-08-02', 4)], '2026-08-02', '2026-08-01')
  assert.deepEqual(result.map((item) => item.date), [])
})

test('mergeKlines deduplicates by date and sorts ascending', () => {
  const result = mergeKlines([bar('2026-08-02', 2), bar('2026-08-03', 3)], [bar('2026-08-01', 1), bar('2026-08-02', 9)])
  assert.deepEqual(result.map((item) => [item.date, item.close]), [['2026-08-01', 1], ['2026-08-02', 9], ['2026-08-03', 3]])
})
