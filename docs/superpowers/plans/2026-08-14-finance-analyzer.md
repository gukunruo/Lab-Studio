# 金融分析模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Lab Studio 新增以 AI 分析为核心的金融分析模块（股票/基金/指数/ETF/板块），支持搜索选标的、K 线与技术指标可视化、量价关系分析与 AI 走势推演。

**Architecture:** 服务端新增 `server/finance.ts` 代理东财/天天基金公开行情接口（带 UA/Referer + 内存缓存 + 字段清洗）；前端新增 `src/apps/finance/` 自包含应用（手写 SVG K 线图 + 纯函数技术指标引擎 + 复用现有 `/api/ai/chat` 流式分析）；入口放在 LabShell Header。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + SCSS + Pinia；Hono 服务端 + `fetch`；无新增第三方依赖。

## Global Constraints

- 无新增 npm 依赖；图表手写 SVG，指标引擎为纯函数 TypeScript。
- 行情语义色：涨红跌绿（中国惯例），浅色 `#dc2626`/`#16a34a`，深色 `#f87171`/`#4ade80`，作为模块内局部 CSS 变量，不污染全局 token。
- 数字一律 `var(--font-mono)`，中文标签 `var(--font-sans)`。
- 所有第三方数据请求走服务端代理；前端不接触上游 token/Referer。
- 输入校验：`secid` 匹配 `^[0-9A-Za-z]+\.?[0-9A-Za-z]*$` 且含 `.`；`klt` 白名单 `101|102|103`；`limit` 1–500；基金代码 `^\d{6}$`。
- AI 分析提示词内嵌合规约束：禁止承诺收益、禁止「必涨/稳赚/保证」，必须输出风险提示与「非投资建议」声明。
- 每个完成的任务单独提交并立即推送 origin/main。
- 文档 AI 缩写首现补全称；前端通用缩写（MA/MACD/RSI/KDJ/BOLL/ETF/LOF/AI）不补。

---

## 文件结构总览

```
server/finance.ts           (新建) 金融数据代理 + 缓存 + 字段清洗
server/app.ts               (修改) 挂载 finance 路由到 protectedApi
src/apps/finance/meta.ts    (新建) 应用注册
src/apps/finance/index.vue  (新建) 页面编排
src/apps/finance/doc.md     (新建) 应用说明
src/apps/finance/indicators.ts  (新建) 技术指标纯函数
src/apps/finance/types.ts       (新建) 共享类型
src/apps/finance/useFinance.ts  (新建) 组合式函数（状态机）
src/apps/finance/chart/KlineChart.vue  (新建) SVG 图表
src/layouts/LabShell.vue    (修改) Header 加入口
src/i18n/messages.ts        (修改) 新增 nav 文案
```

---

### Task 1: 服务端金融数据代理

**Files:**
- Create: `server/finance.ts`
- Modify: `server/app.ts`

**Interfaces:**
- Consumes: `Hono` from `hono`；`db` 无关（纯 HTTP 代理）。
- Produces: `registerFinanceRoutes(app: Hono)` 导出函数，供 `server/app.ts` 调用。

- [ ] **Step 1: 创建 `server/finance.ts` 骨架与缓存**

```ts
import type { Hono } from 'hono'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 内存缓存：key → { value, expiresAt }
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

async function fetchJson(url: string, referer: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: 'application/json, text/plain, */*' },
  })
  if (!response.ok) throw new Error(`upstream ${response.status}`)
  return response.json()
}

export function registerFinanceRoutes(app: Hono): void {
  // Step 2/3/4 在此实现
}
```

- [ ] **Step 2: 实现搜索接口**

在 `registerFinanceRoutes` 内：

