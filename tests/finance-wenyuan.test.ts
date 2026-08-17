import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WENYUAN_TREEMAP_URL,
  WenyuanSchemaError,
  fetchWenyuanTreemap,
  parseWenyuanTreemap,
} from '../server/finance-wenyuan'

const updatedAt = '2026-08-17T07:18:19.000Z'

function fixture() {
  return {
    market: 'all',
    period: 'day',
    updatedAt,
    stockCount: 3,
    boardCount: 2,
    source: 'direct',
    nodes: [
      {
        code: 'industry-electronics',
        name: '电子',
        value: 300,
        stockCount: 2,
        children: [
          { code: '600001.SH', name: '甲', boardName: '电子', subBoardName: '消费电子', exchange: 'SH', value: 200, price: 10, changePct: 5, turnoverAmount: 100 },
          { code: '600002.SH', name: '乙', boardName: '电子', subBoardName: '元件', exchange: 'SH', value: 100, price: 8, changePct: -2, turnoverAmount: 80 },
        ],
      },
      {
        code: 'industry-banks',
        name: '银行',
        value: 100,
        stockCount: 1,
        children: [
          { code: '600003.SH', name: '丙', boardName: '银行', subBoardName: '国有大型银行', exchange: 'SH', value: 100, price: 6, changePct: 1, turnoverAmount: 60 },
        ],
      },
    ],
  }
}

test('Wenyuan treemap parser validates and aggregates public industry values', () => {
  const snapshot = parseWenyuanTreemap(fixture(), new Date(updatedAt))
  assert.equal(snapshot.nodes.length, 2)
  assert.deepEqual(snapshot.nodes.map((node) => ({
    code: node.code,
    name: node.name,
    value: node.value,
    pct: node.pct,
    leaderName: node.leaderName,
    leaderPct: node.leaderPct,
    upCount: node.upCount,
    downCount: node.downCount,
    memberCount: node.memberCount,
  })), [
    { code: 'industry-electronics', name: '电子', value: 300, pct: 2.6666666666666665, leaderName: '甲', leaderPct: 5, upCount: 1, downCount: 1, memberCount: 2 },
    { code: 'industry-banks', name: '银行', value: 100, pct: 1, leaderName: '丙', leaderPct: 1, upCount: 1, downCount: 0, memberCount: 1 },
  ])
})

test('Wenyuan fetch uses only the fixed public treemap URL', async () => {
  const requests: string[] = []
  const snapshot = await fetchWenyuanTreemap({
    now: new Date(updatedAt),
    fetchImpl: async (input) => {
      requests.push(String(input))
      return new Response(JSON.stringify(fixture()), { status: 200 })
    },
  })
  assert.deepEqual(requests, [WENYUAN_TREEMAP_URL])
  assert.equal(snapshot.nodes[0]?.name, '电子')
})

test('Wenyuan parser fails closed for invalid snapshots', () => {
  const cases = [
    { name: 'empty nodes', value: { ...fixture(), nodes: [] } },
    { name: 'duplicate node code', value: { ...fixture(), nodes: [fixture().nodes[0], { ...fixture().nodes[1], code: fixture().nodes[0].code }] } },
    { name: 'stock count mismatch', value: { ...fixture(), nodes: [{ ...fixture().nodes[0], stockCount: 1 }, fixture().nodes[1]] } },
    { name: 'node value mismatch', value: { ...fixture(), nodes: [{ ...fixture().nodes[0], value: 301 }, fixture().nodes[1]] } },
    { name: 'future update', value: { ...fixture(), updatedAt: '2026-08-18T07:18:19.000Z' } },
    { name: 'wrong market', value: { ...fixture(), market: 'sse' } },
  ]

  for (const item of cases) {
    assert.throws(() => parseWenyuanTreemap(item.value, new Date(updatedAt)), WenyuanSchemaError, item.name)
  }
})
