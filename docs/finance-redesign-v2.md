# Finance 全屏页重设计方案 v2（板块行情 + 详情页全量）

> 状态：待确认。所有数据源均已实测可用，无 API key / token 依赖。
> 触发：用户反馈当前实现「板块只按字面加了 5 个指数，UI 简陋、功能不完整」，要求参照同花顺/东财做完整板块行情 + 专业详情页。

## 1. 现状问题诊断（根因）

| # | 问题 | 根因 |
|---|---|---|
| 1 | 「等板块」数据没展示 | 新浪行业板块接口每行含 `领涨股/家数/成交额`，但 `fetchSinaIndustryBoards` 只取了 `name/pct` 两个字段就丢弃；概念板块接口 `newFLJK.php` 压根没接 |
| 2 | 板块无「行业/概念」分类、无涨跌榜、无领涨股/资金 | 前端 `boards.industries` 字段后端返回了、前端没渲染；没有排序/分类 UI |
| 3 | 详情页功能残缺 | 只有日 K 一张静态 SVG（无缩放/十字光标/tooltip/周期切换/分时），无顶部大字价格区与指标格，无板块成分股 |

## 2. 数据源（全部实测 ✅）

| 能力 | 源 | 接口 | 关键字段 |
|---|---|---|---|
| 指数实时行情 | 腾讯 | `qt.gtimg.cn/q=<symbols>` | 点位/涨跌幅/成交额 |
| **行业板块排行** | 同花顺 | `q.10jqka.com.cn/thshy/`（HTML 表格） | 板块名+platecode、涨跌幅、主力净流入、上涨/下跌家数、领涨股、领涨股涨跌幅 |
| **概念板块排行** | 同花顺 | `q.10jqka.com.cn/gn/`（`gnSection` JSON） | platecode、platename、涨跌幅(199112)、主力净流入(zjjlr)、领涨股代码(cid) |
| 板块 K 线 | 同花顺 | `d.10jqka.com.cn/v6/line/bk_<code>/01/all.js` | 日线，platecode 直连 |
| 板块分时 | 同花顺 | `d.10jqka.com.cn/v6/time/bk_<code>/last.js` | 当日分时 |
| 个股/指数分时 | 腾讯 | `web.ifzq.gtimg.cn/appstock/app/minute/query?code=` | 当日分时 |
| 个股/指数/ETF/港股/美股日周月 K | 腾讯 | `fqkline/get?param=<sym>,<day|week|month>,,,<n>,qfq` | 日/周/月 |
| 美股个股 K | 新浪 | `stock.finance.sina.com.cn/usstock/api/jsonp.php/.../getDailyK` | 日线全量 |
| 基金净值 | 东财 | `api.fund.eastmoney.com/f10/lsjz` | 净值 |
| 搜索 | 东财 | `searchapi.eastmoney.com/api/suggest/get`（token） | 板块/股票/基金/ETF |

**关键约束**（上一轮已确认、本轮复验）：东财 `push2` 系列（板块列表/K 线）对当前机器限流（HTTP 000），**板块数据一律走同花顺 + 新浪 + 腾讯**，东财只保留 `searchapi` 搜索。

**板块列表为什么用同花顺而不是新浪**：新浪行业是旧分类（玻璃行业/船舶制造），同花顺是新分类（半导体/白酒/电池），两者名称对不上；而同花顺板块列表自带 `platecode`，可直接对接同花顺板块 K 线，避免跨源按名称匹配的失败。

## 3. 信息架构（页面布局）

```
┌ 顶部指数条（横向滚动，点选切换）───────────────────────────┐
│ 上证指数 深证成指 创业板指 科创50 沪深300 中证500 │ 恒指 道琼斯 纳指 标普500 │
└────────────────────────────────────────────────────────┘
┌ 板块行情（核心区）─────────────────────────────────────┐
│ [行业板块] [概念板块]          [涨幅榜] [跌幅榜]          │
│  #  板块名   涨跌幅   领涨股(+涨跌幅)  涨/跌家数  主力净流入 │ ← 点行进详情
└────────────────────────────────────────────────────────┘
┌ 自选 / 关注列表（保留，实时刷新，行内加删除）─────────────┐
┌ 详情区（选中后）───────────────────────────────────────┐
│ 大字价格区：最新价(28px) 涨跌额 涨跌幅 │ 指标格：今开/最高/最低/成交量/成交额/换手/振幅/量比 │
│ [分时] [日K] [周K] [月K]   副图：[VOL|MACD|KDJ|RSI|BOLL] │
│ ─────────── klinecharts 图 ─────────── │ ── AI 分析面板 ── │
└────────────────────────────────────────────────────────┘
```

