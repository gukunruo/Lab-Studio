# 金融终端工作区升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Vue 金融页升级为 C 方案交易终端：支持真实历史增量加载、多种行情周期、可折叠/可拖拽三栏布局、右侧 AI/板块工作区和服务端偏好恢复。

**Architecture:** 服务端先统一 K 线窗口、分钟数据和偏好 API 契约，前端 `useFinance` 负责请求序列、历史合并和偏好同步，`KlineChart` 只负责图表模式、边界和指标渲染。`index.vue` 负责工作区布局、抽屉和 splitter，AI 继续复用受保护的 `/api/ai/config` 与 `/api/ai/chat`，但把状态和错误显式呈现在右侧面板。

**Tech Stack:** Vue 3 Composition API、TypeScript、SCSS、KLineCharts 10.0.2、Hono、Drizzle ORM、SQLite、Node test runner、Playwright。

## Global Constraints

- 桌面端使用 header 搜索、左侧自选、中间行情、右侧可切换工作区；默认右侧 AI，板块按需打开。
- K 线只展示真实数据；向左接近最早数据时增量请求，按时间键去重升序合并，不插入未来数据，不允许拖入未来空白。
- MA 第一阶段支持当前图表周期下的 `5、10、20、30、60、120、250` 窗口，不把周/月序列直接叠加到日 K。
- 常用模式为 `分时、五日、日K、周K、月K`；分钟 K 支持 `1、5、15、30、60` 分钟并通过下拉选择。
- 左侧展开宽度为 200–360px，收起宽度约 52px；右侧工作区宽度为 280–480px；中央区域至少保留 520px，移动端改用覆盖抽屉。
- 所有金融和 AI API 继续由现有 session 保护，服务端从固定管理员上下文取得 `userKey`，不接受客户端 userKey、API key、base URL、cookie 或 token。
- 不运行、读取、复制、提交或删除 `fin-shot.cjs`、`fin-screenshot.mjs`；浏览器认证只从 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 环境变量读取。
- 不使用 `git add .` 或 `git add -A`；每个任务只暂存目标文件，独立提交并推送 `origin/main`；已有用户未提交文件不得混入提交。
- 每个任务完成后至少运行对应的 `npm run type-check` 或 `npm run build`，服务端协议任务增加 Node test/curl 验证。

---

## 文件边界与职责

- `server/finance.ts`：金融数据源适配、K 线窗口分页、分钟/五日请求和响应协议。
- `server/db/schema.ts`、`server/db/migrations/0006_finance_preferences.sql`：金融偏好表和迁移。
- `src/apps/finance/types.ts`：客户端金融数据、图表模式和偏好类型。
- `src/apps/finance/useFinance.ts`：标的请求、周期切换、历史分页合并、偏好 GET/PUT。
- `src/apps/finance/chart/KlineChart.vue`：K 线/分时/五日/分钟 K 图表模式，指标菜单和滚动边界。
- `src/apps/finance/index.vue`：C 方案工作区、折叠侧栏、右侧面板、移动抽屉和 splitter。
- `src/apps/finance/components/BoardTable.vue`：右侧板块面板的现有内容，保持排行、排序和选中协议。
- `src/learn/ai.ts`、`server/app.ts`：AI 配置显示、流式错误信息和上游请求链路。
- `tests/finance-kline.test.ts`、`tests/finance-preferences.test.ts`：不依赖硬编码凭证的协议和纯函数测试。
- `scripts/finance-browser-check.mjs`：仅从环境变量读取凭证的真实浏览器验收脚本，不保存认证值。

---

### Task 1: 建立 K 线历史分页 API

**Files:**
- Modify: `server/finance.ts:52-72, 282-391, 453-516, 765-852`
- Create: `tests/finance-kline.test.ts`

**Interfaces:**
- Consumes: 现有 `Kline`、腾讯/新浪/同花顺数据源和 `/finance/kline` 查询参数。
- Produces: `KlineResponse` 增加 `hasMore: boolean`、`oldest: string | null`、`latest: string | null`；请求接受 `before` 日期参数和 `klt=101|102|103`，响应 `klines` 始终按时间升序排列。

- [ ] **Step 1: 写分页和未来过滤的失败测试**

在 `tests/finance-kline.test.ts` 使用 Node test runner，先测试以下纯函数契约；函数从 `server/finance.ts` 导出：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterKlinesBefore, mergeKlines, parseBeforeDate } from '../server/finance'

const bar = (date: string, close: number) => ({
  date, open: close, close, high: close, low: close,
  volume: 0, amount: 0, amplitude: 0, pct: 0, change: 0, turnover: 0,
})

