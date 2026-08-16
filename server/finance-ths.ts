const THS_REFERERS = {
  industry: 'http://q.10jqka.com.cn/thshy/',
  concept: 'http://q.10jqka.com.cn/gn/',
} as const
const THS_BASE_URL = 'http://q.10jqka.com.cn/'
const TENCENT_ENDPOINT = 'https://qt.gtimg.cn/q='
const TENCENT_REFERER = 'https://gu.qq.com/'
const TENCENT_BATCH_SIZE = 60
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface ThsMember {
  code: string
  name: string
}

export interface ThsMembersPage {
  page: number
  totalPages: number
  members: ThsMember[]
  baseUrl: string
  requestQuery: string
}

export interface TencentMarketCap {
  symbol: string
  marketCap: number
  tradeDate: string
}

export interface ThsBoardMarketCapAggregate {
  boardCode: string
  marketCap: number
  weight: number
  marketCapUnit: '元'
  memberCount: number
  coveredMemberCount: number
  tradeDate: string
  snapshotAt: string
}

export class ThsUnavailableError extends Error {
  constructor(reason = 'Tonghuashun provider is unavailable') {
    super(reason)
    this.name = 'ThsUnavailableError'
  }
}

export class ThsCoverageError extends Error {
  constructor(reason = 'Tonghuashun coverage is incomplete') {
    super(reason)
    this.name = 'ThsCoverageError'
  }
}

function parseNumber(value: string): number {
  const normalized = value.trim().replaceAll(',', '')
  return Number(normalized)
}

function parseDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/u)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/gu, '').trim())
}