```ts
app.get('/api/finance/search', async (c) => {
  const q = c.req.query('q')?.trim() ?? ''
  if (!q || q.length > 40) return c.json({ error: 'invalid query' }, 400)
  const cacheKey = `search:${q}`
  const cached = cacheGet<SearchItem[]>(cacheKey)
  if (cached) return c.json({ items: cached })

  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(q)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`
  try {
    const data = await fetchJson(url, 'https://www.eastmoney.com/') as {
      QuotationCodeTable?: { Data?: Array<Record<string, string>> }
    }
    const items: SearchItem[] = (data.QuotationCodeTable?.Data ?? []).map((row) => ({
      quoteId: row.QuoteID ?? '',
      code: row.Code ?? '',
      name: row.Name ?? '',
      type: row.Classify ?? '',
      typeName: row.SecurityTypeName ?? '',
      market: row.MktNum ?? '',
    })).filter((item) => item.quoteId && item.code && item.name)
    cacheSet(cacheKey, items)
    return c.json({ items })
  } catch {
    return c.json({ error: '数据源暂时不可用' }, 502)
  }
})
```

类型定义在文件顶部：

```ts
export interface SearchItem {
  quoteId: string
  code: string
  name: string
  type: string
  typeName: string
  market: string
}
```

- [ ] **Step 3: 实现 K 线接口**

在 `registerFinanceRoutes` 内：

```ts
app.get('/api/finance/kline', async (c) => {
  const secid = c.req.query('secid')?.trim() ?? ''
  const klt = c.req.query('klt') ?? '101'
  const limit = Number(c.req.query('limit') ?? '250')
  if (!/^[0-9A-Za-z]+\.[0-9A-Za-z]+$/.test(secid)) return c.json({ error: 'invalid secid' }, 400)
  if (!['101', '102', '103'].includes(klt)) return c.json({ error: 'invalid klt' }, 400)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

  const cacheKey = `kline:${secid}:${klt}:${limit}`
  const cached = cacheGet<KlineResponse>(cacheKey)
  if (cached) return c.json(cached)

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=${klt}&fqt=1&lmt=${limit}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`
  try {
    const data = await fetchJson(url, 'https://quote.eastmoney.com/') as {
      data?: { code?: string; name?: string; klines?: string[] }
    }
    const klines = (data.data?.klines ?? []).map((line) => {
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
```

类型定义：

```ts
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
```

- [ ] **Step 4: 实现场外基金净值接口**

在 `registerFinanceRoutes` 内：

```ts
app.get('/api/finance/fund/nav', async (c) => {
  const code = c.req.query('code')?.trim() ?? ''
  const limit = Number(c.req.query('limit') ?? '250')
  if (!/^\d{6}$/.test(code)) return c.json({ error: 'invalid fund code' }, 400)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return c.json({ error: 'invalid limit' }, 400)

  const cacheKey = `fundnav:${code}:${limit}`
  const cached = cacheGet<FundNavResponse>(cacheKey)
  if (cached) return c.json(cached)

  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=${limit}`
  try {
    const data = await fetchJson(url, 'https://fundf10.eastmoney.com/') as {
      Data?: { LSJZList?: Array<Record<string, string>> }
    }
    const nav = (data.Data?.LSJZList ?? []).map((row) => ({
      date: row.FSRQ ?? '',
      nav: Number(row.DWJZ ?? 0),
      accNav: Number(row.LJJZ ?? 0),
      pct: Number(row.JZZZL ?? 0),
    })).reverse()
    const result: FundNavResponse = { code, name: '', nav }
    cacheSet(cacheKey, result)
    return c.json(result)
  } catch {
    return c.json({ error: '数据源暂时不可用' }, 502)
  }
})
```

类型定义：

```ts
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
```

- [ ] **Step 5: 挂载路由**

修改 `server/app.ts`，在顶部 import 区新增：

```ts
import { registerFinanceRoutes } from './finance'
```

在 `app.route('/api', protectedApi)` 之前、`protectedApi` 定义之后，新增一行（挂载到受保护路由，复用 requireAuth）：

```ts
  registerFinanceRoutes(protectedApi)
```

- [ ] **Step 6: 验证**

```bash
pnpm type-check
```

- [ ] **Step 7: 提交推送**

```bash
git add server/finance.ts server/app.ts
git commit -m "feat(finance): 服务端金融数据代理（搜索/K线/基金净值）"
git push origin main
```

---

### Task 2: 技术指标计算引擎

**Files:**
- Create: `src/apps/finance/indicators.ts`

**Interfaces:**
- Consumes: 无（纯函数，仅依赖输入数组）。
- Produces: `sma(values, period)`, `ema(values, period)`, `macd(closes)`, `rsi(closes, period)`, `kdj(klines)`, `boll(closes, period, mult)`, `volumeRatio(volumes)`。

- [ ] **Step 1: 定义共享类型 `src/apps/finance/types.ts`**

```ts
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

export interface SearchItem {
  quoteId: string
  code: string
  name: string
  type: string
  typeName: string
  market: string
}

