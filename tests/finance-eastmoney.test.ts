import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateEastmoneyBoardMarketCaps,
  createEastmoneyClient,
  EastmoneyCoverageError,
  fetchEastmoneyBoardMarketCaps,
  parseEastmoneySnapshotAt,
  type EastmoneyBoardRow,
  type EastmoneyMemberRow,
} from '../server/finance-eastmoney'

function response(items: unknown[], total = items.length) {
  return new Response(JSON.stringify({ data: { total, diff: items } }), { status: 200 })
}

const boardRows: EastmoneyBoardRow[] = [
  { f12: 'BK0001', f14: '白酒', f86: '20260815150000' },
  { f12: 'BK0002', f14: '银行', f86: '20260815150000' },
]

const memberRows: EastmoneyMemberRow[] = [
  { f12: '600000', f14: '甲', f20: '100000000', f86: '20260815150000' },
  { f12: '600001', f14: '乙', f20: '300000000', f86: '20260815150000' },
]

test('Eastmoney client builds clist requests with board and member query fields', async () => {
  const requests: URL[] = []
  const client = createEastmoneyClient({
    fetchImpl: async (input) => {
      requests.push(new URL(String(input)))
      return response([])
    },
  })

  await client.request({ fs: 'm:90+t:2', pn: 1, pz: 1000, fields: 'f12,f14,f20,f86' })
  await client.request({ fs: 'b:BK0001', pn: 2, pz: 1000, fields: 'f12,f14,f20,f86' })

  assert.equal(requests[0]?.searchParams.get('fs'), 'm:90+t:2')
  assert.equal(requests[1]?.searchParams.get('fs'), 'b:BK0001')
  assert.equal(requests[1]?.searchParams.get('pn'), '2')
  assert.equal(requests[1]?.searchParams.get('pz'), '1000')
  assert.ok(Number(requests[0]?.searchParams.get('pz')) <= 1000)
})

test('Eastmoney client retries one empty response before failing', async () => {
  let calls = 0
  const client = createEastmoneyClient({
    fetchImpl: async () => {
      calls += 1
      return calls === 1 ? new Response('', { status: 200 }) : response(memberRows)
    },
  })

  const table = await client.request({ fs: 'b:BK0001', pn: 1, pz: 1000, fields: 'f12,f14,f20,f86' })
  assert.equal(calls, 2)
  assert.deepEqual(table.items, memberRows)
})

test('Eastmoney snapshot timestamps normalize to a trading date', () => {
  assert.equal(parseEastmoneySnapshotAt('20260815150000'), '2026-08-15T15:00:00.000Z')
  assert.equal(parseEastmoneySnapshotAt('2026-08-15 15:00:00'), '2026-08-15T15:00:00.000Z')
  assert.equal(parseEastmoneySnapshotAt(''), null)
})

test('Eastmoney aggregates member total market caps into normalized board weights', () => {
  const aggregates = aggregateEastmoneyBoardMarketCaps({
    boards: [
      { boardCode: 'BK0001', memberCount: 2, members: memberRows },
      { boardCode: 'BK0002', memberCount: 1, members: [{ ...memberRows[0], f12: '600002', f20: '600000000' }] },
    ],
    asOfDate: '2026-08-15',
    snapshotAt: '2026-08-15T15:00:00.000Z',
  })

  assert.deepEqual(aggregates.map((row) => ({
    boardCode: row.boardCode,
    marketCap: row.marketCap,
    weight: row.weight,
    memberCount: row.memberCount,
    coveredMemberCount: row.coveredMemberCount,
    marketCapUnit: row.marketCapUnit,
    tradeDate: row.tradeDate,
  })), [
    { boardCode: 'BK0001', marketCap: 400000000, weight: 0.4, memberCount: 2, coveredMemberCount: 2, marketCapUnit: '元', tradeDate: '2026-08-15' },
    { boardCode: 'BK0002', marketCap: 600000000, weight: 0.6, memberCount: 1, coveredMemberCount: 1, marketCapUnit: '元', tradeDate: '2026-08-15' },
  ])
})

test('Eastmoney rejects incomplete, duplicate, invalid, or stale member coverage', () => {
  assert.throws(() => aggregateEastmoneyBoardMarketCaps({
    boards: [{ boardCode: 'BK0001', memberCount: 2, members: [memberRows[0]] }],
    asOfDate: '2026-08-15',
    snapshotAt: '2026-08-15T15:00:00.000Z',
  }), EastmoneyCoverageError)

  assert.throws(() => aggregateEastmoneyBoardMarketCaps({
    boards: [{ boardCode: 'BK0001', memberCount: 2, members: [memberRows[0], { ...memberRows[0], f20: '200' }] }],
    asOfDate: '2026-08-15',
    snapshotAt: '2026-08-15T15:00:00.000Z',
  }), EastmoneyCoverageError)

  assert.throws(() => aggregateEastmoneyBoardMarketCaps({
    boards: [{ boardCode: 'BK0001', memberCount: 1, members: [{ ...memberRows[0], f20: '0' }] }],
    asOfDate: '2026-08-15',
    snapshotAt: '2026-08-15T15:00:00.000Z',
  }), EastmoneyCoverageError)

  assert.throws(() => aggregateEastmoneyBoardMarketCaps({
    boards: [{ boardCode: 'BK0001', memberCount: 1, members: [{ ...memberRows[0], f86: '20260814150000' }] }],
    asOfDate: '2026-08-15',
    snapshotAt: '2026-08-15T15:00:00.000Z',
  }), EastmoneyCoverageError)
})

test('Eastmoney fetch rejects mixed member snapshot dates', async () => {
  const client = createEastmoneyClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input))
      if (url.searchParams.get('fs') === 'm:90+t:2') return response(boardRows)
      return response(memberRows.map((member, index) => ({ ...member, f86: index === 0 ? '20260815150000' : '20260814150000' })))
    },
  })

  await assert.rejects(fetchEastmoneyBoardMarketCaps({
    rows: [{ code: 'BK0001', name: '白酒' }],
    kind: 'industry',
    snapshot: { asOfDate: '2026-08-16', startedAt: Date.parse('2026-08-16T15:00:00.000Z'), maxSnapshotSkewMs: 60_000 },
    client,
  }), EastmoneyCoverageError)
})

test('Eastmoney fetch maps unique board names and requires full member totals', async () => {
  const requests: URL[] = []
  const client = createEastmoneyClient({
    fetchImpl: async (input) => {
      const url = new URL(String(input))
      requests.push(url)
      if (url.searchParams.get('fs') === 'm:90+t:2') return response(boardRows)
      if (url.searchParams.get('fs') === 'b:BK0001') return response(memberRows)
      return response([{ ...memberRows[0], f12: '600002', f20: '600000000' }])
    },
  })

  const result = await fetchEastmoneyBoardMarketCaps({
    rows: [{ code: 'BK0001', name: '白酒' }, { code: 'BK0002', name: '银行' }],
    kind: 'industry',
    snapshot: { asOfDate: '2026-08-15', startedAt: Date.parse('2026-08-15T15:00:00.000Z'), maxSnapshotSkewMs: 60_000 },
    client,
  })

  assert.deepEqual(result.map((row) => [row.boardCode, row.marketCap]), [['BK0001', 400000000], ['BK0002', 600000000]])
  assert.ok(requests.every((url) => Number(url.searchParams.get('pz')) <= 1000))
})
