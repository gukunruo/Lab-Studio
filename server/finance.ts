import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { financePreferences, watchlist } from './db/schema'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 单管理员模式，自选数据归属这个固定键。
const USER_KEY = 'admin'

// ---- 内存缓存（行情为公开数据，缓存 60s，避免切换/轮询打到上游）----
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL = 60_000

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.value as T
}

function cacheSet(key: string, value: unknown, ttl = CACHE_TTL): void {
  cache.set(key, { value, expiresAt: Date.now() + ttl })
}

// 上游全局节流：两次请求最小间隔，避免短时间内对同一上游连打。
let lastUpstreamAt = 0
const MIN_UPSTREAM_INTERVAL = 300

async function throttleUpstream(): Promise<void> {
  const elapsed = Date.now() - lastUpstreamAt
  if (elapsed < MIN_UPSTREAM_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_UPSTREAM_INTERVAL - elapsed))
  }
  lastUpstreamAt = Date.now()
}

// ---- 类型 ----
export interface SearchItem {
  quoteId: string
  code: string
  name: string
  type: string
  typeName: string
  market: string
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

export interface KlineResponse {
  code: string
  name: string
  secid: string
  klt: string
  klines: Kline[]
  hasMore: boolean
  oldest: string | null
  latest: string | null
}

const CANDLE_KLINE_PERIODS = new Set(['101', '102', '103'])
const MINUTE_KLINE_PERIODS = new Set(['1', '5', '15', '30', '60'])

export function normalizeMinuteKlineInterval(value: string | undefined): string | null {
  return value && MINUTE_KLINE_PERIODS.has(value) ? value : null
}

export function isSupportedKlinePeriod(value: string): boolean {
  return CANDLE_KLINE_PERIODS.has(value) || normalizeMinuteKlineInterval(value) !== null
}

export function supportsTencentMinuteSymbol(symbol: string): boolean {
  return /^(?:sh|sz|hk)\w+$/i.test(symbol)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Normalize a pagination cursor and reject malformed or future dates. */
export function parseBeforeDate(value: string | undefined): string | null {
  if (!value) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const parsed = dateOnly ? new Date(`${value}T00:00:00.000Z`) : new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const normalized = parsed.toISOString().slice(0, 10)
  if (dateOnly && normalized !== value) return null
  if (normalized > todayUtc()) return null
  return normalized
}

export function filterKlinesBefore(klines: Kline[], before: string | null, today: string): Kline[] {
  return klines
    .filter((item) => item.date <= today && (before === null || item.date < before))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function mergeKlines(existing: Kline[], incoming: Kline[]): Kline[] {
  const byDate = new Map(existing.map((item) => [item.date, item]))
  for (const item of incoming) byDate.set(item.date, item)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function klineMeta(klines: Kline[], hasMore: boolean): Pick<KlineResponse, 'hasMore' | 'oldest' | 'latest'> {
  return {
    hasMore,
    oldest: klines[0]?.date ?? null,
    latest: klines.at(-1)?.date ?? null,
  }
}

function finalizeKlineWindow(
  fallback: { klines: Kline[]; hasMore: boolean },
  before: string | null,
  today: string,
  limit: number,
): { klines: Kline[]; hasMore: boolean } {
  const filtered = filterKlinesBefore(fallback.klines, before, today)
  return {
    klines: filtered.slice(-limit),
    hasMore: fallback.hasMore || filtered.length > limit,
  }
}

function makeKlineResponse(
  fallback: { code: string; name: string; klines: Kline[]; hasMore: boolean },
  secid: string,
  klt: string,
  limit: number,
  before: string | null,
): KlineResponse {
  const window = finalizeKlineWindow(fallback, before, todayUtc(), limit)
  return {
    code: fallback.code,
    name: fallback.name,
    secid,
    klt,
    ...window,
    ...klineMeta(window.klines, window.hasMore),
  }
}

function sourceWindow<T extends { klines: Kline[] }>(source: T, limit: number): T & { hasMore: boolean } {
  return {
    ...source,
    klines: source.klines.slice(-limit - 1),
    hasMore: source.klines.length > limit,
  }
}


export interface FundNavPoint {
  date: string
  nav: number
  accNav: number
  pct: number
}

export interface Quote {
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
  time: string
  turnover: number
  amplitude: number
  volumeRatio: number
  pe: number
  totalMarketCap: number
  floatMarketCap: number
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
  volume: number
  amount: number
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

// ---- 通用抓取 ----
async function fetchText(url: string, referer: string, isGbk = false): Promise<string | null> {
  try {
    await throttleUpstream()
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: referer, Accept: '*/*' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    if (isGbk) {
      const buf = await response.arrayBuffer()
      return new TextDecoder('gbk').decode(buf)
    }
    return await response.text()
  } catch {
    return null
  }
}

async function fetchJson(url: string, referer: string): Promise<unknown> {
  const text = await fetchText(url, referer)
  if (text == null) throw new Error('fetch failed')
  return JSON.parse(text)
}

// ---- 腾讯实时行情 ----
// 腾讯 qt.gtimg.cn 返回 GBK 编码的 JS 赋值串：
// v_sh000001="<field0>~<field1>~..."; 字段以 ~ 分隔。
// 关键字段：1=名称 2=代码 3=当前价 4=昨收 5=今开 6=成交量(手) 30=时间
// 31=涨跌额 32=涨跌幅% 33=最高 34=最低 37=成交额(万)
function parseTencentQuoteLine(line: string): Quote | null {
  const m = line.match(/v_(\w+)="([^"]*)"/)
  if (!m) return null
  const symbol = m[1]!
  const f = m[2]!.split('~')
  const num = (s: string | undefined) => Number(s ?? 0)
  const price = num(f[3])
  if (!f[2] && !f[1]) return null
  return {
    symbol,
    name: f[1] ?? '',
    code: f[2] ?? symbol,
    price,
    prevClose: num(f[4]),
    change: num(f[31]),
    pct: num(f[32]),
    open: num(f[5]),
    high: num(f[33]),
    low: num(f[34]),
    volume: num(f[6]),
    amount: num(f[37]),
    time: f[30] ?? '',
    turnover: num(f[38]),
    amplitude: num(f[43]),
    volumeRatio: num(f[49]),
    pe: num(f[39]),
    totalMarketCap: num(f[45]),
    floatMarketCap: num(f[44]),
  }
}

async function fetchTencentQuotes(symbols: string[]): Promise<Quote[]> {
  if (!symbols.length) return []
  const url = `https://qt.gtimg.cn/q=${symbols.join(',')}`
  const text = await fetchText(url, 'https://gu.qq.com/', true)
  if (!text) return []
  return text
    .split(';')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('v_'))
    .map(parseTencentQuoteLine)
    .filter((q): q is Quote => q != null)
}

// ---- 搜索（东方财富 suggest，唯一保留的东财入口）----
async function searchEastmoney(q: string): Promise<SearchItem[]> {
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`
  const data = (await fetchJson(url, 'https://www.eastmoney.com/')) as {
    QuotationCodeTable?: { Data?: Array<Record<string, string>> }
  }
  return (data.QuotationCodeTable?.Data ?? [])
    .map((row) => ({
      quoteId: row.QuoteID ?? '',
      code: row.Code ?? '',
      name: row.Name ?? '',
      type: row.Classify ?? '',
      typeName: row.SecurityTypeName ?? '',
      market: row.MktNum ?? '',
    }))
    .filter((item) => item.quoteId && item.code && item.name)
}

// ---- 腾讯 K 线（个股/ETF/指数主源）----
// 东财 market → 腾讯 symbol：
// 1=沪A/沪指数, 0=深A/深指数, 116=港股, 100=环球指数（美股指数带点走 kline/kline 接口）
// 105/106/107=美股个股，腾讯 fqkline 数据不完整，改走新浪
const US_INDEX_SYMBOL: Record<string, string> = {
  DJI: 'us.DJI',
  IXIC: 'us.IXIC',
  INX: 'us.INX',
  NDX: 'us.NDX',
  NDX100: 'us.NDX',
}

// 重点板块 quote symbol → K 线 symbol：美股指数需带点（us.DJI）走 kline/kline 接口
const QUOTE_TO_KLINE_SYMBOL: Record<string, string> = {
  usDJI: 'us.DJI',
  usIXIC: 'us.IXIC',
  usINX: 'us.INX',
  usNDX: 'us.NDX',
}

function normalizeKlineSymbol(symbol: string): string {
  return QUOTE_TO_KLINE_SYMBOL[symbol] ?? symbol
}

function secidToTencentSymbol(secid: string, code?: string): string | null {
  const dot = secid.indexOf('.')
  const market = secid.slice(0, dot)
  const secCode = secid.slice(dot + 1)
  const raw = (code || secCode).toUpperCase()

  if (market === '1' && /^\d{6}$/.test(secCode)) return `sh${secCode}`
  if (market === '0' && /^\d{6}$/.test(secCode)) return `sz${secCode}`

  // 港股：代码为 5 位数字，腾讯用 hk + 5 位补零代码
  if (market === '116') {
    const digits = raw.replace(/\D/g, '')
    if (/^\d{1,5}$/.test(digits)) return `hk${digits.padStart(5, '0')}`
    return null
  }

  // 环球指数：美股指数（道琼斯/纳斯达克/标普500/纳指100）→ 腾讯 kline/kline 带点 code
  // 恒生指数 → 腾讯 fqkline hkHSI
  if (market === '100') {
    if (raw === 'HSI') return 'hkHSI'
    return US_INDEX_SYMBOL[raw] ?? null
  }

  // 美股个股走新浪，不由腾讯处理
  return null
}

async function fetchTencentKline(
  symbol: string,
  limit: number,
  klt = '101',
  before: string | null = null,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  // klt：101=日 102=周 103=月；分钟周期使用腾讯 mkline。
  const period = klt === '102' ? 'week' : klt === '103' ? 'month' : 'day'
  // 腾讯接口的 end-date 位于第三、四参数之间；cursor 请求只取 before 之前的窗口。
  const range = `,,${before ?? ''},${limit + 1}`
  // 带点的美股指数 code（us.DJI）走 kline/kline 接口（仅日线），其余走 fqkline
  const url = symbol.includes('.')
    ? `https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=${symbol},${period}${range}`
    : `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},${period}${range},qfq`
  try {
    const data = (await fetchJson(url, 'https://gu.qq.com/')) as {
      data?: {
        [sym: string]: {
          qfqday?: string[][]
          qfqweek?: string[][]
          qfqmonth?: string[][]
          day?: string[][]
          week?: string[][]
          month?: string[][]
          qt?: { [sym: string]: string[] }
        }
      }
    }
    const bucket = data.data?.[symbol]
    if (!bucket) return null
    // 日线有前复权 qfqday，周/月无复权直接 week/month
    const rows = bucket.qfqday?.length ? bucket.qfqday : bucket.qfqweek?.length
      ? bucket.qfqweek
      : bucket.qfqmonth?.length
        ? bucket.qfqmonth
        : bucket.day?.length
          ? bucket.day
          : bucket.week?.length
            ? bucket.week
            : bucket.month
    if (!rows?.length) return null
    const klines: Kline[] = rows.map((r) => {
      const date = r[0] ?? ''
      const open = Number(r[1] ?? 0)
      const close = Number(r[2] ?? 0)
      const high = Number(r[3] ?? 0)
      const low = Number(r[4] ?? 0)
      const volume = Number(r[5] ?? 0)
      const change = close - open
      const pct = open ? (change / open) * 100 : 0
      return {
        date,
        open,
        close,
        high,
        low,
        volume,
        amount: 0,
        amplitude: low ? ((high - low) / low) * 100 : 0,
        pct: Number(pct.toFixed(2)),
        change: Number(change.toFixed(2)),
        turnover: 0,
      }
    })
    const qt = bucket.qt?.[symbol]
    const name = qt?.[1] ?? ''
    const code = qt?.[2] ?? symbol.slice(2)
    return { ...sourceWindow({ code, name, klines }, limit) }
  } catch {
    return null
  }
}

async function fetchTencentMinuteKline(
  symbol: string,
  interval: string,
  limit: number,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=${encodeURIComponent(`${symbol},m${interval},,${Math.min(limit, 320)}`)}`
  try {
    const data = (await fetchJson(url, 'https://gu.qq.com/')) as {
      data?: {
        [sym: string]: {
          qt?: { [sym: string]: string[] }
          [key: string]: string[][] | { [sym: string]: string[] } | undefined
        }
      }
    }
    const bucket = data.data?.[symbol]
    const rows = bucket?.[`m${interval}`]
    if (!Array.isArray(rows) || !rows.length) return null
    const klines = rows.map((row) => {
      const open = Number(row[1] ?? 0)
      const close = Number(row[2] ?? 0)
      const high = Number(row[3] ?? 0)
      const low = Number(row[4] ?? 0)
      const change = close - open
      return {
        date: row[0] ?? '',
        open,
        close,
        high,
        low,
        volume: Number(row[5] ?? 0),
        amount: 0,
        amplitude: low ? ((high - low) / low) * 100 : 0,
        pct: open ? Number(((change / open) * 100).toFixed(2)) : 0,
        change: Number(change.toFixed(2)),
        turnover: 0,
      }
    }).filter((item) => item.date)
    if (!klines.length) return null
    const qt = bucket?.qt?.[symbol]
    return {
      code: qt?.[2] ?? symbol.slice(2),
      name: qt?.[1] ?? '',
      klines: klines.slice(-limit),
      hasMore: false,
    }
  } catch {
    return null
  }
}

function eastmoneySecid(symbol: string): string | null {
  const match = symbol.match(/^(sh|sz|hk)([A-Za-z0-9]+)$/i)
  if (!match) return null
  const market = match[1]!.toLowerCase() === 'sh' ? '1' : match[1]!.toLowerCase() === 'sz' ? '0' : '116'
  return `${market}.${match[2]!.toUpperCase()}`
}

async function fetchEastmoneyMinuteKline(
  symbol: string,
  interval: string,
  limit: number,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  const secid = eastmoneySecid(symbol)
  if (!secid) return null
  const query = new URLSearchParams({
    secid,
    klt: interval,
    fqt: '1',
    beg: '0',
    end: '20500101',
    lmt: String(Math.min(limit, 320)),
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
  })
  try {
    const data = (await fetchJson(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${query}`, 'https://quote.eastmoney.com/')) as {
      data?: { code?: string; name?: string; klines?: string[] }
    }
    const klines = (data.data?.klines ?? []).map((row) => {
      const fields = row.split(',')
      if (fields.length < 7 || !fields[0]) return null
      const open = Number(fields[1] ?? 0)
      const close = Number(fields[2] ?? 0)
      const high = Number(fields[3] ?? 0)
      const low = Number(fields[4] ?? 0)
      const change = close - open
      return {
        date: fields[0],
        open,
        close,
        high,
        low,
        volume: Number(fields[5] ?? 0),
        amount: Number(fields[6] ?? 0),
        amplitude: low ? ((high - low) / low) * 100 : 0,
        pct: open ? Number(((change / open) * 100).toFixed(2)) : 0,
        change: Number(change.toFixed(2)),
        turnover: Number(fields[10] ?? 0),
      }
    }).filter((item): item is Kline => item !== null)
    if (!klines.length) return null
    return {
      code: data.data?.code ?? symbol.slice(2),
      name: data.data?.name ?? '',
      klines: klines.slice(-limit),
      hasMore: false,
    }
  } catch {
    return null
  }
}

async function fetchMinuteKline(
  symbol: string,
  interval: string,
  limit: number,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  return await fetchTencentMinuteKline(symbol, interval, limit) ?? fetchEastmoneyMinuteKline(symbol, interval, limit)
}

// ---- 新浪美股个股 K 线（腾讯美股 fqkline 数据不完整，此处兜底）----
// 返回 jsonp：var _x=([{d,o,h,l,c,v,a}, ...]); 为整段历史，需截断最近 limit 根
async function fetchSinaUsKline(
  code: string,
  name: string,
  limit: number,
  before: string | null = null,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  const url = `https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_x=/US_MinKService.getDailyK?symbol=${encodeURIComponent(code)}`
  try {
    const text = await fetchText(url, 'https://stock.finance.sina.com.cn/')
    if (!text) return null
    const m = text.match(/=\s*\((\[.*\]|null)\)\s*;?\s*$/s)
    if (!m || m[1] === 'null') return null
    const rows = JSON.parse(m[1]!) as Array<{ d: string; o: string; h: string; l: string; c: string; v: string }>
    if (!rows.length) return null
    const filteredRows = rows.filter((r) => !before || (r.d ?? '') < before)
    const hasMore = filteredRows.length > limit
    const klines: Kline[] = filteredRows
      .slice(-limit)
      .map((r) => {
        const open = Number(r.o ?? 0)
      const close = Number(r.c ?? 0)
      const high = Number(r.h ?? 0)
      const low = Number(r.l ?? 0)
      const prevClose = open
      const pct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0
        return {
          date: r.d ?? '',
          open,
          close,
          high,
          low,
          volume: Number(r.v ?? 0),
          amount: 0,
          amplitude: low ? ((high - low) / low) * 100 : 0,
          pct: Number(pct.toFixed(2)),
          change: Number((close - prevClose).toFixed(2)),
          turnover: 0,
        }
      })
    return { code: code.toUpperCase(), name: name || code.toUpperCase(), klines, hasMore }
  } catch {
    return null
  }
}

// ---- 同花顺板块 K 线 ----
interface ThsBoard {
  platecode: string
  name: string
  kind: 'concept' | 'industry'
}

let thsBoardCache: { concepts: ThsBoard[]; industries: ThsBoard[]; expiresAt: number } | null = null

async function loadThsBoards(): Promise<{ concepts: ThsBoard[]; industries: ThsBoard[] } | null> {
  if (thsBoardCache && thsBoardCache.expiresAt > Date.now()) {
    return { concepts: thsBoardCache.concepts, industries: thsBoardCache.industries }
  }
  const concepts: ThsBoard[] = []
  const industries: ThsBoard[] = []
  const gnHtml = await fetchText('http://q.10jqka.com.cn/gn/', 'http://q.10jqka.com.cn/', true)
  if (gnHtml) {
    const m = gnHtml.match(/id="gnSection" value='([^']+)'/)
    if (m) {
      try {
        const obj = JSON.parse(m[1]!) as Record<string, { platecode?: string; platename?: string }>
        for (const v of Object.values(obj)) {
          if (v.platecode && v.platename) concepts.push({ platecode: v.platecode, name: v.platename, kind: 'concept' })
        }
      } catch {
        /* 忽略概念板块解析失败 */
      }
    }
  }
  const hyHtml = await fetchText('http://q.10jqka.com.cn/thshy/', 'http://q.10jqka.com.cn/', true)
  if (hyHtml) {
    const re = /thshy\/detail\/code\/(\d{6})\/[^>]*>([^<]+)<\/a>/g
    let mm: RegExpExecArray | null
    while ((mm = re.exec(hyHtml))) {
      industries.push({ platecode: mm[1]!, name: mm[2]!.trim(), kind: 'industry' })
    }
  }
  if (!concepts.length && !industries.length) return null
  thsBoardCache = { concepts, industries, expiresAt: Date.now() + 24 * 3600_000 }
  return { concepts, industries }
}

function matchBoardIn(list: ThsBoard[], target: string): string | null {
  for (const b of list) if (b.name === target) return b.platecode
  const withSuffix = `${target}概念`
  for (const b of list) if (b.name === withSuffix) return b.platecode
  for (const b of list) if (b.name.startsWith(target) || target.startsWith(b.name)) return b.platecode
  return null
}

function resolveThsPlatecode(
  boards: { concepts: ThsBoard[]; industries: ThsBoard[] },
  boardName: string,
): string | null {
  const target = boardName.trim()
  if (!target) return null
  return matchBoardIn(boards.concepts, target) ?? matchBoardIn(boards.industries, target)
}

async function fetchThsKline(
  platecode: string,
  limit: number,
  before: string | null = null,
): Promise<{ code: string; name: string; klines: Kline[]; hasMore: boolean } | null> {
  const url = `http://d.10jqka.com.cn/v6/line/bk_${platecode}/01/all.js`
  try {
    const text = await fetchText(url, 'http://q.10jqka.com.cn/')
    if (!text) return null
    const m = text.match(/^[^(]*\((.*)\)\s*$/s)
    if (!m) return null
    const obj = JSON.parse(m[1]!) as {
      name?: string
      priceFactor?: number
      price?: string
      volumn?: string
      dates?: string
      sortYear?: [number, number][]
    }
    const pf = obj.priceFactor || 1
    const price = (obj.price ?? '').split(',').filter((x) => x !== '')
    const vol = (obj.volumn ?? '').split(',').filter((x) => x !== '')
    const dates = (obj.dates ?? '').split(',').filter((x) => x !== '')
    if (!price.length || !dates.length) return null
    const n = Math.round(price.length / dates.length)
    if (n !== 4) return null
    const fullDates: string[] = []
    for (const [year, count] of obj.sortYear ?? []) {
      for (let i = 0; i < count; i++) {
        const md = dates[fullDates.length]
        if (!md) break
        fullDates.push(`${year}-${md.slice(0, 2)}-${md.slice(2, 4)}`)
      }
    }
    const total = Math.min(dates.length, Math.floor(price.length / n))
    const klines: Kline[] = []
    for (let i = 0; i < total; i++) {
      const base = i * n
      const low = Number(price[base]) / pf
      const open = (Number(price[base]) + Number(price[base + 1])) / pf
      const high = (Number(price[base]) + Number(price[base + 2])) / pf
      const close = (Number(price[base]) + Number(price[base + 3])) / pf
      const volume = Number(vol[i] ?? 0)
      const prevClose = i > 0 ? klines[i - 1]!.close : open
      const pct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0
      klines.push({
        date: fullDates[i] ?? '',
        open: Number(open.toFixed(3)),
        close: Number(close.toFixed(3)),
        high: Number(high.toFixed(3)),
        low: Number(low.toFixed(3)),
        volume,
        amount: 0,
        amplitude: low ? ((high - low) / low) * 100 : 0,
        pct: Number(pct.toFixed(2)),
        change: Number((close - prevClose).toFixed(3)),
        turnover: 0,
      })
    }
    if (!klines.length) return null
    const filtered = klines.filter((item) => !before || item.date < before)
    const hasMore = filtered.length > limit
    return { code: platecode, name: obj.name ?? '', klines: filtered.slice(-limit), hasMore }
  } catch {
    return null
  }
}

// ---- 基金净值（东方财富 f10）----
async function fetchFundNav(code: string, limit: number): Promise<FundNavPoint[] | null> {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${limit}`
  try {
    const data = (await fetchJson(url, 'https://fundf10.eastmoney.com/')) as {
      Data?: { LSJZList?: Array<Record<string, string>> }
    }
    const nav: FundNavPoint[] = (data.Data?.LSJZList ?? [])
      .map((row) => ({
        date: row.FSRQ ?? '',
        nav: Number(row.DWJZ ?? 0),
        accNav: Number(row.LJJZ ?? 0),
        pct: Number(row.JZZZL ?? 0),
      }))
      .reverse()
    return nav.length ? nav : null
  } catch {
    return null
  }
}

// ---- 重点板块定义 ----
// 国内：上证指数/深证成指/沪深300/科创50/创业板指（腾讯 symbol）
// 国外：道琼斯/纳斯达克/标普500/恒生指数
const DOMESTIC_INDICES = [
  { symbol: 'sh000001', name: '上证指数' },
  { symbol: 'sz399001', name: '深证成指' },
  { symbol: 'sh000300', name: '沪深300' },
  { symbol: 'sh000688', name: '科创50' },
  { symbol: 'sz399006', name: '创业板指' },
]

const OVERSEAS_INDICES = [
  { symbol: 'usDJI', name: '道琼斯' },
  { symbol: 'usIXIC', name: '纳斯达克' },
  { symbol: 'usINX', name: '标普500' },
  { symbol: 'hkHSI', name: '恒生指数' },
]

// ---- 同花顺板块排行 ----
// 行业板块：q.10jqka.com.cn/thshy 表格，列序（td）：0 序号 / 1 板块(含 platecode) /
// 2 涨跌幅 / 3 总成交量(万手) / 4 总成交额(亿) / 5 净流入(亿) / 6 上涨家数 / 7 下跌家数 /
// 8 均价 / 9 领涨股 / 10 领涨股最新价 / 11 领涨股涨跌幅
async function fetchIndustryBoards(): Promise<BoardRow[]> {
  const html = await fetchText('http://q.10jqka.com.cn/thshy/', 'http://q.10jqka.com.cn/', true)
  if (!html) return []
  const rows: BoardRow[] = []
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const rowHtml = m[1]!
    const codeM = rowHtml.match(/thshy\/detail\/code\/(\d{6})\//)
    if (!codeM) continue
    const cells = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)).map((c) =>
      c[1]!.replace(/<[^>]+>/g, '').trim(),
    )
    if (cells.length < 12) continue
    const num = (s: string) => Number(s) || 0
    rows.push({
      code: codeM[1]!,
      name: cells[1] ?? '',
      pct: num(cells[2]),
      netInflow: num(cells[5]),
      upCount: num(cells[6]),
      downCount: num(cells[7]),
      leaderName: cells[9] ?? '',
      leaderPct: num(cells[11]),
      kind: 'industry',
    })
  }
  return rows
}

// 概念板块：q.10jqka.com.cn/gn 的 gnSection JSON，
// 字段：platecode / platename / 199112=涨跌幅 / zjjlr=净流入(亿) / cid=领涨股代码。
// 领涨股名称与涨跌幅需按 cid 批量查腾讯补全。
function codeToTencentSymbol(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return null
  if (/^(60|68|90)/.test(code)) return `sh${code}`
  if (/^(00|30|20)/.test(code)) return `sz${code}`
  if (/^(4|8)/.test(code)) return `bj${code}`
  return null
}

async function fetchTencentNames(codes: string[]): Promise<Map<string, { name: string; pct: number }>> {
  const map = new Map<string, { name: string; pct: number }>()
  const symbols = codes.map(codeToTencentSymbol).filter((s): s is string => s != null)
  for (let i = 0; i < symbols.length; i += 60) {
    const quotes = await fetchTencentQuotes(symbols.slice(i, i + 60))
    for (const q of quotes) map.set(q.code, { name: q.name, pct: q.pct })
  }
  return map
}

async function fetchConceptBoards(): Promise<BoardRow[]> {
  const html = await fetchText('http://q.10jqka.com.cn/gn/', 'http://q.10jqka.com.cn/', true)
  if (!html) return []
  const m = html.match(/id="gnSection" value='([^']+)'/)
  if (!m) return []
  let obj: Record<string, { platecode?: string; platename?: string; cid?: string; '199112'?: number; zjjlr?: number }>
  try {
    obj = JSON.parse(m[1]!) as typeof obj
  } catch {
    return []
  }
  const entries = Object.values(obj).filter((v) => v.platecode && v.platename)
  const leaderCodes = entries.map((v) => v.cid ?? '').filter((c) => /^\d{6}$/.test(c))
  const names = await fetchTencentNames(leaderCodes)
  const rows: BoardRow[] = entries.map((v) => {
    const leader = names.get(v.cid ?? '')
    return {
      code: v.platecode!,
      name: v.platename!,
      pct: Number(v['199112'] ?? 0) || 0,
      netInflow: Number(v.zjjlr ?? 0) || 0,
      upCount: 0,
      downCount: 0,
      leaderName: leader?.name ?? '',
      leaderPct: leader?.pct ?? 0,
      kind: 'concept',
    }
  })
  return rows
}

function sortBoards(rows: BoardRow[], order: string): BoardRow[] {
  return rows.sort((a, b) => (order === 'down' ? a.pct - b.pct : b.pct - a.pct))
}

// ---- 分时 ----
// 腾讯个股/指数分时：appstock/app/minute/query，data[code].data.data 为 ["HHMM price cumVol cumAmount", ...]
async function fetchTencentMinute(symbol: string): Promise<MinutePoint[] | null> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${symbol}`
  try {
    const data = (await fetchJson(url, 'https://gu.qq.com/')) as {
      data?: { [sym: string]: { data?: { data?: string[] } } }
    }
    const rows = data.data?.[symbol]?.data?.data
    if (!rows?.length) return null
    return rows.map((r) => {
      const f = r.trim().split(/\s+/)
      const amount = Number(f[3] ?? 0)
      return {
        time: f[0] ?? '',
        price: Number(f[1] ?? 0),
        avg: amount / 100,
        volume: Number(f[2] ?? 0),
        amount,
      }
    })
  } catch {
    return null
  }
}

// 同花顺板块分时：d.10jqka.com.cn/v6/time/bk_<code>/last.js
// data 为 "HHMM,price,cumVol,avgPrice,cumAmount;..." 分号分隔
async function fetchThsMinute(platecode: string): Promise<MinutePoint[] | null> {
  const url = `http://d.10jqka.com.cn/v6/time/bk_${platecode}/last.js`
  try {
    const text = await fetchText(url, 'http://q.10jqka.com.cn/')
    if (!text) return null
    const m = text.match(/^[^(]*\((.*)\)\s*$/s)
    if (!m) return null
    const obj = JSON.parse(m[1]!) as { [key: string]: { data?: string } }
    const bucket = Object.values(obj)[0]
    const raw = bucket?.data ?? ''
    if (!raw) return null
    return raw.split(';').filter(Boolean).map((r) => {
      const f = r.split(',')
      return {
        time: f[0] ?? '',
        price: Number(f[1] ?? 0),
        avg: Number(f[3] ?? 0),
        volume: Number(f[2] ?? 0),
        amount: Number(f[4] ?? 0),
      }
    })
  } catch {
    return null
  }
}

// ---- 偏好归一化 ----
const PREFERENCE_MA_PERIODS = [5, 10, 20, 30, 60, 120, 250] as const
const RIGHT_PANELS = ['boards', 'ai', 'settings'] as const
const SUB_INDICATORS = ['VOL', 'MACD', 'KDJ', 'RSI', 'BOLL'] as const
const CANDLE_PERIODS = ['day', 'week', 'month'] as const
const MINUTE_INTERVALS = ['1', '5', '15', '30', '60'] as const
const CHART_VIEWS = ['minute', 'candle'] as const

export type FinanceRightPanel = (typeof RIGHT_PANELS)[number]
export type FinanceSubIndicator = (typeof SUB_INDICATORS)[number]

export interface FinancePreferences {
  leftCollapsed: boolean
  leftWidth: number
  rightWidth: number
  rightPanel: FinanceRightPanel
  chartView: (typeof CHART_VIEWS)[number]
  candlePeriod: (typeof CANDLE_PERIODS)[number]
  interval: (typeof MINUTE_INTERVALS)[number]
  showMA: boolean
  enabledMA: number[]
  subIndicator: FinanceSubIndicator
}

export const DEFAULT_FINANCE_PREFERENCES: FinancePreferences = {
  leftCollapsed: false,
  leftWidth: 260,
  rightWidth: 360,
  rightPanel: 'ai',
  chartView: 'candle',
  candlePeriod: 'day',
  interval: '5',
  showMA: true,
  enabledMA: [5, 10, 20, 60],
  subIndicator: 'VOL',
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function boolOr(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return typeof value === 'boolean' ? value : false
}

export function normalizeFinancePreferences(raw: unknown): FinancePreferences {
  const obj = (raw ?? {}) as Record<string, unknown>
  const maSet = new Set<number>()
  if (Array.isArray(obj.enabledMA)) {
    for (const m of obj.enabledMA) {
      const n = typeof m === 'number' ? m : Number(m)
      if (Number.isFinite(n) && (PREFERENCE_MA_PERIODS as readonly number[]).includes(n)) {
        maSet.add(n)
      }
    }
  }
  const enabledMA = PREFERENCE_MA_PERIODS.filter((p) => maSet.has(p))
  return {
    leftCollapsed: boolOr(obj.leftCollapsed, DEFAULT_FINANCE_PREFERENCES.leftCollapsed),
    leftWidth: clampInt(obj.leftWidth, 200, 360, DEFAULT_FINANCE_PREFERENCES.leftWidth),
    rightWidth: clampInt(obj.rightWidth, 280, 480, DEFAULT_FINANCE_PREFERENCES.rightWidth),
    rightPanel: oneOf(obj.rightPanel, RIGHT_PANELS, DEFAULT_FINANCE_PREFERENCES.rightPanel),
    chartView: oneOf(obj.chartView, CHART_VIEWS, DEFAULT_FINANCE_PREFERENCES.chartView),
    candlePeriod: oneOf(obj.candlePeriod, CANDLE_PERIODS, DEFAULT_FINANCE_PREFERENCES.candlePeriod),
    interval: oneOf(obj.interval, MINUTE_INTERVALS, DEFAULT_FINANCE_PREFERENCES.interval),
    showMA: boolOr(obj.showMA, DEFAULT_FINANCE_PREFERENCES.showMA),
    enabledMA: enabledMA.length ? enabledMA : [...DEFAULT_FINANCE_PREFERENCES.enabledMA],
    subIndicator: oneOf(obj.subIndicator, SUB_INDICATORS, DEFAULT_FINANCE_PREFERENCES.subIndicator),
  }
}

// ---- 路由注册 ----
export function registerFinanceRoutes(app: Hono): void {
  // 搜索（板块/股票/基金/ETF/指数）
  app.get('/finance/search', async (c) => {
    const q = c.req.query('q')?.trim() ?? ''
    if (!q || q.length > 40) return c.json({ error: 'invalid query' }, 400)
    const cacheKey = `search:${q}`
    const cached = cacheGet<SearchItem[]>(cacheKey)
    if (cached) return c.json({ items: cached })
    try {
      const items = await searchEastmoney(q)
      cacheSet(cacheKey, items)
      return c.json({ items })
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })

  // 指数条实时行情（国内 + 国外重点指数）
  app.get('/finance/boards', async (c) => {
    const cacheKey = 'boards:indices'
    const cached = cacheGet<{ domestic: Quote[]; overseas: Quote[] }>(cacheKey)
    if (cached) return c.json(cached)
    try {
      const domesticSymbols = DOMESTIC_INDICES.map((i) => i.symbol)
      const overseasSymbols = OVERSEAS_INDICES.map((i) => i.symbol)
      const [domestic, overseas] = await Promise.all([
        fetchTencentQuotes(domesticSymbols),
        fetchTencentQuotes(overseasSymbols),
      ])
      const domesticNamed = domestic.map((q) => ({
        ...q,
        name: DOMESTIC_INDICES.find((i) => i.symbol === q.symbol)?.name ?? q.name,
      }))
      const overseasNamed = overseas.map((q) => ({
        ...q,
        name: OVERSEAS_INDICES.find((i) => i.symbol === q.symbol)?.name ?? q.name,
      }))
      const result = { domestic: domesticNamed, overseas: overseasNamed }
      cacheSet(cacheKey, result, 30_000)
      return c.json(result)
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })

  // 板块排行：行业 / 概念，order=up|down
  app.get('/finance/boards/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (kind !== 'industry' && kind !== 'concept') return c.json({ error: 'invalid kind' }, 400)
    const order = c.req.query('order') === 'down' ? 'down' : 'up'
    const cacheKey = `boards:${kind}:${order}`
    const cached = cacheGet<BoardRow[]>(cacheKey)
    if (cached) return c.json({ items: cached })
    const rows = kind === 'industry' ? await fetchIndustryBoards() : await fetchConceptBoards()
    if (!rows.length) return c.json({ error: '数据源暂时不可用' }, 502)
    const sorted = sortBoards(rows, order)
    cacheSet(cacheKey, sorted, 30_000)
    return c.json({ items: sorted })
  })

  // 实时行情批量（自选列表刷新用）
  app.get('/finance/quote', async (c) => {
    const symbols = (c.req.query('symbols') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!symbols.length || symbols.length > 60) return c.json({ error: 'invalid symbols' }, 400)
    const cacheKey = `quote:${symbols.join(',')}`
    const cached = cacheGet<Quote[]>(cacheKey)
    if (cached) return c.json({ quotes: cached })
    try {
      const quotes = await fetchTencentQuotes(symbols)
      cacheSet(cacheKey, quotes, 15_000)
      return c.json({ quotes })
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })

  // K 线：个股/ETF/指数走腾讯（美股个股走新浪），板块走同花顺（板块无腾讯对应）
  app.get('/finance/kline', async (c) => {
    const secid = c.req.query('secid')?.trim() ?? ''
    const name = c.req.query('name')?.trim() ?? ''
    const code = c.req.query('code')?.trim() ?? ''
    const klt = c.req.query('klt') ?? '101'
    const limit = Number(c.req.query('limit') ?? '250')
    const beforeValue = c.req.query('before')
    const before = parseBeforeDate(beforeValue)
    // 重点板块直接传入腾讯 symbol（如 sh000001/us.DJI/hkHSI），跳过 secid 映射
    const symbolParam = c.req.query('symbol')?.trim() ?? ''
    if (!isSupportedKlinePeriod(klt)) return c.json({ error: 'invalid klt' }, 400)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)
    if (beforeValue !== undefined && !before) return c.json({ error: 'invalid before' }, 400)
    const minuteInterval = normalizeMinuteKlineInterval(klt)
    if (minuteInterval && before) return c.json({ error: 'history is unavailable for this interval' }, 422)
    const today = todayUtc()
    const withMeta = (fallback: { code: string; name: string; klines: Kline[]; hasMore: boolean }, responseSecid: string): KlineResponse =>
      makeKlineResponse(fallback, responseSecid, klt, limit, before)
    const minuteResponse = (fallback: { code: string; name: string; klines: Kline[]; hasMore: boolean }, responseSecid: string): KlineResponse => ({
      code: fallback.code,
      name: fallback.name || name,
      secid: responseSecid,
      klt,
      klines: fallback.klines,
      hasMore: false,
      oldest: fallback.klines[0]?.date ?? null,
      latest: fallback.klines.at(-1)?.date ?? null,
    })

    // 重点板块：有 symbol 参数时直接按 symbol 抓腾讯 K 线
    if (symbolParam) {
      const cacheKey = `kline:sym:${symbolParam}:${klt}:${limit}:${before ?? ''}`
      const cached = cacheGet<KlineResponse>(cacheKey)
      if (cached) return c.json(cached)
      const symbol = normalizeKlineSymbol(symbolParam)
      if (minuteInterval && !supportsTencentMinuteSymbol(symbol)) {
        return c.json({ error: '该标的不支持分钟 K 线' }, 422)
      }
      const fallback = minuteInterval
        ? await fetchMinuteKline(symbol, minuteInterval, limit)
        : await fetchTencentKline(symbol, limit, klt, before)
      if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
      const result = minuteInterval
        ? minuteResponse({ ...fallback, name: fallback.name || name }, symbolParam)
        : withMeta({ ...fallback, name: fallback.name || name }, symbolParam)
      cacheSet(cacheKey, result, 300_000)
      return c.json(result)
    }

    if (!/^[0-9A-Za-z]+\.[0-9A-Za-z]+$/.test(secid)) return c.json({ error: 'invalid secid' }, 400)

    const cacheKey = `kline:${secid}:${klt}:${limit}:${before ?? ''}`
    const cached = cacheGet<KlineResponse>(cacheKey)
    if (cached) return c.json(cached)

    const isBoard = secid.startsWith('90.')

    if (isBoard && minuteInterval) {
      return c.json({ error: '该标的不支持分钟 K 线' }, 422)
    }

    if (isBoard) {
      const boards = await loadThsBoards()
      const platecode = boards ? resolveThsPlatecode(boards, name) : null
      if (!platecode) return c.json({ error: '数据源暂时不可用' }, 502)
      const fallback = await fetchThsKline(platecode, limit, before)
      if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
      const result = withMeta({ ...fallback, name: fallback.name || name }, secid)
      cacheSet(cacheKey, result, 300_000)
      return c.json(result)
    }

    // 美股个股走新浪（腾讯美股 fqkline 数据不完整）
    const market = secid.slice(0, secid.indexOf('.'))
    if (market === '105' || market === '106' || market === '107') {
      if (minuteInterval) return c.json({ error: '该标的不支持分钟 K 线' }, 422)
      const usCode = code || secid.slice(secid.indexOf('.') + 1)
      const fallback = await fetchSinaUsKline(usCode, name, limit, before)
      if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
      const result = withMeta(fallback, secid)
      cacheSet(cacheKey, result, 300_000)
      return c.json(result)
    }

    // 其余走腾讯（A股/ETF/指数/港股/环球指数）
    const symbol = secidToTencentSymbol(secid, code)
    if (!symbol) return c.json({ error: '数据源暂时不可用' }, 502)
    if (minuteInterval && !supportsTencentMinuteSymbol(symbol)) {
      return c.json({ error: '该标的不支持分钟 K 线' }, 422)
    }
    const fallback = minuteInterval
      ? await fetchMinuteKline(symbol, minuteInterval, limit)
      : await fetchTencentKline(symbol, limit, klt, before)
    if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
    const result = minuteInterval ? minuteResponse(fallback, secid) : withMeta(fallback, secid)
    cacheSet(cacheKey, result, 300_000)
    return c.json(result)
  })

  // 分时：个股/指数走腾讯，板块走同花顺
  app.get('/finance/minute', async (c) => {
    const secid = c.req.query('secid')?.trim() ?? ''
    const code = c.req.query('code')?.trim() ?? ''
    const symbolParam = c.req.query('symbol')?.trim() ?? ''
    const platecode = c.req.query('platecode')?.trim() ?? ''

    const cacheKey = `minute:${secid}:${symbolParam}:${platecode}`
    const cached = cacheGet<{ points: MinutePoint[] }>(cacheKey)
    if (cached) return c.json(cached)

    try {
      let points: MinutePoint[] | null = null
      // 板块：有 platecode 走同花顺
      if (platecode) {
        points = await fetchThsMinute(platecode)
      } else if (symbolParam) {
        points = await fetchTencentMinute(normalizeKlineSymbol(symbolParam))
      } else {
        const symbol = secidToTencentSymbol(secid, code)
        points = symbol ? await fetchTencentMinute(symbol) : null
      }
      if (!points) return c.json({ error: '数据源暂时不可用' }, 502)
      const result = { points }
      cacheSet(cacheKey, result, 30_000)
      return c.json(result)
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })

  // 详情：单个标的实时详情（指标格用）
  app.get('/finance/detail', async (c) => {
    const symbolParam = c.req.query('symbol')?.trim() ?? ''
    if (!symbolParam) return c.json({ error: 'invalid symbol' }, 400)
    const cacheKey = `detail:${symbolParam}`
    const cached = cacheGet<QuoteDetail>(cacheKey)
    if (cached) return c.json(cached)
    const quotes = await fetchTencentQuotes([symbolParam])
    const q = quotes[0]
    if (!q) return c.json({ error: '数据源暂时不可用' }, 502)
    const result: QuoteDetail = {
      symbol: q.symbol,
      name: q.name,
      code: q.code,
      price: q.price,
      prevClose: q.prevClose,
      change: q.change,
      pct: q.pct,
      open: q.open,
      high: q.high,
      low: q.low,
      volume: q.volume,
      amount: q.amount,
      turnover: q.turnover,
      amplitude: q.amplitude,
      volumeRatio: q.volumeRatio,
    }
    cacheSet(cacheKey, result, 15_000)
    return c.json(result)
  })

  // 基金净值
  app.get('/finance/fund/nav', async (c) => {
    const code = c.req.query('code')?.trim() ?? ''
    const limit = Number(c.req.query('limit') ?? '250')
    if (!/^\d{6}$/.test(code)) return c.json({ error: 'invalid fund code' }, 400)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

    const cacheKey = `fundnav:${code}:${limit}`
    const cached = cacheGet<{ code: string; name: string; nav: FundNavPoint[] }>(cacheKey)
    if (cached) return c.json(cached)
    const nav = await fetchFundNav(code, limit)
    if (!nav) return c.json({ error: '数据源暂时不可用' }, 502)
    const result = { code, name: '', nav }
    cacheSet(cacheKey, result, 300_000)
    return c.json(result)
  })

  // 自选列表 CRUD
  app.get('/finance/watchlist', async (c) => {
    const rows = await db
      .select()
      .from(watchlist)
      .where(eq(watchlist.userKey, USER_KEY))
      .orderBy(watchlist.createdAt)
      .all()
    return c.json({ items: rows })
  })

  app.post('/finance/watchlist', async (c) => {
    const body = await c.req.json<Partial<SearchItem>>().catch(() => null)
    if (!body || !body.quoteId || !body.code || !body.name) {
      return c.json({ error: 'invalid watchlist item' }, 400)
    }
    // 去重：同 quoteId 已存在则直接返回
    const prior = await db
      .select({ quoteId: watchlist.quoteId })
      .from(watchlist)
      .where(eq(watchlist.userKey, USER_KEY))
      .all()
    if (prior.some((r) => r.quoteId === body.quoteId)) {
      return c.json({ ok: true, duplicate: true })
    }
    const row = {
      userKey: USER_KEY,
      quoteId: body.quoteId,
      code: body.code,
      name: body.name,
      type: body.type ?? '',
      typeName: body.typeName ?? '',
      market: body.market ?? '',
      createdAt: new Date(),
    }
    await db.insert(watchlist).values(row)
    return c.json({ ok: true })
  })

  app.delete('/finance/watchlist/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'invalid id' }, 400)
    await db.delete(watchlist).where(eq(watchlist.id, id))
    return c.json({ ok: true })
  })

  // 终端偏好：GET 返回归一化偏好，PUT upsert 后返回归一化结果。
  // 服务端固定 admin，忽略客户端提交的 userKey/id/updatedAt。
  app.get('/finance/preferences', async (c) => {
    const row = await db
      .select()
      .from(financePreferences)
      .where(eq(financePreferences.userKey, USER_KEY))
      .get()
    return c.json(normalizeFinancePreferences(row?.preferences))
  })

  app.put('/finance/preferences', async (c) => {
    const body = await c.req.json().catch(() => null)
    const normalized = normalizeFinancePreferences(body)
    await db
      .insert(financePreferences)
      .values({ userKey: USER_KEY, preferences: normalized, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: financePreferences.userKey,
        set: { preferences: normalized, updatedAt: new Date() },
      })
    return c.json(normalized)
  })
}