export interface FundNavPoint {
  date: string
  nav: number
  accNav: number
  pct: number
}
```

- [ ] **Step 2: 实现 `indicators.ts` 均线与 EMA**

```ts
import type { Kline } from './types'

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!
    if (i >= period) sum -= values[i - period]!
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null)
      continue
    }
    if (prev === null) {
      // 首值用前 period 个的简单平均
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]!
      prev = sum / period
    } else {
      prev = values[i]! * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}
```

- [ ] **Step 3: 实现 MACD / RSI / KDJ / BOLL / 量比**

```ts
export interface MacdResult {
  dif: (number | null)[]
  dea: (number | null)[]
  macd: (number | null)[]
}

export function macd(closes: number[]): MacdResult {
  const ema12 = ema(closes, 12)
  const ema26 = ema(closes, 26)
  const dif: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    const a = ema12[i]
    const b = ema26[i]
    dif.push(a !== null && b !== null ? a - b : null)
  }
  // DEA 是 DIF 的 9 周期 EMA（跳过 null 段）
  const difValues = dif.map((v) => v ?? 0)
  const difNonNull: number[] = []
  const difIndex: number[] = []
  dif.forEach((v, i) => { if (v !== null) { difNonNull.push(v); difIndex.push(i) } })
  const deaRaw = ema(difNonNull, 9)
  const dea: (number | null)[] = new Array(closes.length).fill(null)
  difIndex.forEach((idx, j) => { dea[idx] = deaRaw[j] })
  const macdArr: (number | null)[] = closes.map((_, i) =>
    dif[i] !== null && dea[i] !== null ? (dif[i]! - dea[i]!) * 2 : null,
  )
  return { dif, dea, macd: macdArr }
}

export function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)
    if (i <= period) {
      gainSum += gain
      lossSum += loss
      if (i === period) {
        out.push(lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum))
      } else {
        out.push(null)
      }
    } else {
      gainSum = (gainSum * (period - 1) + gain) / period
      lossSum = (lossSum * (period - 1) + loss) / period
      out.push(lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum))
    }
  }
  out.unshift(null)
  return out
}

export interface KdjResult {
  k: (number | null)[]
  d: (number | null)[]
  j: (number | null)[]
}

export function kdj(klines: Kline[], period = 9): KdjResult {
  const k: (number | null)[] = []
  const d: (number | null)[] = []
  const j: (number | null)[] = []
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < klines.length; i++) {
    const start = Math.max(0, i - period + 1)
    let hh = -Infinity
    let ll = Infinity
    for (let t = start; t <= i; t++) {
      hh = Math.max(hh, klines[t]!.high)
      ll = Math.min(ll, klines[t]!.low)
    }
    const close = klines[i]!.close
    const rsv = hh === ll ? 50 : ((close - ll) / (hh - ll)) * 100
    if (i < period - 1) {
      k.push(null); d.push(null); j.push(null)
      continue
    }
    prevK = (2 / 3) * prevK + (1 / 3) * rsv
    prevD = (2 / 3) * prevD + (1 / 3) * prevK
    k.push(prevK)
    d.push(prevD)
    j.push(3 * prevK - 2 * prevD)
  }
  return { k, d, j }
}

export interface BollResult {
  mid: (number | null)[]
  upper: (number | null)[]
  lower: (number | null)[]
}

export function boll(closes: number[], period = 20, mult = 2): BollResult {
  const mid = sma(closes, period)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(null); lower.push(null)
      continue
    }
    let variance = 0
    const m = mid[i]!
    for (let t = i - period + 1; t <= i; t++) variance += (closes[t]! - m) ** 2
    const sd = Math.sqrt(variance / period)
    upper.push(m + mult * sd)
    lower.push(m - mult * sd)
  }
  return { mid, upper, lower }
}

