const EASTMONEY_ENDPOINTS = [
  'https://push2.eastmoney.com/api/qt/clist/get',
  'https://pushguest.eastmoney.com/api/qt/clist/get',
]
const EASTMONEY_REFERER = 'https://quote.eastmoney.com/'
const DEFAULT_PAGE_SIZE = 1000
const MAX_RETRIES = 1

export interface EastmoneyTable<T> {
  total: number
  items: T[]
}

export interface EastmoneyRequestParams {
  fs: string
  pn: number
  pz: number
  fields: string
}

export interface EastmoneyClient {
  request<T>(params: EastmoneyRequestParams): Promise<EastmoneyTable<T>>
}

export interface EastmoneyBoardRow {
  f12: string
  f14: string
  f86?: string | number
  f124?: string | number
}

export interface EastmoneyMemberRow {
  f12: string
  f14?: string
  f20: number | string
  f86?: string | number
  f124?: string | number
}

export interface EastmoneySnapshot {
  asOfDate: string
  startedAt: number
  maxSnapshotSkewMs: number
}

export interface EastmoneyBoardMarketCapAggregate {
  boardCode: string
  weight: number
  marketCap: number
  marketCapUnit: '元'
  memberCount: number
  coveredMemberCount: number
  tradeDate: string
  snapshotAt: string
}

export class EastmoneyUnavailableError extends Error {
  constructor(reason = 'Eastmoney provider is unavailable') {
    super(reason)
    this.name = 'EastmoneyUnavailableError'
  }
}

export class EastmoneyCoverageError extends Error {
  constructor(reason = 'Eastmoney coverage is incomplete') {
    super(reason)
    this.name = 'EastmoneyCoverageError'
  }
}

function requestUrl(endpoint: string, params: EastmoneyRequestParams): string {
  const query = new URLSearchParams({
    pn: String(params.pn),
    pz: String(Math.min(params.pz, DEFAULT_PAGE_SIZE)),
    po: '1',
    np: '1',
    timil: '1',
    ut: 'bd1d9ddb04089700cf9c27f6e3e6e0d8',
    fltt: '1',
    invt: '2',
    fid: 'f3',
    fs: params.fs,
    fields: params.fields.includes('f124') ? params.fields : `${params.fields},f124`,
    cb: '?',
  })
  return `${endpoint}?${query}`
}

function parseResponseBody(body: string): { data?: { total?: number; diff?: unknown[] } } | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  const json = trimmed.startsWith('{') ? trimmed : trimmed.replace(/^[$\w.]+\(/u, '').replace(/\);?$/u, '')
  try {
    return JSON.parse(json) as { data?: { total?: number; diff?: unknown[] } }
  } catch {
    return null
  }
}

export function createEastmoneyClient(options: {
  fetchImpl?: typeof fetch
  endpoint?: string
} = {}): EastmoneyClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoints = options.endpoint ? [options.endpoint] : EASTMONEY_ENDPOINTS

  return {
    async request<T>(params: EastmoneyRequestParams): Promise<EastmoneyTable<T>> {
      let lastError: unknown
      for (const endpoint of endpoints) {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
          try {
            const response = await fetchImpl(requestUrl(endpoint, params), {
              headers: { 'User-Agent': 'Mozilla/5.0', Referer: EASTMONEY_REFERER, Accept: 'application/javascript, application/json' },
              signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) throw new EastmoneyUnavailableError('Eastmoney request failed')
            const payload = parseResponseBody(await response.text())
            const items = payload?.data?.diff
            const total = payload?.data?.total
            if (!payload?.data || !Array.isArray(items) || typeof total !== 'number' || !Number.isInteger(total)) {
              throw new EastmoneyUnavailableError('Eastmoney returned unavailable data')
            }
            if (items.length === 0 && total > 0 && attempt < MAX_RETRIES) continue
            if (items.length === 0 && total > 0) throw new EastmoneyUnavailableError('Eastmoney returned empty data')
            return { total, items: items as T[] }
          } catch (error) {
            lastError = error
            if (attempt < MAX_RETRIES && error instanceof EastmoneyUnavailableError && /empty data/.test(error.message)) continue
            if (attempt < MAX_RETRIES && !(error instanceof EastmoneyUnavailableError)) continue
          }
        }
      }
      if (lastError instanceof EastmoneyUnavailableError) throw lastError
      throw new EastmoneyUnavailableError('Eastmoney request failed')
    },
  }
}