test('parseBeforeDate accepts date and rejects future or malformed values', () => {
  assert.equal(parseBeforeDate('2026-08-01'), '2026-08-01')
  assert.equal(parseBeforeDate('2026-08-01T00:00:00.000Z'), '2026-08-01')
  assert.equal(parseBeforeDate('not-a-date'), null)
})

test('filterKlinesBefore removes bars at and after cursor and future bars', () => {
  const result = filterKlinesBefore([bar('2026-08-01', 3), bar('2026-08-02', 4)], '2026-08-02', '2026-08-01')
  assert.deepEqual(result.map((item) => item.date), [])
})

test('mergeKlines deduplicates by date and sorts ascending', () => {
  const result = mergeKlines([bar('2026-08-02', 2), bar('2026-08-03', 3)], [bar('2026-08-01', 1), bar('2026-08-02', 9)])
  assert.deepEqual(result.map((item) => [item.date, item.close]), [['2026-08-01', 1], ['2026-08-02', 9], ['2026-08-03', 3]])
})
```

- [ ] **Step 2: 运行测试确认当前实现失败**

运行：

```bash
node --import tsx --test tests/finance-kline.test.ts
```

预期：因 `parseBeforeDate`、`filterKlinesBefore`、`mergeKlines` 尚未导出而失败。

- [ ] **Step 3: 实现时间键、分页和响应元数据**

在 `server/finance.ts` 增加并导出：

```ts
export function parseBeforeDate(value: string | undefined): string | null
export function filterKlinesBefore(klines: Kline[], before: string | null, today: string): Kline[]
export function mergeKlines(existing: Kline[], incoming: Kline[]): Kline[]
```

实现要求：

- 只接受 `YYYY-MM-DD` 或可解析 ISO 日期，统一返回 `YYYY-MM-DD`；非法值在路由中返回 `400 invalid before`。
- `filterKlinesBefore` 丢弃日期大于等于 `before` 的记录，也丢弃日期大于 `today` 的记录；`today` 来自服务端当前日期，不用浏览器日期造数据。
- `mergeKlines` 以 `date` 为唯一键，incoming 覆盖 existing 同日期记录，最终按 `date` 升序排列。
- 数据源函数改为接受 `before: string | null`，在源支持历史窗口时请求 `before` 之前的数据；源只能返回最新窗口时，返回可用窗口并将 `hasMore` 设为 `false`，不能伪造历史。
- 路由响应固定为 `{ code, name, secid, klt, klines, hasMore, oldest, latest }`。首次请求无 `before`，增量请求只返回 cursor 之前的记录。
- 缓存键必须包含 `secid/symbol/klt/limit/before`，避免增量窗口错误复用最新窗口。
- `limit` 仍限制在 1–500；`klt` 仍只允许 `101/102/103`，分钟周期在 Task 3 单独扩展。

- [ ] **Step 4: 运行单元测试和类型检查**

运行：

```bash
node --import tsx --test tests/finance-kline.test.ts
npm run type-check
```

预期：测试全部通过，TypeScript 无错误。

- [ ] **Step 5: 用本地受保护接口做响应冒烟检查**

在已有安全登录会话下请求一次：

```bash
curl -sS -b "$FINANCE_COOKIE" "http://localhost:5180/api/finance/kline?secid=1.000001&name=%E4%B8%8A%E8%AF%81%E6%8C%87%E6%95%B0&klt=101&limit=50"
```

检查 JSON 包含 `hasMore`、`oldest`、`latest`，且 `klines` 日期升序、没有大于服务端当前日期的记录。`FINANCE_COOKIE` 只能由用户安全环境提供，不写入脚本。

- [ ] **Step 6: 精确提交并推送**

```bash
git add server/finance.ts tests/finance-kline.test.ts
git diff --cached --check
git commit -m "feat(finance): add historical kline pagination"
git push origin main
```

---

### Task 2: 接入前端历史合并与滚动保持

**Files:**
- Modify: `src/apps/finance/types.ts`
- Modify: `src/apps/finance/useFinance.ts:79-90, 302-371`
- Modify: `src/apps/finance/chart/KlineChart.vue:6-18, 199-270, 336-359`
- Test: `tests/finance-kline.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `hasMore/oldest/latest` 分页响应和 `mergeKlines` 语义。
- Produces: `KlineChart` 事件 `load-more-history`；`useFinance.loadMoreHistory()`；请求锁、序列号、历史边界和视口补偿。

- [ ] **Step 1: 增加前端模式和分页类型**

在 `src/apps/finance/types.ts` 增加：

```ts
export type CandlePeriod = 'day' | 'week' | 'month'
export interface KlinePage {
  klines: Kline[]
  hasMore: boolean
  oldest: string | null
  latest: string | null
}
```