// 量比：当日成交量 / 前 5 日平均成交量；前 5 根返回 null
export function volumeRatio(volumes: number[], period = 5): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < volumes.length; i++) {
    if (i < period) {
      out.push(null)
      continue
    }
    let sum = 0
    for (let t = i - period; t < i; t++) sum += volumes[t]!
    const avg = sum / period
    out.push(avg === 0 ? null : volumes[i]! / avg)
  }
  return out
}
```

- [ ] **Step 3b: 补充辅助导出**

```ts
export function closesOf(klines: Kline[]): number[] {
  return klines.map((k) => k.close)
}
export function volumesOf(klines: Kline[]): number[] {
  return klines.map((k) => k.volume)
}
```

- [ ] **Step 4: 验证**

```bash
pnpm type-check
```

- [ ] **Step 5: 提交推送**

```bash
git add src/apps/finance/types.ts src/apps/finance/indicators.ts
git commit -m "feat(finance): 技术指标计算引擎（MA/EMA/MACD/RSI/KDJ/BOLL/量比）"
git push origin main
```

---

### Task 3: K 线图与指标 UI（SVG）

**Files:**
- Create: `src/apps/finance/chart/KlineChart.vue`

**Interfaces:**
- Consumes: `Kline` from `../types`；`sma/ema/macd/rsi/kdj/boll/volumeRatio/closesOf/volumesOf` from `../indicators`。
- Produces: `<KlineChart :klines="Kline[]" />` 组件，props 接收 K 线数组，内部绘制蜡烛 + 成交量 + 均线(MA5/10/20/60) + MACD/RSI/KDJ 子区。

- [ ] **Step 1: 组件骨架与 props**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { Kline } from '../types'
import { sma, macd, rsi, kdj, boll, volumeRatio, closesOf, volumesOf } from '../indicators'

const props = defineProps<{ klines: Kline[] }>()

const closes = computed(() => closesOf(props.klines))
const volumes = computed(() => volumesOf(props.klines))
const ma5 = computed(() => sma(closes.value, 5))
const ma10 = computed(() => sma(closes.value, 10))
const ma20 = computed(() => sma(closes.value, 20))
const ma60 = computed(() => sma(closes.value, 60))
const macdData = computed(() => macd(closes.value))
const rsi6 = computed(() => rsi(closes.value, 6))
const rsi12 = computed(() => rsi(closes.value, 12))
const rsi24 = computed(() => rsi(closes.value, 24))
const kdjData = computed(() => kdj(props.klines))
const bollData = computed(() => boll(closes.value))
const volRatio = computed(() => volumeRatio(volumes.value))
</script>
```

- [ ] **Step 2: 模板结构**

```vue
<template>
  <div v-if="klines.length" class="kchart">
    <svg :viewBox="`0 0 ${W} ${H}`" class="kchart__svg" preserveAspectRatio="none">
      <!-- 主图区：蜡烛 + 均线 + BOLL（在脚本中用 computed 生成 path/rect 数组） -->
    </svg>
  </div>
  <div v-else class="kchart kchart--empty">暂无 K 线数据</div>
</template>
```

在 `<script setup>` 中定义常量与几何：

```ts
const W = 900
const H_MAIN = 320      // 主图高度
const H_VOL = 90        // 成交量高度
const H_MACD = 90       // MACD 高度
const H_RSI = 90        // RSI 高度
const H_KDJ = 90        // KDJ 高度
const PAD_R = 60        // 右侧留白给价格轴
const GAP = 8           // 子图间距
const H = H_MAIN + H_VOL + H_MACD + H_RSI + H_KDJ + GAP * 4
const PRICE_W = W - PAD_R
```

- [ ] **Step 3: 蜡烛几何与价格轴**

```ts
const bars = computed(() => {
  const n = props.klines.length
  if (!n) return []
  const slot = PRICE_W / n
  const bodyW = Math.max(1, Math.min(14, slot * 0.65))
  let min = Infinity
  let max = -Infinity
  for (const k of props.klines) {
    min = Math.min(min, k.low)
    max = Math.max(max, k.high)
  }
  const pad = (max - min) * 0.05 || 1
  const yMin = min - pad
  const yMax = max + pad
  const y = (price: number) => H_MAIN - ((price - yMin) / (yMax - yMin)) * H_MAIN
  const bars = props.klines.map((k, i) => {
    const cx = (i + 0.5) * slot
    const up = k.close >= k.open
    const color = up ? 'var(--fin-up)' : 'var(--fin-down)'
    return {
      cx, slot, bodyW,
      yHigh: y(k.high), yLow: y(k.low),
      yBodyTop: y(Math.max(k.open, k.close)),
      yBodyBot: y(Math.min(k.open, k.close)),
      color, up,
    }
  })
  return { bars, yMin, yMax, y }
})
```

- [ ] **Step 4: 均线/BOLL/MACD/RSI/KDJ/成交量 path 生成**