export function parseEastmoneySnapshotAt(value: string | number | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (!match) return null
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

interface BoardMembersInput {
  boardCode: string
  memberCount: number
  members: EastmoneyMemberRow[]
}

export function aggregateEastmoneyBoardMarketCaps(input: {
  boards: BoardMembersInput[]
  asOfDate: string
  snapshotAt: string
  maxSnapshotSkewMs?: number
}): EastmoneyBoardMarketCapAggregate[] {
  const reference = Date.parse(input.snapshotAt)
  const maxSkew = input.maxSnapshotSkewMs ?? 60_000
  if (!Number.isFinite(reference)) throw new EastmoneyCoverageError()

  const aggregates = input.boards.map((board) => {
    if (!Number.isInteger(board.memberCount) || board.memberCount <= 0 || board.members.length !== board.memberCount) {
      throw new EastmoneyCoverageError()
    }
    const seen = new Set<string>()
    let marketCap = 0
    for (const member of board.members) {
      if (!member.f12 || seen.has(member.f12)) throw new EastmoneyCoverageError()
      seen.add(member.f12)
      const value = typeof member.f20 === 'number' ? member.f20 : Number(member.f20)
      const snapshot = parseEastmoneySnapshotAt(member.f124)
      if (!Number.isFinite(value) || value <= 0 || !snapshot) throw new EastmoneyCoverageError()
      const snapshotTime = Date.parse(snapshot)
      if (snapshot.slice(0, 10) !== input.asOfDate || Math.abs(snapshotTime - reference) > maxSkew) {
        throw new EastmoneyCoverageError()
      }
      marketCap += value
    }
    if (!Number.isFinite(marketCap) || marketCap <= 0) throw new EastmoneyCoverageError()
    return {
      boardCode: board.boardCode,
      weight: 0,
      marketCap,
      marketCapUnit: '元' as const,
      memberCount: board.memberCount,
      coveredMemberCount: board.members.length,
      tradeDate: input.asOfDate,
      snapshotAt: input.snapshotAt,
    }
  })

  const total = aggregates.reduce((sum, row) => sum + row.marketCap, 0)
  if (!Number.isFinite(total) || total <= 0) throw new EastmoneyCoverageError()
  return aggregates.map((row) => ({ ...row, weight: row.marketCap / total }))
}

function normalizedBoardName(name: string): string {
  return name.trim().replace(/(行业|概念)$/u, '')
}

async function fetchAllPages<T>(client: EastmoneyClient, fs: string, fields: string): Promise<EastmoneyTable<T>> {
  const first = await client.request<T>({ fs, pn: 1, pz: DEFAULT_PAGE_SIZE, fields })
  if (first.total < 0 || first.items.length > first.total) throw new EastmoneyCoverageError()
  const pages = Math.ceil(first.total / DEFAULT_PAGE_SIZE)
  const items = [...first.items]
  for (let page = 2; page <= pages; page += 1) {
    const next = await client.request<T>({ fs, pn: page, pz: DEFAULT_PAGE_SIZE, fields })
    items.push(...next.items)
    if (next.total !== first.total) throw new EastmoneyCoverageError()
  }
  if (items.length !== first.total) throw new EastmoneyCoverageError()
  return { total: first.total, items }
}

export async function fetchEastmoneyBoardMarketCaps(input: {
  rows: Array<{ code: string; name: string }>
  kind: 'industry' | 'concept'
  snapshot: EastmoneySnapshot
  client?: EastmoneyClient
}): Promise<EastmoneyBoardMarketCapAggregate[]> {
  const client = input.client ?? createEastmoneyClient()
  const boardType = input.kind === 'industry' ? '2' : '3'
  const directory = await fetchAllPages<EastmoneyBoardRow>(client, `m:90+t:${boardType}`, 'f12,f14,f20,f86,f124')
  const wanted = new Map<string, EastmoneyBoardRow>()
  for (const row of directory.items) {
    if (!row.f12 || !row.f14) continue
    const name = normalizedBoardName(row.f14)
    if (wanted.has(name)) throw new EastmoneyCoverageError('ambiguous board mapping')
    wanted.set(name, row)
  }

  const boardInputs: BoardMembersInput[] = []
  for (const row of input.rows) {
    const board = wanted.get(normalizedBoardName(row.name))
    if (!board) throw new EastmoneyCoverageError('incomplete board mapping')
    const members = await fetchAllPages<EastmoneyMemberRow>(client, `b:${board.f12}`, 'f12,f14,f20,f86,f124')
    boardInputs.push({ boardCode: row.code, memberCount: members.total, members: members.items })
  }
  const snapshotTimes = boardInputs.flatMap((board) => board.members.map((member) => parseEastmoneySnapshotAt(member.f124)))
  if (snapshotTimes.some((snapshot) => snapshot === null) || !snapshotTimes.length) {
    throw new EastmoneyCoverageError('missing member snapshot time')
  }
  const parsedTimes = snapshotTimes.map((snapshot) => Date.parse(snapshot!))
  const referenceTime = parsedTimes[0]!
  const maxTime = Math.max(...parsedTimes)
  const minTime = Math.min(...parsedTimes)
  const snapshotAt = new Date(referenceTime).toISOString()
  const tradeDate = snapshotAt.slice(0, 10)
  if (tradeDate > input.snapshot.asOfDate || maxTime - minTime > input.snapshot.maxSnapshotSkewMs) {
    throw new EastmoneyCoverageError('inconsistent member snapshot time')
  }

  return aggregateEastmoneyBoardMarketCaps({
    boards: boardInputs,
    asOfDate: tradeDate,
    snapshotAt,
    maxSnapshotSkewMs: input.snapshot.maxSnapshotSkewMs,
  })
}