在 `KlineChart.vue` props/emits 增加：

```ts
defineProps<{ klines: Kline[]; minute: MinutePoint[]; loadingHistory?: boolean }>()
defineEmits<{
  (e: 'periodChange', period: CandlePeriod): void
  (e: 'load-more-history'): void
}>()
```

- [ ] **Step 2: 写合并、锁和请求序列测试**

在已有 Node 测试中增加：

```ts
test('history cursor uses the oldest loaded date', () => {
  assert.equal(oldestKlineDate([bar('2026-08-03', 3), bar('2026-08-01', 1)]), '2026-08-01')
})

test('future bars never enter merged history', () => {
  assert.deepEqual(filterKlinesBefore([bar('2026-08-15', 1), bar('2026-08-16', 2)], null, '2026-08-15').map((item) => item.date), ['2026-08-15'])
})
```

实现并导出 `oldestKlineDate(klines: Kline[]): string | null`，使数据边界逻辑可测试。

- [ ] **Step 3: 将首次加载和增量加载分离**

在 `useFinance.ts` 增加以下状态：

```ts
const loadingHistory = ref(false)
const hasMoreHistory = ref(true)
let historyLoadSeq = 0
```

把当前 `loadKline`/`loadKlineForSymbol` 的替换逻辑整理为 `fetchKlinePage(before?: string)`：

- 首次加载清空旧数据并重置 `hasMoreHistory`。
- 增量请求把最早日期作为 `before`，不改变 selected、klt 或当前模式。
- `loadingHistory` 为 true 时直接返回，`hasMoreHistory` 为 false 时不再请求。
- 响应序列号不匹配时丢弃；匹配时用 `mergeKlines` 合并并更新 `hasMoreHistory`。
- 增量失败只保留现有数据并设置可见错误，不清空已加载历史。
- 标的/周期切换递增 `loadSeq`，同时重置历史状态。

导出 `loadMoreHistory`、`loadingHistory`、`hasMoreHistory`，供图表和页面使用。

- [ ] **Step 4: 在图表滚动接近左边界时触发事件**

在 `KlineChart.vue` 订阅 KLineCharts v10 的滚动动作，在真实数据索引小于 30 且当前图表是 candle 时触发 `load-more-history`；使用本地锁避免同一滚动手势重复发射。收到新 props 后：

- 保留新旧最早日期的差值根数，调用图表的左侧滚动补偿 API，使当前可见日期不跳变。
- 新数据进入期间显示 `正在加载更早数据`，不显示假 K 线。
- `setLeftMinVisibleBarCount(1)` 和 `setRightMinVisibleBarCount(1)` 保持在 `setPeriod()` 之后；最新端继续调用 `scrollToRealTime`。
- 当 `hasMoreHistory` 为 false 时显示 `已到最早数据`，不再触发请求。

- [ ] **Step 5: 连接页面 props 和运行验证**

`index.vue` 的 `KlineChart` 先传递 `:loading-history` 和 `@load-more-history="finance.loadMoreHistory"`，页面显示不会阻塞中央图表。运行：

```bash
node --import tsx --test tests/finance-kline.test.ts
npm run type-check
npm run build
```

- [ ] **Step 6: 精确提交并推送**

```bash
git add src/apps/finance/types.ts src/apps/finance/useFinance.ts src/apps/finance/chart/KlineChart.vue src/apps/finance/index.vue tests/finance-kline.test.ts
git diff --cached --check
git commit -m "feat(finance): load earlier kline history on demand"
git push origin main
```

---

### Task 3: 增加分时、五日和分钟 K 数据模式

**Files:**
- Modify: `server/finance.ts:282-350, 647-883`
- Modify: `src/apps/finance/types.ts`
- Modify: `src/apps/finance/useFinance.ts:85-90, 358-402`
- Modify: `src/apps/finance/chart/KlineChart.vue:9-95, 232-245`
- Test: `tests/finance-kline.test.ts`

**Interfaces:**
- Consumes: Task 2 的选择序列和分页状态。
- Produces: `ChartMode = 'minute' | 'five-day' | 'minute-k' | 'candle'`、`minuteInterval`、`setChartMode()`、`setMinuteInterval()`；服务端 `range=1d|5d` 和 `klt=1|5|15|30|60`。

- [ ] **Step 1: 写模式映射和输入校验测试**

```ts
test('chart mode maps only to supported upstream periods', () => {
  assert.deepEqual(supportedMinuteIntervals, [1, 5, 15, 30, 60])
  assert.equal(parseMinuteInterval('15'), 15)
  assert.equal(parseMinuteInterval('7'), null)
})
```

- [ ] **Step 2: 扩展服务端响应协议**

