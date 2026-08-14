export interface Kline {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount: number
  amplitude: number
  pct: number
  change: number
  turnover: number
}

export interface SearchItem {
  quoteId: string
  code: string
  name: string
  type: string
  typeName: string
  market: string
}

export interface FundNavPoint {
  date: string
  nav: number
  accNav: number
  pct: number
}
