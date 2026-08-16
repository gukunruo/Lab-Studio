const TUSHARE_ENDPOINT = 'https://api.tushare.pro'

export interface TushareTable<T> {
  fields: string[]
  items: T[]
}

export interface TushareClient {
  request<T>(
    apiName: string,
    params: Record<string, string | number | undefined>,
    fields: string,
  ): Promise<TushareTable<T>>
}

export interface TradeCalendarRow {
  cal_date: string
  is_open: number | string
}

export interface ThsMemberRow {
  ts_code: string
  con_code: string
  in_date: string
  out_date: string
}

export interface DailyBasicRow {
  ts_code: string
  trade_date: string
  total_mv: number | string
}

export interface TushareBoardRow {
  ts_code: string
  name?: string
  type?: string
}

export interface BoardMarketCapAggregate {
  boardCode: string
  weight: number
  marketCap: number
  memberCount: number
  coveredMemberCount: number
  marketCapUnit: '万元'
  tradeDate: string
}

export class TushareUnavailableError extends Error {
  constructor(reason = 'Tushare provider is unavailable') {
    super(reason)
    this.name = 'TushareUnavailableError'
  }
}

export class TushareCoverageError extends Error {
  constructor(reason = 'Tushare coverage is incomplete') {
    super(reason)
    this.name = 'TushareCoverageError'
  }
}

export function createTushareClient(options: {
  token?: string
  fetchImpl?: typeof fetch
  endpoint?: string
} = {}): TushareClient {
  const token = options.token ?? process.env.TUSHARE_TOKEN ?? ''
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint ?? TUSHARE_ENDPOINT

  return {
    async request<T>(
      apiName: string,
      params: Record<string, string | number | undefined>,
      fields: string,
    ) {
      if (!token) throw new TushareUnavailableError('Tushare token is unavailable')
      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_name: apiName, token, params, fields }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        throw new TushareUnavailableError('Tushare request failed')
      }
      if (!response.ok) throw new TushareUnavailableError('Tushare request failed')
      const payload = await response.json().catch(() => null) as {
        code?: number
        msg?: string
        data?: { fields?: string[]; items?: unknown[] }
      } | null
      if (!payload || payload.code !== 0 || !payload.data || !Array.isArray(payload.data.items)) {
        throw new TushareUnavailableError('Tushare returned unavailable data')
      }
      return {
        fields: payload.data.fields ?? [],
        items: payload.data.items as T[],
      }
    },
  }
}

export function resolveLatestTradingDate(rows: TradeCalendarRow[], asOf: string): string | null {
  return rows
    .filter((row) => row.is_open === 1 || row.is_open === '1')
    .map((row) => row.cal_date)
    .filter((date) => date <= asOf)
    .sort()
    .at(-1) ?? null
}

export function activeMembersAt(rows: ThsMemberRow[], tradeDate: string): ThsMemberRow[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.con_code || seen.has(row.con_code)) return false
    if (row.in_date && row.in_date > tradeDate) return false
    if (row.out_date && row.out_date <= tradeDate) return false
    seen.add(row.con_code)
    return true
  })
}

export function aggregateBoardMarketCaps(input: {
  boards: TushareBoardRow[]
  members: ThsMemberRow[]
  dailyBasic: DailyBasicRow[]
  tradeDate: string
}): BoardMarketCapAggregate[] {
  const { boards, members, dailyBasic, tradeDate } = input
  const basicByCode = new Map<string, number>()
  for (const row of dailyBasic) {
    if (row.trade_date !== tradeDate) throw new Error('mixed trade dates in daily basic')
    const value = typeof row.total_mv === 'number' ? row.total_mv : Number(row.total_mv)
    if (Number.isFinite(value) && value > 0) basicByCode.set(row.ts_code, value)
  }

  const aggregates = boards.map((board) => {
    const boardMembers = activeMembersAt(
      members.filter((member) => member.ts_code === board.ts_code),
      tradeDate,
    )
    if (!boardMembers.length) throw new TushareCoverageError('incomplete market-cap coverage')
    let marketCap = 0
    for (const member of boardMembers) {
      const value = basicByCode.get(member.con_code)
      if (value === undefined) throw new TushareCoverageError('incomplete market-cap coverage')
      marketCap += value
    }
    if (!Number.isFinite(marketCap) || marketCap <= 0) throw new Error('invalid market-cap aggregate')
    return {
      boardCode: board.ts_code,
      weight: 0,
      marketCap,
      memberCount: boardMembers.length,
      coveredMemberCount: boardMembers.length,
      marketCapUnit: '万元' as const,
      tradeDate,
    }
  })

  const total = aggregates.reduce((sum, row) => sum + row.marketCap, 0)
  if (!Number.isFinite(total) || total <= 0) throw new Error('invalid market-cap total')
  return aggregates.map((row) => ({ ...row, weight: row.marketCap / total }))
}

function normalizedBoardName(name: string): string {
  return name.trim().replace(/(行业|概念)$/u, '')
}

export async function fetchTushareBoardMarketCaps(input: {
  rows: Array<{ code: string; name: string }>
  kind: 'industry' | 'concept'
  client?: TushareClient
  asOf?: string
  now?: () => number
}): Promise<BoardMarketCapAggregate[]> {
  const client = input.client ?? createTushareClient()
  const asOf = input.asOf ?? new Date(input.now?.() ?? Date.now()).toISOString().slice(0, 10)
  const calendar = await client.request<TradeCalendarRow>('trade_cal', { exchange: 'SSE' }, 'cal_date,is_open')
  const tradeDate = resolveLatestTradingDate(calendar.items, asOf)
  if (!tradeDate) throw new TushareUnavailableError('Tushare has no latest trading date')

  const indexRows = await client.request<TushareBoardRow>('ths_index', {}, 'ts_code,name,type')
  const wanted = input.kind === 'industry' ? 'I' : 'N'
  const byName = new Map(indexRows.items
    .filter((row) => !row.type || row.type === wanted)
    .filter((row): row is TushareBoardRow & { name: string } => Boolean(row.ts_code && row.name))
    .map((row) => [normalizedBoardName(row.name), row]))
  const matched = input.rows.map((row) => {
    const match = byName.get(normalizedBoardName(row.name))
    if (!match) throw new Error('incomplete board mapping')
    return { source: row, board: match }
  })

  const members = await client.request<ThsMemberRow>('ths_member', {}, 'ts_code,con_code,in_date,out_date')
  const dailyBasic = await client.request<DailyBasicRow>('daily_basic', { trade_date: tradeDate }, 'ts_code,trade_date,total_mv')
  const aggregates = aggregateBoardMarketCaps({
    boards: matched.map(({ board }) => board),
    members: members.items,
    dailyBasic: dailyBasic.items,
    tradeDate,
  })
  const aggregateByCode = new Map(aggregates.map((row) => [row.boardCode, row]))
  return matched.map(({ board }) => {
    const aggregate = aggregateByCode.get(board.ts_code)
    if (!aggregate) throw new TushareCoverageError('incomplete market-cap coverage')
    return { ...aggregate, boardCode: matched.find(({ board: item }) => item.ts_code === board.ts_code)!.source.code }
  })
}