在 `server/finance.ts` 增加并导出：

```ts
export const supportedMinuteIntervals = [1, 5, 15, 30, 60] as const
export function parseMinuteInterval(value: string | undefined): 1 | 5 | 15 | 30 | 60 | null
```

`/finance/minute` 接受 `range=1d|5d`：

- `1d` 返回当前交易日点，响应为 `{ points, range: '1d', latest }`。
- `5d` 调用支持五日窗口的数据源，返回带 `date` 的点并按日期/时间升序；若上游仅提供单日数据，返回 `502`，不把单日数据伪装成五日。
- `/finance/kline` 的 `klt` 增加 `1、5、15、30、60`；服务端将它们传入对应分钟 K 适配器，响应沿用 `KlinePage` 元数据。
- 对 `interval`、`range`、`limit`、`before` 做边界校验；缓存键包含全部窗口参数。

- [ ] **Step 3: 增加前端请求状态**

在 `useFinance.ts` 增加：

```ts
const chartMode = ref<ChartMode>('candle')
const minuteInterval = ref<MinuteInterval>(5)
const fiveDayPoints = ref<MinutePoint[]>([])
```

实现：

```ts
async function setChartMode(mode: ChartMode): Promise<void>
async function setMinuteInterval(interval: MinuteInterval): Promise<void>
async function loadMinuteRange(range: '1d' | '5d'): Promise<void>
```

切换模式时只请求对应数据；切回 candle 时复用当前周期的 K 线，不重复请求；标的切换清空不适用的模式缓存。

- [ ] **Step 4: 更新 KlineChart 视图模型**

图表将 `minute` 改为当前分时点，增加 `fiveDay`、`minuteK` props；模式按钮固定显示分时、五日、日K、周K、月K，分钟 K 用原生 `select` 显示 1/5/15/30/60 分钟。

- `分时` 使用面积图；`五日` 使用按交易日连续但带日期分段的面积图；二者不创建 MA/MACD 等 K 线指标。
- `分钟 K` 使用 candle type，允许 VOL 和 MA；其 period type 为 `minute`、span 为选定 interval。
- `日K/周K/月K` 继续使用 candle，并把 `periodChange` 发送给父组件。
- 最新按钮和未来边界适用于所有真实数据模式。

- [ ] **Step 5: 运行测试和构建**

```bash
node --import tsx --test tests/finance-kline.test.ts
npm run type-check
npm run build
```

- [ ] **Step 6: 精确提交并推送**

```bash
git add server/finance.ts src/apps/finance/types.ts src/apps/finance/useFinance.ts src/apps/finance/chart/KlineChart.vue tests/finance-kline.test.ts
git diff --cached --check
git commit -m "feat(finance): add intraday chart modes"
git push origin main
```

---

### Task 4: 扩展 MA 周期和指标菜单

