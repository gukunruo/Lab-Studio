import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { marketSession, isMarketOpen } from '../src/apps/finance/marketTime'

function bjTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  // 构造一个在北京时间对应时刻的 UTC Date
  // 北京时间 = UTC+8，所以 UTC = 北京时间 - 8
  const utcHour = hour - 8
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute))
}

describe('marketSession', () => {
  it('returns pre-open at 9:25 on a weekday', () => {
    // 2026-08-17 is a Monday
    assert.equal(marketSession(bjTime(2026, 8, 17, 9, 25)), 'pre-open')
  })

  it('returns morning at 10:00 on a weekday', () => {
    assert.equal(marketSession(bjTime(2026, 8, 17, 10, 0)), 'morning')
  })

  it('returns lunch at 12:00 on a weekday', () => {
    assert.equal(marketSession(bjTime(2026, 8, 17, 12, 0)), 'lunch')
  })

  it('returns afternoon at 14:00 on a weekday', () => {
    assert.equal(marketSession(bjTime(2026, 8, 17, 14, 0)), 'afternoon')
  })

  it('returns closed at 15:01 on a weekday', () => {
    assert.equal(marketSession(bjTime(2026, 8, 17, 15, 1)), 'closed')
  })

  it('returns closed before 9:15 on a weekday', () => {
    assert.equal(marketSession(bjTime(2026, 8, 17, 9, 0)), 'closed')
  })

  it('returns closed on Saturday', () => {
    // 2026-08-22 is a Saturday
    assert.equal(marketSession(bjTime(2026, 8, 22, 10, 0)), 'closed')
  })

  it('returns closed on Sunday', () => {
    // 2026-08-23 is a Sunday
    assert.equal(marketSession(bjTime(2026, 8, 23, 10, 0)), 'closed')
  })

  it('returns closed on a holiday', () => {
    // 2026-10-01 is National Day
    assert.equal(marketSession(bjTime(2026, 10, 1, 10, 0)), 'closed')
  })

  it('returns closed on Spring Festival', () => {
    // 2026-02-17 is Spring Festival
    assert.equal(marketSession(bjTime(2026, 2, 17, 10, 0)), 'closed')
  })
})

describe('isMarketOpen', () => {
  it('returns true during morning session', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 17, 10, 0)), true)
  })

  it('returns true during afternoon session', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 17, 14, 0)), true)
  })

  it('returns true during pre-open (集合竞价)', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 17, 9, 20)), true)
  })

  it('returns false during lunch', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 17, 12, 0)), false)
  })

  it('returns false after close', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 17, 15, 1)), false)
  })

  it('returns false on weekend', () => {
    assert.equal(isMarketOpen(bjTime(2026, 8, 22, 10, 0)), false)
  })

  it('returns false on holiday', () => {
    assert.equal(isMarketOpen(bjTime(2026, 10, 1, 10, 0)), false)
  })
})