export function parseThsMembersPage(html: string): ThsMembersPage {
  const pageInfo = html.match(/class=["']page_info["'][^>]*>\s*(\d+)\s*\/\s*(\d+)\s*</u)
  const baseUrl = html.match(/id=["']baseUrl["'][^>]*value=["']([^"']+)["']/u)?.[1]
  const requestQuery = html.match(/id=["']requestQuery["'][^>]*value=["']([^"']+)["']/u)?.[1]
  if (!pageInfo || !baseUrl || !requestQuery) throw new ThsCoverageError('missing member page metadata')

  const members: ThsMember[] = []
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu)].map((cell) => cell[1]!)
    const code = cells[1]?.match(/(?:stockpage\.10jqka\.com\.cn\/)?(\d{6})/u)?.[1]
      ?? stripTags(cells[1] ?? '').match(/^\d{6}$/u)?.[0]
    const name = stripTags(cells[2] ?? '')
    if (!code || !name) continue
    members.push({ code, name })
  }
  if (!members.length) throw new ThsCoverageError('empty member page')

  return {
    page: Number(pageInfo[1]),
    totalPages: Number(pageInfo[2]),
    members,
    baseUrl,
    requestQuery,
  }
}

export function buildTencentSymbols(codes: string[]): string[] {
  return codes.map((code) => {
    if (/^6\d{5}$/u.test(code)) return `sh${code}`
    if (/^(0|3)\d{5}$/u.test(code)) return `sz${code}`
    if (/^9\d{5}$/u.test(code)) return `bj${code}`
    throw new ThsCoverageError('member code cannot map to Tencent symbol')
  })
}

export function parseTencentQuotes(
  text: string,
  readFields?: (symbol: string) => string[],
): TencentMarketCap[] {
  const rows: TencentMarketCap[] = []
  for (const match of text.matchAll(/v_([a-z]{2}\d{6})="([^"]*)"/gu)) {
    const symbol = match[1]!
    const fields = readFields ? readFields(symbol.slice(2)) : match[2]!.split('~')
    const marketCapYi = parseNumber(fields[45] ?? '')
    const marketCap = marketCapYi * 100_000_000
    const tradeDate = parseDate(fields[30] ?? '')
    if (!Number.isFinite(marketCapYi) || marketCapYi <= 0) throw new ThsCoverageError('invalid Tencent total market cap')
    if (!Number.isFinite(marketCap) || marketCap <= 0 || !tradeDate) throw new ThsCoverageError('invalid Tencent total market cap')
    rows.push({ symbol, marketCap, tradeDate })
  }
  if (!rows.length) throw new ThsCoverageError('Tencent returned no quotes')
  return rows
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

async function fetchText(url: string, referer: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Referer: referer, Accept: '*/*' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ThsUnavailableError('upstream request failed')
  const buffer = await response.arrayBuffer()
  const text = new TextDecoder('gbk').decode(buffer)
  if (text.includes('upass.10jqka.com.cn/login')) throw new ThsUnavailableError('upstream requires interactive login')
  return text
}

function memberPageUrl(page: ThsMembersPage, pageNumber: number): string {
  const path = `${page.baseUrl}/${page.requestQuery}/page/${pageNumber}/`
  return new URL(path, THS_BASE_URL).toString()
}

async function fetchAllMembers(
  boardCode: string,
  kind: 'industry' | 'concept',
  fetchImpl: typeof fetch,
): Promise<ThsMember[]> {
  const first = parseThsMembersPage(await fetchText(`${THS_BASE_URL}${kind === 'industry' ? 'thshy' : 'gn'}/detail/code/${boardCode}/`, THS_REFERERS[kind], fetchImpl))
  if (first.page !== 1 || !Number.isInteger(first.totalPages) || first.totalPages < 1) throw new ThsCoverageError('invalid member page count')
  const members = [...first.members]
  for (let pageNumber = 2; pageNumber <= first.totalPages; pageNumber += 1) {
    const next = parseThsMembersPage(await fetchText(memberPageUrl(first, pageNumber), THS_REFERERS[kind], fetchImpl))
    if (next.page !== pageNumber || next.totalPages !== first.totalPages || next.members.length === 0) throw new ThsCoverageError('member pagination is incomplete')
    members.push(...next.members)
  }
  const seen = new Set<string>()
  for (const member of members) {
    if (seen.has(member.code)) throw new ThsCoverageError('duplicate member')
    seen.add(member.code)
  }
  return members
}

async function fetchTencentMarketCaps(symbols: string[], fetchImpl: typeof fetch): Promise<TencentMarketCap[]> {
  const result: TencentMarketCap[] = []
  for (const batch of batches(symbols, TENCENT_BATCH_SIZE)) {
    const text = await fetchText(`${TENCENT_ENDPOINT}${batch.join(',')}`, TENCENT_REFERER, fetchImpl)
    result.push(...parseTencentQuotes(text))
  }
  const bySymbol = new Map<string, TencentMarketCap>()
  for (const quote of result) {
    if (bySymbol.has(quote.symbol)) throw new ThsCoverageError('duplicate Tencent quote')
    bySymbol.set(quote.symbol, quote)
  }
  if (bySymbol.size !== symbols.length || symbols.some((symbol) => !bySymbol.has(symbol))) throw new ThsCoverageError('missing Tencent quote')
  return symbols.map((symbol) => bySymbol.get(symbol)!)
}

export function aggregateThsBoardMarketCaps(input: {
  boards: Array<{ boardCode: string; members: ThsMember[]; marketCaps: number[] }>
  tradeDate: string
  snapshotAt?: string
}): ThsBoardMarketCapAggregate[] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.tradeDate)) throw new ThsCoverageError('invalid trade date')
  const aggregates = input.boards.map((board) => {
    if (!board.members.length || board.members.length !== board.marketCaps.length) throw new ThsCoverageError()
    const seen = new Set<string>()
    let marketCap = 0
    for (const [index, member] of board.members.entries()) {
      if (seen.has(member.code)) throw new ThsCoverageError('duplicate member')
      seen.add(member.code)
      const value = board.marketCaps[index]!
      if (!Number.isFinite(value) || value <= 0) throw new ThsCoverageError('invalid market cap')
      marketCap += value
    }
    if (!Number.isFinite(marketCap) || marketCap <= 0) throw new ThsCoverageError()
    return {
      boardCode: board.boardCode,
      marketCap,
      weight: 0,
      marketCapUnit: '元' as const,
      memberCount: board.members.length,
      coveredMemberCount: board.members.length,
      tradeDate: input.tradeDate,
      snapshotAt: input.snapshotAt ?? `${input.tradeDate}T00:00:00.000Z`,
    }
  })
  const total = aggregates.reduce((sum, row) => sum + row.marketCap, 0)
  if (!Number.isFinite(total) || total <= 0) throw new ThsCoverageError()
  return aggregates.map((row) => ({ ...row, weight: row.marketCap / total }))
}

export async function fetchThsBoardMarketCaps(input: {
  rows: Array<{ code: string; name: string }>
  kind: 'industry' | 'concept'
  fetchImpl?: typeof fetch
}): Promise<ThsBoardMarketCapAggregate[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const boards: Array<{ boardCode: string; members: ThsMember[]; marketCaps: number[] }> = []
  let tradeDate: string | undefined
  let snapshotAt: string | undefined
  for (const row of input.rows) {
    const members = await fetchAllMembers(row.code, input.kind, fetchImpl)
    const symbols = buildTencentSymbols(members.map((member) => member.code))
    const quotes = await fetchTencentMarketCaps(symbols, fetchImpl)
    const boardDate = quotes[0]?.tradeDate
    if (!boardDate || quotes.some((quote) => quote.tradeDate !== boardDate)) throw new ThsCoverageError('mixed Tencent trade dates')
    if (tradeDate && tradeDate !== boardDate) throw new ThsCoverageError('mixed board trade dates')
    tradeDate = boardDate
    snapshotAt = `${boardDate}T15:00:00.000Z`
    boards.push({ boardCode: row.code, members, marketCaps: quotes.map((quote) => quote.marketCap) })
  }
  if (!tradeDate || !snapshotAt) throw new ThsCoverageError('missing Tencent trade date')
  return aggregateThsBoardMarketCaps({ boards, tradeDate, snapshotAt })
}