**Files:**
- Modify: `src/apps/finance/chart/KlineChart.vue:12-42, 166-245, 382-425`
- Modify: `src/apps/finance/types.ts`
- Test: `tests/finance-kline.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `ChartMode` 和当前 candle/minute-K 周期。
- Produces: `MAPeriod = 5 | 10 | 20 | 30 | 60 | 120 | 250`；常用按钮、更多 MA 菜单、周期上下文文案和读数。

- [ ] **Step 1: 增加 MA 周期纯函数测试**

```ts
test('MA labels describe the active candle context without cross-period claims', () => {
  assert.equal(formatMAPeriodLabel(120, 'day'), 'MA120（约半年）')
  assert.equal(formatMAPeriodLabel(250, 'day'), 'MA250（约一年）')
  assert.equal(formatMAPeriodLabel(12, 'month'), 'MA12（一年）')
})
```

在 `KlineChart.vue` 中导出或移动 `formatMAPeriodLabel` 到 `src/apps/finance/types.ts`，保证测试可调用。

- [ ] **Step 2: 更新 MA 状态和菜单**

将 `MA_PERIODS` 改为 `[5, 10, 20, 30, 60, 120, 250]`，默认启用 `5、10、20、60`。工具栏直接显示 `5、10、20、30、60`，`120、250` 放进“更多 MA”下拉菜单；保留 `MA` 总开关。

菜单必须显示当前周期上下文：日 K 为“交易日”、周 K 为“周”、月 K 为“月”、分钟 K 为“当前分钟 K bar”。不出现把日 K MA120 写成周 MA 的文案。

- [ ] **Step 3: 保持指标互斥和外部读数**

同步指标时使用当前 visible MA periods；分时/五日禁用 MA 和副图；分钟 K 和日/周/月 K 允许 MA 与 VOL。MA/MACD/KDJ/RSI/BOLL 切换后调用现有异步读数刷新，图内 tooltip 继续为 `showRule: 'none'`。

- [ ] **Step 4: 运行类型检查和测试**

```bash
node --import tsx --test tests/finance-kline.test.ts
npm run type-check
npm run build
```

- [ ] **Step 5: 精确提交并推送**

```bash
git add src/apps/finance/chart/KlineChart.vue src/apps/finance/types.ts tests/finance-kline.test.ts
git diff --cached --check
git commit -m "feat(finance): expand moving average periods"
git push origin main
```

---

### Task 5: 实现 C 方案布局和左侧折叠自选栏

**Files:**
- Modify: `src/apps/finance/index.vue`
- Modify: `src/apps/finance/components/IndexStrip.vue` only if the pre-existing diff is manually preserved and the C header requires it
- Modify: `src/apps/finance/components/BoardTable.vue` only if the pre-existing diff is manually preserved and its panel API must be adapted

**Interfaces:**
- Consumes: Task 2/3/4 的图表 props/events 和现有 `BoardTable`/`IndexStrip` 事件协议。
- Produces: header 搜索、`leftCollapsed` 状态、左侧展开/收起按钮、右侧 `rightPanel` 状态和桌面/移动结构。

- [ ] **Step 1: 记录并隔离用户已有工作区改动**

执行并保存仅供当前任务使用的 diff：

```bash
git status --short
git diff -- src/apps/finance/index.vue src/apps/finance/components/BoardTable.vue src/apps/finance/components/IndexStrip.vue
```

不得使用恢复、重置或覆盖操作。实现时以当前文件为基线，手动保留已有功能和样式；提交前只暂存本任务真正修改的文件。

- [ ] **Step 2: 重组模板为固定 header 和工作区网格**

`index.vue` 顶层保持 `.fin`，将主体改为：

```vue
<header class="fin__top">搜索、指数摘要、AI/板块/设置 tab</header>
<div class="fin__workspace">
  <aside v-if="desktopLeftVisible" class="fin__watch-panel">自选</aside>
  <button class="fin__mobile-watch-trigger">自选</button>
  <main class="fin__center-panel">QuoteHeader + KlineChart</main>
  <aside v-if="rightPanel !== 'closed'" class="fin__workspace-panel">当前右侧面板</aside>
</div>
```

保留搜索在 header；中央区域不再渲染底部 AI；BoardTable 只在 `rightPanel === 'boards'` 渲染。

- [ ] **Step 3: 实现桌面折叠和移动覆盖层**

新增 `leftCollapsed = ref(true)`、`mobileWatchOpen = ref(false)`、`rightPanel = ref<'ai' | 'boards' | 'settings' | 'closed'>('ai')`。

- 桌面展开宽度默认 240px，收起宽度 52px；收起态显示自选项简称/首字，当前项有背景+边框/指示条。
- 移动端默认不占网格列，使用按钮打开覆盖抽屉；选择 `viewWatch` 或搜索结果后关闭抽屉。
- header tab 在 AI、板块、设置之间切换，点击当前 tab 再次点击关闭右侧。
- 中央 K 线的 flex 子项全部使用 `min-width: 0; min-height: 0`，局部自选/板块列表独立滚动。

- [ ] **Step 4: 运行类型检查和构建**

```bash
npm run type-check
npm run build
```

- [ ] **Step 5: 精确提交并推送**

```bash
git add src/apps/finance/index.vue
# 只有在确认它们的原有未提交改动属于本任务且已手动保留时，才逐个加入对应组件
git diff --cached --check
git commit -m "feat(finance): build terminal workspace layout"
git push origin main
```

---

### Task 6: 增加桌面 splitter 和键盘可访问调整

**Files:**
- Modify: `src/apps/finance/index.vue`
- Create: `src/apps/finance/components/FinanceSplitter.ts`
- Create: `src/apps/finance/components/FinanceSplitter.vue`
- Test: `tests/finance-preferences.test.ts`（测试 `FinanceSplitter.ts` 的宽度边界纯函数）

**Interfaces:**
- Consumes: Task 5 的 `leftCollapsed`、`rightPanel` 和 workspace CSS 变量。
- Produces: `FinanceSplitter` props `label/min/max/modelValue`、事件 `update:modelValue`；左栏/右栏宽度状态和 CSS 变量。

- [ ] **Step 1: 写宽度边界和键盘步进测试**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { clampPanelWidth, stepPanelWidth } from '../src/apps/finance/components/FinanceSplitter'

test('panel widths stay inside desktop limits', () => {
  assert.equal(clampPanelWidth(100, 200, 360), 200)
  assert.equal(clampPanelWidth(500, 200, 360), 360)
  assert.equal(stepPanelWidth(240, 'ArrowRight', 200, 360), 256)
  assert.equal(stepPanelWidth(240, 'Home', 200, 360), 200)
})
```

