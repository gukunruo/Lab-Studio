import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ThsCoverageError,
  aggregateThsBoardMarketCaps,
  buildTencentSymbols,
  parseThsMembersPage,
  parseTencentQuotes,
  type ThsMember,
} from '../server/finance-ths'

const page = (pageNumber: number, totalPages = 2, rows = ['600000', '000001']) => `
  <table class="m-pager-table"><tbody>
    ${rows.map((code, index) => `<tr><td>${index + 1}</td><td><a href="/stockpage.10jqka.com.cn/${code}/">${code}</a></td><td>${code === '600000' ? '浦发银行' : '平安银行'}</td></tr>`).join('')}
  </tbody></table>
  <input type="hidden" id="baseUrl" value="thshy/detail">
  <input type="hidden" id="requestQuery" value="code/881121">
  <span class="page_info">${pageNumber}/${totalPages}</span>
`

test('parses Ths member page rows and pagination metadata', () => {
  assert.deepEqual(parseThsMembersPage(page(1)), {
    page: 1,
    totalPages: 2,
    members: [
      { code: '600000', name: '浦发银行' },
      { code: '000001', name: '平安银行' },
    ],
    baseUrl: 'thshy/detail',
    requestQuery: 'code/881121',
  })
})

test('builds only explicit Tencent stock symbols', () => {
  assert.deepEqual(buildTencentSymbols(['600000', '000001', '300001', '920225']), [
    'sh600000',
    'sz000001',
    'sz300001',
    'bj920225',
  ])
  assert.throws(() => buildTencentSymbols(['600000', 'ABC']), ThsCoverageError)
})

test('parses Tencent total market cap f45 as yuan with one snapshot date', () => {
  const text = [
    'v_sh600000="浦发银行~600000~10~9~...~20260815150000"',
    'v_sz000001="平安银行~000001~11~10~...~20260815150000"',
  ].join(';')
  assert.deepEqual(parseTencentQuotes(text, (fields) => {
    const values = fields === '600000'
      ? ['浦发银行', '600000', '10', '9', '20260815150000']
      : ['平安银行', '000001', '11', '10', '20260815150000']
    const row = Array.from({ length: 46 }, () => '')
    row[1] = values[0]!
    row[2] = values[1]!
    row[45] = fields === '600000' ? '10' : '30'
    row[30] = '20260815150000'
    return row
  }), [
    { symbol: 'sh600000', marketCap: 1000000000, tradeDate: '2026-08-15' },
    { symbol: 'sz000001', marketCap: 3000000000, tradeDate: '2026-08-15' },
  ])
})

test('aggregates complete member market caps into normalized board weights', () => {
  const members: ThsMember[] = [
    { code: '600000', name: '浦发银行' },
    { code: '000001', name: '平安银行' },
  ]
  const aggregates = aggregateThsBoardMarketCaps({
    boards: [
      { boardCode: '881121', members, marketCaps: [100_000_000, 300_000_000] },
      { boardCode: '881122', members: [{ code: '300001', name: '特锐德' }], marketCaps: [600_000_000] },
    ],
    tradeDate: '2026-08-15',
  })
  assert.deepEqual(aggregates.map(({ boardCode, marketCap, weight, memberCount, coveredMemberCount, marketCapUnit, tradeDate }) => ({
    boardCode, marketCap, weight, memberCount, coveredMemberCount, marketCapUnit, tradeDate,
  })), [
    { boardCode: '881121', marketCap: 400_000_000, weight: 0.4, memberCount: 2, coveredMemberCount: 2, marketCapUnit: '元', tradeDate: '2026-08-15' },
    { boardCode: '881122', marketCap: 600_000_000, weight: 0.6, memberCount: 1, coveredMemberCount: 1, marketCapUnit: '元', tradeDate: '2026-08-15' },
  ])
})

test('rejects incomplete pages, duplicate members, missing quotes, and mixed dates', () => {
  assert.throws(() => parseThsMembersPage(page(1, 2, [])), ThsCoverageError)
  assert.throws(() => aggregateThsBoardMarketCaps({
    boards: [{ boardCode: '881121', members: [{ code: '600000', name: '浦发银行' }, { code: '600000', name: '浦发银行' }], marketCaps: [1, 2] }],
    tradeDate: '2026-08-15',
  }), ThsCoverageError)
  assert.throws(() => aggregateThsBoardMarketCaps({
    boards: [{ boardCode: '881121', members: [{ code: '600000', name: '浦发银行' }], marketCaps: [] }],
    tradeDate: '2026-08-15',
  }), ThsCoverageError)
  assert.throws(() => aggregateThsBoardMarketCaps({
    boards: [{ boardCode: '881121', members: [{ code: '600000', name: '浦发银行' }], marketCaps: [1] }],
    tradeDate: 'not-a-date',
  }), ThsCoverageError)
})
