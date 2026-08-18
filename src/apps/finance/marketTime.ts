export type MarketSession = 'pre-open' | 'morning' | 'lunch' | 'afternoon' | 'closed'

const HOLIDAYS_2026 = new Set([
  '1-1',
  '2-17', '2-18', '2-19', '2-20', '2-21', '2-22', '2-23',
  '4-4', '4-5', '4-6',
  '5-1', '5-2', '5-3', '5-4', '5-5',
  '6-19', '6-20', '6-21',
  '9-25', '9-26', '9-27',
  '10-1', '10-2', '10-3', '10-4', '10-5', '10-6', '10-7', '10-8',
])

function isHoliday(bjDate: Date): boolean {
  const key = `${bjDate.getUTCMonth() + 1}-${bjDate.getUTCDate()}`
  return HOLIDAYS_2026.has(key)
}

export function marketSession(date = new Date()): MarketSession {
  const bj = new Date(date.getTime() + 8 * 60 * 60_000)
  const day = bj.getUTCDay()
  if (day === 0 || day === 6) return 'closed'
  if (isHoliday(bj)) return 'closed'

  const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
  if (minutes < 9 * 60 + 15) return 'closed'
  if (minutes < 9 * 60 + 30) return 'pre-open'
  if (minutes < 11 * 60 + 30) return 'morning'
  if (minutes < 13 * 60) return 'lunch'
  if (minutes < 15 * 60) return 'afternoon'
  return 'closed'
}

export function isMarketOpen(date?: Date): boolean {
  const s = marketSession(date)
  return s === 'morning' || s === 'afternoon' || s === 'pre-open'
}