- [ ] **Step 2: 实现 FinanceSplitter**

组件使用 `role="separator"`、`tabindex="0"`、`aria-orientation="vertical"`、`aria-valuemin/max/now`，支持：

- pointerdown + pointermove 调整宽度；pointerup 清理监听。
- `ArrowLeft/ArrowRight` 按 16px 调整，`Home` 到最小值，`End` 到最大值。
- 输入值经过 `clampPanelWidth(value, min, max)`，不允许 NaN 和越界宽度进入 CSS。

- [ ] **Step 3: 接入两条 splitter**

`index.vue` 增加 `leftWidth = ref(240)`、`rightWidth = ref(340)`，桌面模板分别在左/中、 中/右之间渲染 `FinanceSplitter`；中央最小宽度通过 CSS `minmax(520px, 1fr)` 保证，右侧打开导致空间不足时关闭右侧而不压扁中央。

拖动只更新布局状态，不触发金融请求；移动端隐藏 splitter，仍使用 Task 5 的抽屉。

- [ ] **Step 4: 运行测试和构建**

```bash
node --import tsx --test tests/finance-preferences.test.ts
npm run type-check
npm run build
```

- [ ] **Step 5: 精确提交并推送**

```bash
git add src/apps/finance/index.vue src/apps/finance/components/FinanceSplitter.vue tests/finance-preferences.test.ts
git diff --cached --check
git commit -m "feat(finance): add adjustable workspace splitters"
git push origin main
```

---

### Task 7: 将 AI 和板块接入右侧工作区并修复可用性状态

**Files:**
- Modify: `src/apps/finance/index.vue`
- Modify: `src/learn/ai.ts`
- Modify: `server/app.ts:667-713`
- Modify: `src/apps/finance/components/BoardTable.vue` only when required by the preserved panel contract

**Interfaces:**
- Consumes: Task 5 的 `rightPanel`，现有 `getAiConfig()`、`streamChat()`、`BoardTable`。
- Produces: 右侧 AI 面板的 `available/loading/streaming/stopped/error/done` 状态；安全、可读的上游错误信息。

- [ ] **Step 1: 写 AI SSE 错误归一化测试**

在 `src/learn/ai.ts` 导出纯函数：

```ts
export function aiErrorMessage(status: number, body: string): string
```

测试：403 返回“AI 网关拒绝请求，请检查模型权限或服务端配置”，503 返回“AI 服务暂不可用”，其他错误包含状态码但不包含响应中的 `x-api-key`、cookie 或 token 字样。

- [ ] **Step 2: 修复前端 AI 状态和错误显示**

`getAiConfig()` 返回 `{ available, model, baseUrlMasked }` 时保留配置模型；`streamChat()` 非 2xx 使用 `aiErrorMessage`，读取 SSE 中的 `error` 事件并抛出安全消息，AbortError 只进入 stopped 状态，不显示失败。

- [ ] **Step 3: 移动 AI 到右侧面板**

从中央模板删除底部 `.fin__ai`，在 `rightPanel === 'ai'` 的工作区面板内渲染：

- 面板头显示 `AI 分析`、模型名和配置状态。
- 未配置显示配置提示；分析中显示停止；流式中实时更新 markdown；完成后保留结果；失败显示具体安全原因和重试按钮。
- 标的/周期切换时 abort 当前请求并清理结果，不能把旧标的分析显示在新标的下。
- 快照只使用当前标的、当前模式、当前 K 线和可见指标，不传凭证。

- [ ] **Step 4: 将 BoardTable 作为右侧 tab**

保留行业/概念、涨跌排序、点击选中和加载空状态；板块面板打开时复用父页面已有 finance 状态，不再占据永久右栏之外的空间。

- [ ] **Step 5: 检查 AI gateway 请求头和本地接口**

确认服务端上游请求包含现有 gateway 需要的 `user-agent`、`x-app`、`x-stainless-lang`、`x-stainless-runtime`，凭证只来自 `aiEnv()`。本地安全会话请求：

```bash
curl -sS -b "$FINANCE_COOKIE" http://localhost:5180/api/ai/config
```

只检查 `available/model/baseUrlMasked`，不输出任何密钥或 cookie。

- [ ] **Step 6: 运行测试和构建并提交**

```bash
node --import tsx --test tests/finance-preferences.test.ts
npm run type-check
npm run build
git add src/apps/finance/index.vue src/learn/ai.ts server/app.ts
# 仅在本任务确实修改并保留用户现有改动时加入 BoardTable.vue
git diff --cached --check
git commit -m "feat(finance): move AI and boards into workspace"
git push origin main
```

