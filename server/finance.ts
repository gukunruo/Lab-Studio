import type { Hono } from 'hono'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 内存缓存：key → { value, expiresAt }。行情为公开数据，做较长缓存（10 分钟），
// 命中缓存可让用户切换/重选标的时不再打到上游（东财对新连接有概率性 RST）。
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_TTL = 600_000

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return hit.value as T
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL })
}

// 东财 push2his 对新连接有概率性 RST（UND_ERR_SOCKET），失败后进入约
// 15-20s 的拒绝窗口，期间重试无效；窗口过后恢复。因此对上游请求做全局
// 节流（两次最小间隔），并在失败时退避到超过拒绝窗口后再重试一次。
let lastUpstreamAt = 0
const MIN_UPSTREAM_INTERVAL = 2500

async function throttleUpstream(): Promise<void> {
  const elapsed = Date.now() - lastUpstreamAt
  if (elapsed < MIN_UPSTREAM_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_UPSTREAM_INTERVAL - elapsed))
  }
  lastUpstreamAt = Date.now()
}

async function fetchJson(
  url: string,
  referer: string,
  retryDelayMs = 4000,
  maxAttempts = 2,
): Promise<unknown> {
  // 连接类错误（UND_ERR_SOCKET）在拒绝窗口内重试无效，退避到窗口过后重试
  // 一次，仍未恢复则向上抛错，由前端提示「稍后重试」。
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await throttleUpstream()
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: referer, Accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`upstream ${response.status}`)
      return await response.json()
    } catch (err) {
      lastErr = err
      // 4xx/5xx（已拿到响应）不重试；仅连接类错误重试。
      if (err instanceof Error && err.message.startsWith('upstream ')) throw err
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, retryDelayMs))
      }
    }
  }
  throw lastErr
}

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

export interface FundNavResponse {
  code: string
  name: string
  nav: FundNavPoint[]
}

// 东财 secid（market.code）→ 腾讯 symbol（sh/sz + 代码）。
// 仅支持 A 股/指数/ETF/LOF；板块（BK）等无腾讯对应，返回 null。
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
    await throttleUpstream()
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
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
    // 个股/ETF/LOF 用 qfqday（前复权），指数用 day。
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
      const prev = open
      const pct = prev ? (change / prev) * 100 : 0
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
    // qt 字段：['1', 名称, 代码, ...]，名称在索引 1。
    const qt = bucket.qt?.[symbol]
    const name = qt?.[1] ?? ''
    const code = qt?.[2] ?? symbol.slice(2)
    return { code, name, klines }
  } catch {
    return null
  }
}

// ---- 同花顺板块 K 线回退 ----
// 东财 push2his 对部分 IP 做应用层风控（TLS 握手成功但读完请求即断开），
// 板块（BK）又无腾讯行情可回退，故为板块接入同花顺历史 K 线。
// 接口 d.10jqka.com.cn/v6/line/bk_<platecode>/01/all.js 返回 JS 赋值形式，
// price 每根 4 值 [low, open-low, high-low, close-low]（已乘 priceFactor），
// 日期存 MMDD，需配合 sortYear 逐年还原年份。

interface ThsBoard {
  platecode: string
  name: string
  kind: 'concept' | 'industry'
}

let thsBoardCache: { concepts: ThsBoard[]; industries: ThsBoard[]; expiresAt: number } | null = null

async function fetchThsGbk(url: string, referer: string): Promise<string | null> {
  try {
    await throttleUpstream()
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: referer, Accept: 'text/html, */*' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const buf = await response.arrayBuffer()
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return null
  }
}

async function loadThsBoards(): Promise<{ concepts: ThsBoard[]; industries: ThsBoard[] } | null> {
  if (thsBoardCache && thsBoardCache.expiresAt > Date.now()) {
    return { concepts: thsBoardCache.concepts, industries: thsBoardCache.industries }
  }
  const concepts: ThsBoard[] = []
  const industries: ThsBoard[] = []
  // 概念板块：gn/ 页的 gnSection JSON（platecode + platename）。
  const gnHtml = await fetchThsGbk('http://q.10jqka.com.cn/gn/', 'http://q.10jqka.com.cn/')
  if (gnHtml) {
    const m = gnHtml.match(/id="gnSection" value='([^']+)'/)
    if (m) {
      try {
        const obj = JSON.parse(m[1]!) as Record<string, { platecode?: string; platename?: string }>
        for (const v of Object.values(obj)) {
          if (v.platecode && v.platename) concepts.push({ platecode: v.platecode, name: v.platename, kind: 'concept' })
        }
      } catch {
        /* 解析失败则跳过概念板块 */
      }
    }
  }
  // 行业板块：thshy/ 页的 /thshy/detail/code/<code>/ 链接 + 名称。
  const hyHtml = await fetchThsGbk('http://q.10jqka.com.cn/thshy/', 'http://q.10jqka.com.cn/')
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
  // 东财板块代码无法区分行业/概念（BK04xx/BK08xx 均有例外），用户搜索
  // 板块词多为概念板块，故概念优先，行业兜底，避免「白酒」误配到行业同名。
  return matchBoardIn(boards.concepts, target) ?? matchBoardIn(boards.industries, target)
}

