import type { Kline } from './types'

// 技术指标纯函数。约定：所有返回数组与输入等长，前导不足周期的位置填 null。

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!
    if (i >= period) sum -= values[i - period]!
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null)
      continue
    }
    if (prev === null) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]!
      prev = sum / period
    } else {
      prev = values[i]! * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export interface MacdResult {
  dif: (number | null)[]
  dea: (number | null)[]
  macd: (number | null)[]
}

export function macd(closes: number[]): MacdResult {
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const dif: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    const a = ema12[i]
    const b = ema26[i]
    dif.push(a != null && b != null ? a - b : null)
  }
  // DEA 是 DIF 的 9 周期 EMA，跳过 null 段计算。
  const difNonNull: number[] = []
  const difIndex: number[] = []
  dif.forEach((v, i) => {
    if (v != null) {
      difNonNull.push(v)
      difIndex.push(i)
    }
  })
  const deaRaw = ema(difNonNull, 9)
  const dea: (number | null)[] = new Array(closes.length).fill(null)
  difIndex.forEach((idx, j) => {
    const val = deaRaw[j]
    if (val != null) dea[idx] = val
  })
  const macdArr: (number | null)[] = closes.map((_, i) =>
    dif[i] != null && dea[i] != null ? (dif[i]! - dea[i]!) * 2 : null,
  )
  return { dif, dea, macd: macdArr }
}

export function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)
    if (i <= period) {
      gainSum += gain
      lossSum += loss
      if (i === period) {
        out.push(lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum))
      } else {
        out.push(null)
      }
    } else {
      gainSum = (gainSum * (period - 1) + gain) / period
      lossSum = (lossSum * (period - 1) + loss) / period
      out.push(lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum))
    }
  }
  out.unshift(null)
  return out
}

export interface KdjResult {
  k: (number | null)[]
  d: (number | null)[]
  j: (number | null)[]
}

export function kdj(klines: Kline[], period = 9): KdjResult {
  const k: (number | null)[] = []
  const d: (number | null)[] = []
  const j: (number | null)[] = []
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < klines.length; i++) {
    const start = Math.max(0, i - period + 1)
    let hh = -Infinity
    let ll = Infinity
    for (let t = start; t <= i; t++) {
      hh = Math.max(hh, klines[t]!.high)
      ll = Math.min(ll, klines[t]!.low)
    }
    const close = klines[i]!.close
    const rsv = hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100
    if (i < period - 1) {
      k.push(null)
      d.push(null)
      j.push(null)
      continue
    }
    prevK = (2 / 3) * prevK + (1 / 3) * rsv
    prevD = (2 / 3) * prevD + (1 / 3) * prevK
    k.push(prevK)
    d.push(prevD)
    j.push(3 * prevK - 2 * prevD)
  }
  return { k, d, j }
}

export interface BollResult {
  mid: (number | null)[]
  upper: (number | null)[]
  lower: (number | null)[]
}

export function boll(closes: number[], period = 20, mult = 2): BollResult {
  const mid = sma(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(null)
      lower.push(null)
      continue
    }
    let variance = 0
    const m = mid[i]!
    for (let t = i - period + 1; t <= i; t++) variance += (closes[t]! - m) ** 2
    const sd = Math.sqrt(variance / period)
    upper.push(m + mult * sd)
    lower.push(m - mult * sd)
  }
  return { mid, upper, lower }
}

// 量比：当日成交量 / 前 5 日平均成交量；前 5 根返回 null。
export function volumeRatio(volumes: number[], period = 5): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < volumes.length; i++) {
    if (i < period) {
      out.push(null)
      continue
    }
    let sum = 0
    for (let t = i - period; t < i; t++) sum += volumes[t]!
    const avg = sum / period
    out.push(avg === 0 ? null : volumes[i]! / avg)
  }
  return out
}

export function closesOf(klines: Kline[]): number[] {
  return klines.map((k) => k.close)
}

export function volumesOf(klines: Kline[]): number[] {
  return klines.map((k) => k.volume)
}