---

### Task 8: 新增服务端偏好表、migration、API 和前端恢复

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/0006_finance_preferences.sql`
- Modify: `server/finance.ts`
- Modify: `src/apps/finance/types.ts`
- Modify: `src/apps/finance/useFinance.ts`
- Modify: `src/apps/finance/index.vue`
- Create: `tests/finance-preferences.test.ts`

**Interfaces:**
- Consumes: Task 5–7 的布局、图表和右侧面板状态。
- Produces: 受保护的 `GET/PUT /api/finance/preferences`；`FinancePreferences` 默认值、验证器、加载和防抖保存。

- [ ] **Step 1: 写偏好默认值和校验失败测试**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_FINANCE_PREFERENCES, normalizeFinancePreferences } from '../server/finance'

test('missing preferences use stable defaults', () => {
  assert.equal(DEFAULT_FINANCE_PREFERENCES.leftCollapsed, true)
  assert.equal(DEFAULT_FINANCE_PREFERENCES.rightPanel, 'ai')
  assert.deepEqual(DEFAULT_FINANCE_PREFERENCES.enabledMA, [5, 10, 20, 60])
})

test('preference normalization clamps widths and removes unknown values', () => {
  const result = normalizeFinancePreferences({ leftWidth: 20, rightWidth: 999, rightPanel: 'hack', enabledMA: [5, 7, 250] })
  assert.equal(result.leftWidth, 200)
  assert.equal(result.rightWidth, 480)
  assert.equal(result.rightPanel, 'ai')
  assert.deepEqual(result.enabledMA, [5, 250])
})
```

- [ ] **Step 2: 增加 schema 和 migration**

`server/db/schema.ts` 增加：

```ts
export const financePreferences = sqliteTable('finance_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull().unique(),
  preferences: text('preferences', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
```

`0006_finance_preferences.sql` 创建完全对应的 `finance_preferences` 表，迁移通过现有 `npm run db:migrate` 执行，不直接改数据库文件。

- [ ] **Step 3: 实现服务端偏好验证和受保护路由**

在 `server/finance.ts` 增加：

```ts
export interface FinancePreferences {
  leftCollapsed: boolean
  leftWidth: number
  rightWidth: number
  rightPanel: 'ai' | 'boards' | 'settings' | 'closed'
  chartMode: 'minute' | 'five-day' | 'minute-k' | 'candle'
  minuteInterval: 1 | 5 | 15 | 30 | 60
  candlePeriod: 'day' | 'week' | 'month'
  enabledMA: Array<5 | 10 | 20 | 30 | 60 | 120 | 250>
  showMA: boolean
  subIndicator: 'VOL' | 'MACD' | 'KDJ' | 'RSI' | 'BOLL' | null
}
export const DEFAULT_FINANCE_PREFERENCES: FinancePreferences
export function normalizeFinancePreferences(input: unknown): FinancePreferences
```

固定合法值：`rightPanel` 为 `ai|boards|settings|closed`；`chartMode` 为 `minute|five-day|minute-k|candle`；`minuteInterval` 为 `1|5|15|30|60`；`candlePeriod` 为 `day|week|month`；MA 只保留 `5|10|20|30|60|120|250`；左右宽度分别 clamp 到 `200–360` 和 `280–480`。

在 `registerFinanceRoutes` 增加：

- `GET /finance/preferences`：使用固定管理员 `USER_KEY` 查询；无记录返回默认值。
- `PUT /finance/preferences`：读取 JSON body，调用 normalize，覆盖 `userKey` 和 `updatedAt`，upsert 后返回规范化对象。
- 不接受请求体中的 userKey；非法 JSON/过大 body 返回 400；数据库错误返回 500 且不泄露 SQL/凭证。

- [ ] **Step 4: 接入前端加载和防抖保存**

`useFinance.ts` 增加：

```ts
const preferences = ref<FinancePreferences>({ ...DEFAULT_FINANCE_PREFERENCES })
async function loadPreferences(): Promise<void>
function scheduleSavePreferences(): void
```

登录页面加载时先 GET 偏好，再将 `leftCollapsed/leftWidth/rightWidth/rightPanel/chartMode/minuteInterval/candlePeriod/enabledMA/showMA/subIndicator` 应用到 index/chart。布局或图表设置变化后 300ms 防抖 PUT；失败只保留内存状态并不阻断行情。

- [ ] **Step 5: 运行 migration、测试和构建**

```bash
npm run db:migrate
node --import tsx --test tests/finance-preferences.test.ts
npm run type-check
npm run build
```