async function fetchThsKline(
  platecode: string,
  limit: number,
): Promise<{ code: string; name: string; klines: Kline[] } | null> {
  const url = `http://d.10jqka.com.cn/v6/line/bk_${platecode}/01/all.js`
  try {
    await throttleUpstream()
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'http://q.10jqka.com.cn/', Accept: '*/*' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const text = await response.text()
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
    // 日期重建：sortYear 逐年分配 MMDD。
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

export function registerFinanceRoutes(app: Hono): void {
  app.get('/finance/search', async (c) => {
    const q = c.req.query('q')?.trim() ?? ''
    if (!q || q.length > 40) return c.json({ error: 'invalid query' }, 400)
    const cacheKey = `search:${q}`
    const cached = cacheGet<SearchItem[]>(cacheKey)
    if (cached) return c.json({ items: cached })

    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`
    try {
      const data = (await fetchJson(url, 'https://www.eastmoney.com/')) as {
        QuotationCodeTable?: { Data?: Array<Record<string, string>> }
      }
      const items: SearchItem[] = (data.QuotationCodeTable?.Data ?? [])
        .map((row) => ({
          quoteId: row.QuoteID ?? '',
          code: row.Code ?? '',
          name: row.Name ?? '',
          type: row.Classify ?? '',
          typeName: row.SecurityTypeName ?? '',
          market: row.MktNum ?? '',
        }))
        .filter((item) => item.quoteId && item.code && item.name)
      cacheSet(cacheKey, items)
      return c.json({ items })
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })

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

    // 主源：东财历史行情；失败时回退到腾讯/同花顺（对抗东财 push2his 概率性 RST）。
    // 个股/指数用 25s 退避跨过东财 ~15-20s 的拒绝窗口再重试；板块有同花顺
    // 兜底，单次不重试快速失败，避免用户等待过长。
    const isBoard = secid.startsWith('90.')
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&ut=fa5fd1943c7b386f172d6893dbfba10b&klt=${klt}&fqt=1&lmt=${limit}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`
    try {
      const data = (await fetchJson(url, 'https://quote.eastmoney.com/', 25_000, isBoard ? 1 : 2)) as {
        data?: { code?: string; name?: string; klines?: string[] }
      }
      const klines: Kline[] = (data.data?.klines ?? []).map((line) => {
        const f = line.split(',')
        return {
          date: f[0] ?? '',
          open: Number(f[1] ?? 0),
          close: Number(f[2] ?? 0),
          high: Number(f[3] ?? 0),
          low: Number(f[4] ?? 0),
          volume: Number(f[5] ?? 0),
          amount: Number(f[6] ?? 0),
          amplitude: Number(f[7] ?? 0),
          pct: Number(f[8] ?? 0),
          change: Number(f[9] ?? 0),
          turnover: Number(f[10] ?? 0),
        }
      })
      const result: KlineResponse = {
        code: data.data?.code ?? '',
        name: data.data?.name ?? '',
        secid,
        klt,
        klines,
      }
      cacheSet(cacheKey, result)
      return c.json(result)
    } catch {
      // 回退顺序：板块（BK）→ 同花顺历史 K 线；其余 → 腾讯行情。
      // 腾讯不支持板块，板块此前在东财失败时只能 502，现由同花顺兜底。
      if (isBoard) {
        const boards = await loadThsBoards()
        const platecode = boards ? resolveThsPlatecode(boards, name) : null
        if (platecode) {
          const fallback = await fetchThsKline(platecode, limit)
          if (fallback) {
            const result: KlineResponse = {
              code: fallback.code,
              name: fallback.name || name,
              secid,
              klt,
              klines: fallback.klines,
            }
            cacheSet(cacheKey, result)
            return c.json(result)
          }
        }
        return c.json({ error: '数据源暂时不可用' }, 502)
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
      cacheSet(cacheKey, result)
      return c.json(result)
    }
  })

  app.get('/finance/fund/nav', async (c) => {
    const code = c.req.query('code')?.trim() ?? ''
    const limit = Number(c.req.query('limit') ?? '250')
    if (!/^\d{6}$/.test(code)) return c.json({ error: 'invalid fund code' }, 400)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

    const cacheKey = `fundnav:${code}:${limit}`
    const cached = cacheGet<FundNavResponse>(cacheKey)
    if (cached) return c.json(cached)

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
      const result: FundNavResponse = { code, name: '', nav }
      cacheSet(cacheKey, result)
      return c.json(result)
    } catch {
      return c.json({ error: '数据源暂时不可用' }, 502)
    }
  })
}