涨跌配色沿用现有 `--fin-up/--fin-down` token（红涨绿跌默认，可切国际绿涨红跌）。

## 4. 技术选型

- **K 线图**：`klinecharts` v10.0.2（Apache-2.0，4053★，零依赖 40k gzip），替换手写 SVG。自带缩放/十字光标/tooltip/周期切换/30+ 指标，`setStyles` 配红涨绿跌。数据格式 `{ timestamp(毫秒), open, high, low, close, volume, turnover }`。
- **其余**：沿用 Vue 3 + Hono + SQLite 现有栈，不加其他依赖。

## 5. 组件拆分

```
src/apps/finance/
  index.vue                    # 页面组装：指数条 + 板块行情 + 自选 + 详情
  useFinance.ts                # 状态 + 接口调用（扩展板块排行/分时/周期）
  types.ts                     # 新增 BoardRow / MinutePoint / QuoteDetail
  indicators.ts                # 保留（AI 分析快照仍用）
  chart/KlineChart.vue         # 重写：klinecharts 封装（周期/副图/分时切换）
  components/
    IndexStrip.vue             # 顶部指数条
    BoardTable.vue             # 板块行情表（行业/概念 Tab + 涨跌榜）
    QuoteHeader.vue            # 详情大字价格区 + 指标格
```

## 6. 后端接口变更

| 接口 | 变更 |
|---|---|
| `GET /finance/boards` | 改为返回 `{ indices: Quote[] }`（指数条） |
| `GET /finance/boards/industry?order=up\|down` | 新增：同花顺行业表格解析，返回 `BoardRow[]` |
| `GET /finance/boards/concept?order=up\|down` | 新增：同花顺 gnSection JSON 解析，返回 `BoardRow[]`（领涨股代码经腾讯补名称） |
| `GET /finance/kline` | 扩展 `klt` 支持 `101/102/103`（日/周/月），板块/美股/指数分支保留 |
| `GET /finance/minute` | 新增：分时（腾讯个股/指数 + 同花顺板块） |
| `GET /finance/detail` | 新增：标的实时详情（今开/最高/最低/成交量/成交额/换手/振幅/量比） |

`BoardRow` 结构：
```ts
{ code: string; name: string; pct: number; leaderName: string; leaderPct: number;
  upCount: number; downCount: number; netInflow: number; kind: 'industry' | 'concept' }
```

## 7. 任务分解（每步独立提交推送）

1. **后端**：新增板块排行接口（行业/概念）+ BoardRow 解析 + 领涨股名称补查
2. **后端**：扩展 K 线周期 + 新增分时/详情接口
3. **前端**：安装 klinecharts，重写 KlineChart（周期/副图/分时/红绿配色）
4. **前端**：详情页大字价格区 + 指标格 + 周期切换
5. **前端**：板块行情表（行业/概念 Tab + 涨跌榜）+ 顶部指数条
6. **全量验证**：vue-tsc + build + 浏览器实测（A股/港股/美股/板块/基金），提交推送

## 8. 验收标准

- 板块行情：行业/概念双 Tab，默认涨幅榜，可切跌幅榜，每行显示涨跌幅/领涨股(含涨幅)/涨跌家数/主力净流入，点行进详情出板块 K 线
- 详情页：大字价格区 + 指标格；分时/日/周/月四周期切换；副图指标可切；klinecharts 支持缩放/十字光标/tooltip
- 自选：增删正常，实时行情刷新；AI 分析面板保留可用
- 涨跌配色：红涨绿跌默认，国际切换仍生效
