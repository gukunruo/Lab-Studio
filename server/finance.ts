import type { Hono } from 'hono'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 内存缓存：key → { value, expiresAt }。行情为公开数据，仅做短期缓存避免触发上游风控。
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

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL })
}

// 上游（东财）对高频请求做 IP 级风控：同一 IP 短时间内连续请求会触发
// 约 3 分钟的全量拒绝（UND_ERR_SOCKET / other side closed）。因此对上游
// 请求做全局节流（两次请求最小间隔），并在失败时退避更久，避免触发风控。
let lastUpstreamAt = 0
const MIN_UPSTREAM_INTERVAL = 2500

async function throttleUpstream(): Promise<void> {
  const elapsed = Date.now() - lastUpstreamAt
  if (elapsed < MIN_UPSTREAM_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_UPSTREAM_INTERVAL - elapsed))
  }
  lastUpstreamAt = Date.now()
}

async function fetchJson(url: string, referer: string): Promise<unknown> {
  // 连接类错误（UND_ERR_SOCKET）在风控窗口内重试无效，退避后重试一次，
  // 仍未恢复则向上抛错，由前端提示「稍后重试」。避免密集重试加剧风控。
  const MAX_ATTEMPTS = 2
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 4000))
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
    const klt = c.req.query('klt') ?? '101'
    const limit = Number(c.req.query('limit') ?? '250')
    if (!/^[0-9A-Za-z]+\.[0-9A-Za-z]+$/.test(secid)) return c.json({ error: 'invalid secid' }, 400)
    if (!['101', '102', '103'].includes(klt)) return c.json({ error: 'invalid klt' }, 400)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

    const cacheKey = `kline:${secid}:${klt}:${limit}`
    const cached = cacheGet<KlineResponse>(cacheKey)
    if (cached) return c.json(cached)

    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&ut=fa5fd1943c7b386f172d6893dbfba10b&klt=${klt}&fqt=1&lmt=${limit}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`
    try {
      const data = (await fetchJson(url, 'https://quote.eastmoney.com/')) as {
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
      return c.json({ error: '数据源暂时不可用' }, 502)
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