- [ ] **Step 6: 精确提交并推送**

```bash
git add server/db/schema.ts server/db/migrations/0006_finance_preferences.sql server/finance.ts src/apps/finance/types.ts src/apps/finance/useFinance.ts src/apps/finance/index.vue tests/finance-preferences.test.ts
git diff --cached --check
git commit -m "feat(finance): persist terminal preferences"
git push origin main
```

---

### Task 9: 桌面/移动真实浏览器验收与回归修复

**Files:**
- Create: `scripts/finance-browser-check.mjs`
- Modify: 仅修复验收发现的金融功能文件；不得加入认证临时文件、截图产物或用户已有无关修改

**Interfaces:**
- Consumes: Task 1–8 的 API、布局和图表 DOM 选择器。
- Produces: 可重复的安全浏览器验收脚本和最终通过记录。

- [ ] **Step 1: 编写安全浏览器驱动**

脚本必须使用：

```js
const username = process.env.ADMIN_USERNAME
const password = process.env.ADMIN_PASSWORD
if (!username || !password) throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required')
```

脚本不能把凭证写入文件、URL、日志或截图；截图只保存到 `/tmp/finance-terminal-*.png`。

- [ ] **Step 2: 验证桌面端 1440×900**

启动现有开发服务后，脚本登录 `/login` 并访问 `/finance`，检查：

- `.fin__search-input` 位于 header；中央 `.kchart__canvas` 在首屏可见。
- 左侧折叠/展开按钮改变宽度，两个 `[role="separator"]` 可拖动且宽度受限。
- 点击 `日K/周K/月K/分时/五日` 和分钟 K 下拉，控制台无新增 pageerror。
- 拖动图表左侧触发最多一次分页请求，合并后读数日期不跳到最新；点击“最新”回到末根数据。
- 右侧默认 AI 可见，切换板块后 BoardTable 可见，关闭后中央区域变宽。
- 修改布局后刷新，GET 偏好恢复宽度、面板和图表模式。

- [ ] **Step 3: 验证移动端 390×844**

检查左栏以覆盖抽屉打开/关闭，选择自选后自动关闭；中央 K 线没有被压缩成横向溢出；右侧 AI/板块使用覆盖或纵向合理布局；不存在横向页面滚动。

- [ ] **Step 4: 运行静态检查并记录结果**

```bash
npm run type-check
npm run build
node scripts/finance-browser-check.mjs
```

没有 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 时只运行静态检查并报告浏览器验收被安全凭证条件阻断，不尝试使用仓库中的硬编码认证脚本。

- [ ] **Step 5: 逐个修复回归并提交**

每个修复只暂存实际修复文件，运行对应验证后使用新的提交，不 amend：

```bash
git add <精确文件列表>
git diff --cached --check
git commit -m "fix(finance): resolve terminal browser regression"
git push origin main
```

- [ ] **Step 6: 最终状态检查**

```bash
git status --short
git log -10 --oneline
```

确认用户已有的 `src/apps/finance/index.vue`、`BoardTable.vue`、`IndexStrip.vue` 修改只有在明确纳入任务并手动保留后才进入提交，认证脚本和 `test-results/` 没有被提交。

---

## 计划自审

### 规范覆盖

- C 方案、header 搜索、左侧折叠、右侧 AI/板块切换：Task 5、Task 7。
- K 线增量历史、去重排序、滚动保持、未来边界：Task 1、Task 2。
- 分时、五日、分钟 K 和数据请求区分：Task 3。
- MA 当前周期语义、更多窗口和副图互斥：Task 4。
- 桌面 splitter、键盘操作、移动抽屉：Task 5、Task 6。
- AI 配置、流式、停止、错误和 gateway headers：Task 7。
- 偏好 schema、migration、认证 API、前端恢复：Task 8。
- 桌面/移动真实浏览器验收和凭证安全：Task 9。

### 占位扫描

计划没有使用 `TBD`、`TODO`、`placeholder` 或未定义的后续动作。每个任务都列出目标文件、接口、测试命令和提交范围。

### 类型和接口一致性

- Task 1 输出的 `hasMore/oldest/latest` 被 Task 2 的 `KlinePage` 使用。
- Task 2 输出的 `load-more-history`、`loadMoreHistory` 被页面和 Task 9 验收使用。
- Task 3 的 `ChartMode`/`MinuteInterval` 被 Task 4 指标禁用规则和 Task 8 偏好恢复使用。
- Task 5 的 `rightPanel`、左栏状态和宽度由 Task 6 splitter、Task 7 面板和 Task 8 偏好共同使用。
- Task 8 的偏好枚举与设计规范一致，服务端归一化负责防止客户端传入越界值。
