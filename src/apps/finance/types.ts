export type CandlePeriod = 'day' | 'week' | 'month'
export type MinuteInterval = '1' | '5' | '15' | '30' | '60'
export type ChartPeriod = CandlePeriod | MinuteInterval
export type ChartView = 'minute' | 'candle'
export type ChartSelection = 'minute' | CandlePeriod | MinuteInterval
export type SubIndicator = 'VOL' | 'MACD' | 'KDJ' | 'RSI' | 'BOLL'

export interface ChartPrefs {
  chartView: ChartView
  candlePeriod: CandlePeriod
  interval: MinuteInterval
  showMA: boolean
  enabledMA: number[]
  subIndicator: SubIndicator
}

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

export interface KlinePage {
  klines: Kline[]
  hasMore: boolean
  oldest: string | null
  latest: string | null
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

export interface QuoteDetail {
  symbol: string
  name: string
  code: string
  price: number
  prevClose: number
  change: number
  pct: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  turnover: number
  amplitude: number
  volumeRatio: number
}

export interface BoardRow {
  code: string
  name: string
  pct: number
  leaderName: string
  leaderPct: number
  upCount: number
  downCount: number
  netInflow: number
  kind: 'industry' | 'concept'
}

export interface MinutePoint {
  time: string
  price: number
  avg: number
}