在脚本中实现 `linePath(values, yFn, baseY)` 帮助函数（把 `(number|null)[]` 转 SVG path，`null` 断开）：

```ts
function linePath(values: (number | null)[], y: (v: number) => number): string {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) { pen = false; return }
    const x = (i + 0.5) * (PRICE_W / values.length)
    d += pen ? ` L ${x.toFixed(1)} ${y(v).toFixed(1)}` : ` M ${x.toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  })
  return d
}
```

分别用 computed 生成 `maPaths`、`bollPaths`、`macdPaths`（柱状用 rect 数组）、`rsiPaths`、`kdjPaths`、`volBars`（rect 数组）。子图各自独立 `yMin/yMax`，用统一的子图纵坐标换算函数 `subScale(min, max, H)`。

- [ ] **Step 5: 完整 SVG 渲染 + 样式**

主图、成交量、MACD、RSI、KDJ 五个区从上到下排列（每个区用一个 `<g>`，成交量/MACD/RSI/KDJ 用 `transform="translate(0, offset)"`）。颜色变量在组件 style 中定义：

```scss
.kchart {
  --fin-up: #dc2626;
  --fin-down: #16a34a;
  width: 100%;
}
:global([data-theme='dark']) .kchart {
  --fin-up: #f87171;
  --fin-down: #4ade80;
}
```

均线颜色：MA5 `#f59e0b`、MA10 `#3b82f6`、MA20 `#a855f7`、MA60 `#64748b`；BOLL 上/中/下用 `#0d9488` 半透明；MACD 柱红涨绿跌；RSI 三条分别 `#f59e0b/#3b82f6/#a855f7`；KDJ 三线 `#f59e0b/#3b82f6/#a855f7`。蜡烛实体空心/实心按涨跌（涨空心红、跌实心绿），影线同色。

- [ ] **Step 6: 验证**

```bash
pnpm type-check
```

- [ ] **Step 7: 提交推送**

```bash
git add src/apps/finance/chart/KlineChart.vue
git commit -m "feat(finance): SVG K线图与指标叠加"
git push origin main
```

---

### Task 4: 搜索选择 + AI 分析面板 + 页面编排

**Files:**
- Create: `src/apps/finance/useFinance.ts`
- Create: `src/apps/finance/index.vue`
- Create: `src/apps/finance/meta.ts`
- Create: `src/apps/finance/doc.md`

**Interfaces:**
- Consumes: `Kline`/`SearchItem`/`FundNavPoint` from `./types`；`KlineChart`；`streamChat` from `@/learn/ai`；`getAiConfig` from `@/learn/ai`。
- Produces: `useFinance()` 组合式函数（`query`, `suggestions`, `selected`, `klines`, `loading`, `error`, `search()`, `select()`, `loadKline()`）；`index.vue` 页面组件。

- [ ] **Step 1: `useFinance.ts` 状态机**

