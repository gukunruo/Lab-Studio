import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeMembersAt,
  aggregateBoardMarketCaps,
  createTushareClient,
  resolveLatestTradingDate,
  type DailyBasicRow,
  type ThsMemberRow,
  type TradeCalendarRow,
} from '../server/finance-tushare'

test('Tushare client sends the token and API request body', async () => {
  let request: { url: string; body: Record<string, unknown> } | null = null
  const client = createTushareClient({
    token: 'test-token',
    fetchImpl: async (input, init) => {
      request = { url: String(input), body: JSON.parse(String(init?.body)) }
      return new Response(JSON.stringify({ code: 0, data: { fields: [], items: [] } }), { status: 200 })
    },
  })

  await client.request('trade_cal', { exchange: 'SSE' }, 'cal_date,is_open')

  assert.deepEqual(request, {
    url: 'https://api.tushare.pro',
    body: {
      api_name: 'trade_cal',
      token: 'test-token',
      params: { exchange: 'SSE' },
      fields: 'cal_date,is_open',
    },
  })
})

test('missing Tushare token performs no request and returns unavailable', async () => {
  let calls = 0
  const client = createTushareClient({
    token: '',
    fetchImpl: async () => {
      calls += 1
      return new Response('{}')
    },
  })

  await assert.rejects(client.request('trade_cal', {}, 'cal_date'), /Tushare token is unavailable/)
  assert.equal(calls, 0)
})

test('latest trading date is the latest open date not after as-of date', () => {
  const rows: TradeCalendarRow[] = [
    { cal_date: '2026-08-14', is_open: 1 },
    { cal_date: '2026-08-15', is_open: 0 },
    { cal_date: '2026-08-16', is_open: 1 },
  ]
  assert.equal(resolveLatestTradingDate(rows, '2026-08-15'), '2026-08-14')
})

test('active members respect inclusive in date and exclusive out date', () => {
  const rows: ThsMemberRow[] = [
    { ts_code: '000001.SZ', con_code: '600000.SH', in_date: '2026-01-01', out_date: '' },
    { ts_code: '000001.SZ', con_code: '600001.SH', in_date: '2026-02-01', out_date: '2026-08-15' },
    { ts_code: '000001.SZ', con_code: '600002.SH', in_date: '2026-08-16', out_date: '' },
  ]
  assert.deepEqual(activeMembersAt(rows, '2026-08-15').map((row) => row.con_code), ['600000.SH'])
  assert.deepEqual(activeMembersAt(rows, '2026-08-16').map((row) => row.con_code), ['600000.SH', '600002.SH'])
})

test('board market caps require complete positive same-date member coverage', () => {
  const members: ThsMemberRow[] = [
    { ts_code: 'THS001.CN', con_code: '600000.SH', in_date: '2026-01-01', out_date: '' },
    { ts_code: 'THS001.CN', con_code: '600001.SH', in_date: '2026-01-01', out_date: '' },
    { ts_code: 'THS002.CN', con_code: '600001.SH', in_date: '2026-01-01', out_date: '' },
  ]
  const dailyBasic: DailyBasicRow[] = [
    { ts_code: '600000.SH', trade_date: '2026-08-14', total_mv: 100 },
    { ts_code: '600001.SH', trade_date: '2026-08-14', total_mv: 300 },
  ]

  assert.deepEqual(
    aggregateBoardMarketCaps({
      boards: [{ ts_code: 'THS001.CN' }, { ts_code: 'THS002.CN' }],
      members,
      dailyBasic,
      tradeDate: '2026-08-14',
    }),
    [
      { boardCode: 'THS001.CN', weight: 400 / 700, marketCap: 400, memberCount: 2, coveredMemberCount: 2, marketCapUnit: '万元', tradeDate: '2026-08-14' },
      { boardCode: 'THS002.CN', weight: 300 / 700, marketCap: 300, memberCount: 1, coveredMemberCount: 1, marketCapUnit: '万元', tradeDate: '2026-08-14' },
    ],
  )

  assert.throws(() => aggregateBoardMarketCaps({
    boards: [{ ts_code: 'THS001.CN' }],
    members,
    dailyBasic: [{ ts_code: '600000.SH', trade_date: '2026-08-14', total_mv: 100 }],
    tradeDate: '2026-08-14',
  }), /incomplete market-cap coverage/)
})
