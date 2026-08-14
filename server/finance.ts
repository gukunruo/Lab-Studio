import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { watchlist } from './db/schema'

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
function secidToTencentSymbol(secid: string): string | null {
  const dot = secid.indexOf('.')
  const market = secid.slice(0, dot)
  const code = secid.slice(dot + 1)
  if (!/^\d{6}$/.test(code)) return null
  if (market === '1') return `sh${code}`
  if (market === '0') return `sz${code}`
  return null
}

async function fetchTencentKline(
  symbol: string,
  limit: number,
): Promise<{ code: string; name: string; klines: Kline[] } | null> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`
  try {
    const data = (await fetchJson(url, 'https://gu.qq.com/')) as {
      data?: {
        [sym: string]: {
          qfqday?: string[][]
          day?: string[][]
          qt?: { [sym: string]: string[] }
        }
      }
    }
    const bucket = data.data?.[symbol]
    if (!bucket) return null
    const rows = bucket.qfqday?.length ? bucket.qfqday : bucket.day
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
    return { code, name, klines }
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
): Promise<{ code: string; name: string; klines: Kline[] } | null> {
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
    return { code: platecode, name: obj.name ?? '', klines: klines.slice(-limit) }
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

// 新浪行业板块（返回 GBK JS 赋值串），字段以逗号分隔：
// [1]=名称 [3]=家数 [5]=涨跌幅% [6]=成交额 [8]=领涨股代码 [11]=领涨股名称
async function fetchSinaIndustryBoards(): Promise<Array<{ name: string; pct: number }>> {
  const url = 'http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php'
  const text = await fetchText(url, 'https://finance.sina.com.cn/', true)
  if (!text) return []
  const m = text.match(/=\s*(\{.*\})\s*;?\s*$/)
  if (!m) return []
  try {
    const obj = JSON.parse(m[1]!) as Record<string, string>
    return Object.values(obj).map((v) => {
      const f = v.split(',')
      return { name: f[1] ?? '', pct: Number(f[5] ?? 0) }
    })
  } catch {
    return []
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

  // 重点板块实时行情（腾讯指数 + 新浪行业板块）
  app.get('/finance/boards', async (c) => {
    const cacheKey = 'boards:all'
    const cached = cacheGet<{
      domestic: Quote[]
      overseas: Quote[]
      industries: Array<{ name: string; pct: number }>
    }>(cacheKey)
    if (cached) return c.json(cached)
    try {
      const domesticSymbols = DOMESTIC_INDICES.map((i) => i.symbol)
      const overseasSymbols = OVERSEAS_INDICES.map((i) => i.symbol)
      const [domestic, overseas, industries] = await Promise.all([
        fetchTencentQuotes(domesticSymbols),
        fetchTencentQuotes(overseasSymbols),
        fetchSinaIndustryBoards(),
      ])
      const domesticNamed = domestic.map((q) => ({
        ...q,
        name: DOMESTIC_INDICES.find((i) => i.symbol === q.symbol)?.name ?? q.name,
      }))
      const overseasNamed = overseas.map((q) => ({
        ...q,
        name: OVERSEAS_INDICES.find((i) => i.symbol === q.symbol)?.name ?? q.name,
      }))
      const result = { domestic: domesticNamed, overseas: overseasNamed, industries }
      cacheSet(cacheKey, result, 30_000)
      return c.json(result)
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
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

  // K 线：个股/ETF/指数走腾讯，板块走同花顺（板块无腾讯对应）
  app.get('/finance/kline', async (c) => {
    const secid = c.req.query('secid')?.trim() ?? ''
    const name = c.req.query('name')?.trim() ?? ''
    const klt = c.req.query('klt') ?? '101'
    const limit = Number(c.req.query('limit') ?? '250')
    if (!/^[0-9A-Za-z]+\.[0-9A-Za-z]+$/.test(secid)) return c.json({ error: 'invalid secid' }, 400)
    if (!['101', '102', '103'].includes(klt)) return c.json({ error: 'invalid klt' }, 400)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

    const cacheKey = `kline:${secid}:${klt}:${limit}`
    const cached = cacheGet<KlineResponse>(cacheKey)
    if (cached) return c.json(cached)

    const isBoard = secid.startsWith('90.')

    if (isBoard) {
      const boards = await loadThsBoards()
      const platecode = boards ? resolveThsPlatecode(boards, name) : null
      if (!platecode) return c.json({ error: '数据源暂时不可用' }, 502)
      const fallback = await fetchThsKline(platecode, limit)
      if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
      const result: KlineResponse = {
        code: fallback.code,
        name: fallback.name || name,
        secid,
        klt,
        klines: fallback.klines,
      }
      cacheSet(cacheKey, result, 300_000)
      return c.json(result)
    }

    const symbol = secidToTencentSymbol(secid)
    if (!symbol) return c.json({ error: '数据源暂时不可用' }, 502)
    const fallback = await fetchTencentKline(symbol, limit)
    if (!fallback) return c.json({ error: '数据源暂时不可用' }, 502)
    const result: KlineResponse = {
      code: fallback.code,
      name: fallback.name,
      secid,
      klt,
      klines: fallback.klines,
    }
    cacheSet(cacheKey, result, 300_000)
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
}
