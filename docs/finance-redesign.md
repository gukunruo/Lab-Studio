# Finance 全屏页重设计方案

> 状态：待确认（确认后进入实施）。本方案所有数据源均已实测可用，无需任何 API key / token。

## 1. 目标

把「金融分析」从一个嵌在示例框架（AppView）里的应用，重做为**独立全屏路由页面**：

- Header「金融分析」入口保持不变，点击进入**真全屏页**（不含 LabShell 顶栏/播放器栏）。
- 布局自上而下：顶部搜索框 → 重点板块（国内 / 国外）→ 自选/关注列表 → AI 金融分析。
- 自选列表支持搜索板块/股票/基金/ETF，点加号加入，存 SQLite（服务端持久化）。

## 2. 数据源（已实测，免费、无 key、无 token）

| 能力 | 数据源 | 接口 | 实测 |
|---|---|---|---|
| 实时行情（指数/个股/ETF/港股/美股） | 腾讯 `qt.gtimg.cn` | `q=sh000001,sz399001,...,usDJI,usIXIC,usINX,hkHSI` | ✅ GBK，含涨跌幅/成交额 |
| 行业板块实时涨跌幅 | 新浪 `vip.stock.finance.sina.com.cn` | `newSinaHy.php` | ✅ 板块名/涨跌幅/成交额/领涨股 |
| 关键词搜索（板块/股票/基金/ETF） | 东方财富 `searchapi.eastmoney.com` | `suggest/get`（token） | ✅ |
| 个股/ETF/指数 K 线 | 腾讯 `web.ifzq.gtimg.cn` | `fqkline/get`（前复权） | ✅ |
| 板块 K 线 | 同花顺 `d.10jqka.com.cn` | `v6/line/bk_<code>/01/all.js` | ✅ 250 根 |
| 基金净值 | 东方财富 `api.fund.eastmoney.com` | `f10/lsjz` | ✅ |
| 概念/行业板块代码映射 | 同花顺 `q.10jqka.com.cn/gn` + `/thshy` | gnSection JSON | ✅ |

**关键约束**：东方财富 `push2` 系列（K 线/板块列表）对当前机器有应用层风控（空响应），因此**东方财富只保留 searchapi 一个入口**；行情/K 线全部走腾讯 + 新浪 + 同花顺。这块上一轮已完整验证。

## 3. 架构

```
路由（顶层，真全屏，不经过 LabShell）
  /finance  →  FinanceView.vue（自带返回按钮 → /）

服务端（Hono，复用 protectedApi + requireAuth）
  server/finance.ts  registerFinanceRoutes(app)
    GET /finance/quote       批量实时行情（腾讯，一次拉齐指数+自选）
    GET /finance/boards      重点板块实时（腾讯指数 + 新浪行业）
    GET /finance/search      关键词搜索（东财 searchapi）
    GET /finance/kline       个股/ETF/指数 K 线（腾讯，板块→同花顺回退）
    GET /finance/fund/nav    基金净值（东财 f10/lsjz）
    GET /finance/watchlist   自选列表
    POST /finance/watchlist  添加自选
    DELETE /finance/watchlist/:id  删除自选

存储（SQLite/Drizzle，复用现有 db）
  watchlist 表：id / userKey / quoteId / code / name / type / market / createdAt

AI（复用现有 src/learn/ai.ts 的 getAiConfig + streamChat，SSE 流式）
  输入某标的 K 线快照 → 输出走势/量价/指标/风险四段分析
```

## 4. 页面布局（借鉴同花顺/雪球/东财首页）

```
┌──────────────────────────────────────────────────┐
│ [← 返回]  金融分析                    [自选数 n]   │  顶栏（真全屏自绘）
├──────────────────────────────────────────────────┤
│  🔍 搜索股票/基金/板块/ETF…                       │  搜索框 + 下拉建议（带 + 加号）
├──────────────────────────────────────────────────┤
│ 国内重点板块                                     │
│  ┌上证指数┐ ┌深证成指┐ ┌沪深300┐ ┌科创50┐ ┌创业板┐ │  卡片：指数名/点位/涨跌幅(红绿)
│ 国外重点板块                                     │
│  ┌道琼斯┐ ┌纳斯达克┐ ┌标普500┐ ┌恒生指数┐        │
├──────────────────────────────────────────────────┤
│ 自选 / 关注列表                    [+ 搜索添加]   │
│  ┌茅台 600519  -0.98% ┐  [查看] [×]              │  每行：名称/代码/实时涨跌
│  ┌白酒板块 +1.2%       ┐  [查看] [×]              │
├──────────────────────────────────────────────────┤
│ 点击某标的 → 下方/侧栏展开 K 线图 + AI 分析按钮     │
└──────────────────────────────────────────────────┘
```

涨跌配色遵循 A 股习惯：**红涨绿跌**（可配置，默认按中文习惯）。

## 5. 数据流

1. 进入页面 → `GET /finance/quote` 批量拉重点板块 + 自选实时行情，`GET /finance/watchlist` 拉自选。
2. 搜索输入 → 防抖 250ms → `GET /finance/search` → 下拉建议，每项带 `+` 加号。
3. 点加号 → `POST /finance/watchlist` → 自选列表即时刷新。
4. 点自选/板块「查看」→ `GET /finance/kline`（或 fund/nav）→ K 线图 + 技术指标。
5. 点「AI 分析」→ 组装 K 线快照 → `streamChat` SSE 流式输出四段分析。

## 6. 需要你提供什么

**什么都不需要。** 数据源全部免费开源；AI 已复用 `~/.claude/settings.json` 里的配置（上一轮已打通）。

## 7. 实施范围

- 新增 `src/apps/finance/`（index.vue + useFinance.ts + chart/KlineChart.vue + indicators.ts + types.ts + meta.ts）
- 新增 `src/views/FinanceView.vue`（全屏壳 + 返回），`src/router/index.ts` 加顶层路由
- `src/layouts/LabShell.vue` 恢复 Header「金融分析」入口（指向 `/finance`）
- `src/i18n/messages.ts` 恢复 `nav.finance`
- 新增 `server/finance.ts`（代理 + 自选 CRUD），`server/db/schema.ts` 加 `watchlist` 表，`server/app.ts` 注册
- K 线图/指标/AI 面板复用上一轮已验证的实现（KlineChart、indicators.ts 已删除，但 git 历史可恢复）