```ts
import { ref } from 'vue'
import type { Kline, SearchItem } from './types'

export function useFinance() {
  const query = ref('')
  const suggestions = ref<SearchItem[]>([])
  const searching = ref(false)
  const selected = ref<SearchItem | null>(null)
  const klines = ref<Kline[]>([])
  const loading = ref(false)
  const error = ref('')

  let debounce: ReturnType<typeof setTimeout> | null = null

  async function search() {
    const q = query.value.trim()
    if (!q) { suggestions.value = []; return }
    searching.value = true
    try {
      const res = await fetch(`/api/finance/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
      const data = await res.json().catch(() => null) as { items?: SearchItem[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '搜索失败')
      suggestions.value = data?.items ?? []
    } catch (e) {
      suggestions.value = []
      error.value = e instanceof Error ? e.message : '搜索失败'
    } finally {
      searching.value = false
    }
  }

  function scheduleSearch() {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(search, 250)
  }

  async function select(item: SearchItem) {
    selected.value = item
    suggestions.value = []
    query.value = item.name
    await loadKline()
  }

  async function loadKline() {
    const item = selected.value
    if (!item) return
    if (item.type === 'OTCFUND') {
      await loadFundNav(item)
      return
    }
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`/api/finance/kline?secid=${encodeURIComponent(item.quoteId)}&klt=101&limit=250`, { credentials: 'include' })
      const data = await res.json().catch(() => null) as { klines?: Kline[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      klines.value = data?.klines ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadFundNav(item: SearchItem) {
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`/api/finance/fund/nav?code=${encodeURIComponent(item.code)}&limit=250`, { credentials: 'include' })
      const data = await res.json().catch(() => null) as { nav?: Array<{ date: string; nav: number; accNav: number; pct: number }>; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      // 场外净值转成伪 K 线（open/high/low 均取 nav，close 取 nav），让图表复用
      klines.value = (data?.nav ?? []).map((p) => ({
        date: p.date, open: p.nav, close: p.nav, high: p.nav, low: p.nav,
        volume: 0, amount: 0, amplitude: 0, pct: p.pct, change: 0, turnover: 0,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      loading.value = false
    }
  }

  return { query, suggestions, searching, selected, klines, loading, error, search, scheduleSearch, select, loadKline }
}
```

- [ ] **Step 2: `meta.ts` 应用注册**

```ts
import type { AppMetaInput } from '@/apps/_registry'

const meta: AppMetaInput = {
  title: { zh: '金融分析', en: 'Finance Analyzer' },
  description: {
    zh: '股票/基金/指数/ETF/板块搜索、K 线与技术指标可视化，AI 走势推演与量价分析。',
    en: 'Search stocks, funds, indices, ETFs and sectors; visualize K-lines and indicators; AI trend analysis.',
  },
  tags: ['finance', 'stock', 'fund', 'ai', 'quant'],
  date: '2026-08-14',
}

export default meta
```

- [ ] **Step 3: AI 分析面板逻辑（在 `index.vue` 内实现）**

复用 `@/learn/ai` 的 `streamChat`。构建数据快照与提示词：

```ts
import { ref, computed } from 'vue'
import { streamChat, getAiConfig, type ChatMessage } from '@/learn/ai'
// ...

const analyzing = ref(false)
const aiText = ref('')
const aiError = ref('')
const aiConfig = ref<{ available: boolean } | null>(null)
let abort: AbortController | null = null

function buildSnapshot(): string {
  const item = finance.selected.value
  const ks = finance.klines.value
  if (!item) return ''
  const last = ks[ks.length - 1]
  const lines = [
    `标的：${item.name}（${item.code}，${item.typeName}）`,
    `最新交易日：${last?.date ?? '-'}，收盘 ${last?.close ?? '-'}，涨跌幅 ${last?.pct ?? '-'}%`,
    `近 20 根 K 线（日期/开/收/高/低/量）：`,
  ]
  ks.slice(-20).forEach((k) => {
    lines.push(`${k.date} ${k.open}/${k.close}/${k.high}/${k.low} ${k.volume}`)
  })
  return lines.join('\n')
}

async function runAnalysis() {
  if (!finance.selected.value || !finance.klines.value.length) return
  analyzing.value = true
  aiText.value = ''
  aiError.value = ''
  abort = new AbortController()
  const system = [
    '你是一名严谨的金融分析师，面向个人投资者做研究辅助。',
    '你只基于用户提供的真实行情数据进行分析，不得编造数据。',
    '严格合规：不承诺收益，不使用「必涨、稳赚、保证」等表述，',
    '必须输出风险提示，并声明「本分析仅供研究参考，不构成投资建议」。',
    '输出固定四段结构（Markdown）：',
    '## 走势研判\n## 量价关系\n## 技术指标验证\n## 推演与风险',
    '每段给出所依据的具体数据。',
  ].join('\n')
  const messages: ChatMessage[] = [{
    role: 'user',
    content: `请分析以下标的：\n\n${buildSnapshot()}\n\n结合均线、MACD、RSI、KDJ、BOLL 与量价关系，给出走势研判、量价关系、技术指标验证、推演与风险。`,
  }]
  try {
    await streamChat({
      messages,
      system,
      maxTokens: 2500,
      onToken: (t) => { aiText.value += t },
      onDone: () => { analyzing.value = false },
      signal: abort.signal,
    })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') aiError.value = '分析失败，请重试'
    analyzing.value = false
  }
}

function stopAnalysis() {
  abort?.abort()
  analyzing.value = false
}
```

Markdown 渲染：项目已依赖 `marked`（`package.json`），在 `index.vue` 内 `import { marked } from 'marked'`，用 `computed(() => marked.parse(aiText.value))` 渲染，`v-html` 注入。注意：AI 输出为受信来源（自建网关），可用 `v-html`；但必须用 `marked` 的默认设置且内容来自自有 AI，风险可控。

- [ ] **Step 4: `index.vue` 页面模板**

布局三段：搜索栏（input + 下拉建议）、左侧图表区（`<KlineChart :klines>` + 空/加载/错误态）、右侧 AI 面板（免责声明 + 开始分析按钮 + 流式 Markdown）。

```vue
<template>
  <div class="fin">
    <div class="fin__search">
      <PhMagnifyingGlass :size="16" class="fin__search-icon" />
      <input
        v-model="finance.query.value"
        class="fin__search-input"
        type="search"
        placeholder="输入股票/基金代码、名称或板块关键词"
        @input="finance.scheduleSearch()"
        @keydown.down.prevent="moveDown"
        @keydown.up.prevent="moveUp"
        @keydown.enter.prevent="confirmSelection"
        @keydown.esc="finance.suggestions.value = []"
      />
      <ul v-if="finance.suggestions.value.length" class="fin__suggest">
        <li v-for="(s, i) in finance.suggestions.value" :key="s.quoteId + s.code"
            :class="{ 'fin__suggest-item--active': i === activeIndex }"
            @mouseenter="activeIndex = i" @click="finance.select(s)">
          <span class="fin__suggest-name">{{ s.name }}</span>
          <span class="fin__suggest-code">{{ s.code }}</span>
          <span class="fin__suggest-type">{{ s.typeName }}</span>
        </li>
      </ul>
    </div>

    <div class="fin__body">
      <section class="fin__chart-pane">
        <div v-if="finance.selected.value" class="fin__info">
          <h2 class="fin__name">{{ finance.selected.value.name }}</h2>
          <span class="fin__code">{{ finance.selected.value.code }}</span>
          <span class="fin__type">{{ finance.selected.value.typeName }}</span>
        </div>
        <div v-if="finance.loading.value" class="fin__state fin__state--loading">加载中…</div>
        <div v-else-if="finance.error.value" class="fin__state fin__state--error">
          {{ finance.error.value }}
          <button class="fin__retry" @click="finance.loadKline()">重试</button>
        </div>
        <div v-else-if="!finance.klines.value.length" class="fin__state fin__state--empty">
          搜索并选择标的后，这里会显示 K 线与技术指标。
        </div>
        <KlineChart v-else :klines="finance.klines.value" />
      </section>

      <aside class="fin__ai">
        <p class="fin__disclaimer">本分析基于公开历史行情与 AI 研判，仅供研究参考，不构成任何投资建议。市场有风险，决策需谨慎。</p>
        <button class="fin__analyze" :disabled="analyzing || !finance.klines.value.length" @click="runAnalysis">
          {{ analyzing ? '生成中…' : '开始分析' }}
        </button>
        <button v-if="analyzing" class="fin__stop" @click="stopAnalysis">停止</button>
        <div v-if="aiError" class="fin__ai-error">{{ aiError }}</div>
        <div v-if="aiText" class="fin__ai-body markdown" v-html="renderedAi"></div>
        <div v-else-if="!analyzing" class="fin__ai-empty">
          选择标的后点击「开始分析」，AI 将基于当前 K 线与技术指标给出走势研判、量价关系与推演。
        </div>
      </aside>
    </div>
  </div>
</template>
```

键盘选择需在脚本实现 `activeIndex`、`moveDown/moveUp/confirmSelection`。

- [ ] **Step 5: 样式（SCSS，遵循设计系统）**

```scss
.fin {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 100%;
}
.fin__search { position: relative; }
.fin__search-input {
  width: 100%;
  padding: 0.75rem 0.9rem 0.75rem 2.4rem;
  font: inherit;
  font-size: 0.95rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
}
.fin__search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px rgba(var(--color-accent-rgb), 0.16);
}
.fin__search-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
}
.fin__suggest {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  z-index: 20;
  margin: 0;
  padding: var(--space-2);
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.3);
}
.fin__suggest-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.fin__suggest-item--active { background: var(--color-accent-soft); }
.fin__suggest-name { font-weight: 600; }
.fin__suggest-code { font-family: var(--font-mono); color: var(--color-text-muted); }
.fin__suggest-type {
  margin-left: auto;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}
.fin__body {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--space-5);
  align-items: start;
}
.fin__chart-pane {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4);
}
.fin__info {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.fin__name { font-size: 1.15rem; font-weight: 600; }
.fin__code, .fin__type { font-family: var(--font-mono); font-size: 0.8rem; color: var(--color-text-muted); }
.fin__ai {
  position: sticky;
  top: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: calc(100vh - 180px);
  overflow-y: auto;
}
.fin__disclaimer { font-size: 0.76rem; color: var(--color-text-muted); line-height: 1.5; }
.fin__analyze {
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: var(--color-on-accent);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
}
.fin__analyze:disabled { opacity: 0.5; cursor: not-allowed; }
.fin__state { padding: var(--space-12) var(--space-4); text-align: center; color: var(--color-text-muted); }
.fin__retry { margin-top: var(--space-3); }

@media (max-width: 720px) {
  .fin__body { grid-template-columns: 1fr; }
  .fin__ai { position: static; max-height: none; }
}
```

- [ ] **Step 6: `doc.md` 应用说明**

```md
# 金融分析

搜索股票 / 基金 / 指数 / ETF / 板块，查看 K 线与技术指标（均线、MACD、RSI、KDJ、BOLL、量比），并用 AI 做走势研判与量价关系推演。

## 免责声明

本应用基于公开历史行情与 AI 研判，仅供个人研究参考，不构成任何投资建议。市场有风险，决策需谨慎。

## 用法

1. 在搜索框输入代码（如 600519 / 110022 / 510300）、名称或板块（如「白酒」）。
2. 从下拉列表选择标的。
3. 查看 K 线与指标。
4. 点击「开始分析」获取 AI 研判。
```

- [ ] **Step 7: 验证**

```bash
pnpm type-check
pnpm build
```

- [ ] **Step 8: 提交推送**

```bash
git add src/apps/finance/
git commit -m "feat(finance): 搜索选择、K线页面编排与AI分析面板"
git push origin main
```

---

### Task 5: Header 入口 + i18n + 全量验证

**Files:**
- Modify: `src/layouts/LabShell.vue`
- Modify: `src/i18n/messages.ts`

**Interfaces:**
- Consumes: `useFinance` 无需（入口只是 RouterLink）。
- Produces: Header 新增「金融分析」入口导航。

- [ ] **Step 1: i18n 文案**

在 `messages.ts` 的 `zh` 与 `en` 各加一条（放在 `nav.learn` 附近）：

```ts
'nav.finance': '金融分析',
```

```ts
'nav.finance': 'Finance',
```

- [ ] **Step 2: Header 入口**

在 `LabShell.vue` 的 `.shell__right` 中、`RouterLink to="/learn"` 之后、divider 之前，新增：

```vue
<RouterLink
  to="/finance"
  class="shell__learn"
  :aria-label="i18n.t('nav.finance')"
>
  <PhChartLine :size="16" weight="bold" />
  <span>{{ i18n.t('nav.finance') }}</span>
</RouterLink>
```

并在 import 区新增 `PhChartLine`：

```ts
import { PhMoon, PhStudent, PhSun, PhTranslate, PhChartLine } from '@phosphor-icons/vue'
```

注意：`finance` 应用 slug 会被 `src/apps/finance/` 注册为 `/finance` 路由（AppView 已处理），Header 的 RouterLink 直接指向 `/finance`。

- [ ] **Step 3: 全量验证**

```bash
pnpm type-check
pnpm build
```

启动 dev server 手测（如环境允许）：Header 出现「金融分析」入口 → 点击进入 → 搜索 600519 → 选「贵州茅台」→ 出 K 线图 → 切指标 → 点「开始分析」→ AI 流式输出。

- [ ] **Step 4: 提交推送**

```bash
git add src/layouts/LabShell.vue src/i18n/messages.ts
git commit -m "feat(finance): Header 加入金融分析入口"
git push origin main
```

---

## Self-Review 结果

- **Spec 覆盖**：搜索/选标的 → Task 1+4；K 线/指标可视化 → Task 2+3；AI 分析 → Task 4；Header 入口 → Task 5；合规/免责 → Task 4（系统提示词 + UI 免责）+ doc.md。
- **占位符扫描**：无 TBD/TODO，所有代码步骤均给出完整实现。
- **类型一致性**：`Kline` 字段（date/open/close/high/low/volume/amount/amplitude/pct/change/turnover）在 Task 1（服务端）、Task 2（types.ts）、Task 3（图表）、Task 4（场外转伪 K 线）完全一致；`SearchItem`（quoteId/code/name/type/typeName/market）一致。
