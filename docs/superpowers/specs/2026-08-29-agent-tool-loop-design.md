# Agent 工具循环设计

> 日期：2026-08-29
> 范围：给 `/ai` 平台的聊天模型加「通用 Agent 工具循环 + 服务端工具注册表」，把已写死的联网搜索循环泛化成可注册多工具、同一轮可分发多个工具调用的通用机制。
> 方法论对齐：见 `docs/ai-capability-design.md`，「纯逻辑模块 + 接入层 + 测试」。

## 1. 背景与目标

`server/web-search.ts` 目前是**单工具、写死**的联网搜索循环：`streamOpenAiWebSearch`（在 `server/ai-platform.ts`）只认 `web_search` 一个工具，参数提取只认 `query`，且只作用于 openai-compatible 模型。

本期目标：把它推广成**通用 Agent 工具循环**——

- 一个**工具注册表**作为单一事实源：既用于生成发给上游模型的工具定义，也用于按名字分发执行；「加一个工具 = 注册一行」。
- 模型在**同一轮**里可以发起多个、多种工具调用，服务端循环读流 → 累积 tool_calls → 按注册表分发执行 → 回填结果 → 继续，直到无工具调用或到轮次上限。
- 循环对**用户在界面上不可见**（工具是让模型答得更准的「管道」，不是给用户点按钮的功能页）；前端零改动，`streamChat` 已兼容。

首批注册三个真实工具：`web_search`（已有）、`web_fetch`（新）、`finance_quote`（新）。

## 2. 参考实现与不变量

按设计方法论「先参考，再设计」，把业界共识抽象成不变量，再落地：

| 不变量 | 参考来源 | 在本设计中的体现 |
|---|---|---|
| **预算硬上限** | Claude Code 工具循环有 step 上限；pi agent 有 max_turns | `maxRounds`（默认 `MAX_AGENT_ROUNDS`），达到即强制结束，避免模型无限精化工具查询递归 |
| **确定性兜底** | Claude Code 工具出错不崩、继续推进 | 工具不存在 / 参数非法 / 执行异常 → 回填「（工具 X 出错：…）」，绝不抛出中断流 |
| **注册表单一事实源** | 工具描述既是发给模型的 schema 也是分发依据 | 名字 + description + parameters + execute 集中在一条 `AgentTool` |
| **纯函数与传输解耦** | 设计方法论第 1 节第 7 条 | SSE 解析、消息回填、循环编排都是纯逻辑；外部 IO（联网、抓取、行情）注入在 executor |
| **内容预算截断** | pi agent truncateHead；设计方法论第 1 节第 4 条 | `web_fetch` / `finance_quote` 返回都做长度上限，工具结果不撑爆上下文 |

## 3. 现有基础（前两步已铺路）

- **`server/context-engine.ts`**：上下文窗口化压缩 + 分层系统提示 + 预算感知。这是「让模型在一个合理预算内作答」的底座。
- **`server/web-search.ts`**：已经实现了工具无关的 SSE 解析与 tool_call 累积——`readOpenAiStream` / `applyOpenAiDelta` / `createOpenAiStreamAccumulator` / `appendToolLoopMessages` 对工具不敏感；真正写死的只有 `extractWebSearchQuery`（只认 `query`）和 `ai-platform.ts` 里的单工具循环。这决定了本期泛化成本低、且不推翻已有能力。

## 4. 架构总览

```
server/agent-engine.ts   ← 新：纯函数 + 统一编排
  ├─ AgentTool / AgentToolRegistry
  ├─ readOpenAiTurn / readAnthropicTurn（归一化成 AgentTurn）
  ├─ buildOpenAiTools / buildAnthropicTools（按 provider 生成工具定义）
  ├─ appendToolMessages（双 provider 回填）
  └─ runAgentLoop（读流→分发→回填→继续，maxRounds + 确定性兜底）

server/ai-platform.ts    ← 接入：构建 registry，注入 provider 工具，用 runAgentLoop 替代 streamOpenAiWebSearch
src/…（前端）            ← 零改动：仍是纯文本 SSE
```

### 4.1 核心类型

```ts
// server/agent-engine.ts
export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>      // JSON Schema（参数）
  execute: (args: Record<string, unknown>) => Promise<string>   // 返回工具结果文本
}
export type AgentToolRegistry = Record<string, AgentTool>

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>       // 已解析的参数对象
}
export interface AgentTurn {
  content: string
  toolCalls: AgentToolCall[]               // 归一化，仅含有名字的
  finishReason: string | null
  done: boolean
}
export interface AgentChatMessage {
  role: string
  content?: string | null
  tool_calls?: unknown[]
  tool_call_id?: string
}

export interface AgentRoundRequest {
  url: string
  headers: Headers
  body: string | FormData | null
}
```

### 4.2 归一化读取（provider 无关的 turn）

- `readOpenAiTurn(stream, onContent?, signal?)`：解析 `data:` 帧，累积 `choices[0].delta.content`（逐段 `onContent` 流式吐字）与 `tool_calls`（按 `index` 拼接 id/name/arguments），`[DONE]` 置 `done`。由 `web-search.ts` 的现有代码改名/搬入。
- `readAnthropicTurn(stream, onContent?, signal?)`：解析 Anthropic 事件流，收集 `content_block_delta` 的 `text_delta`（`onContent` 吐字）与 `content_block_start` 的 `tool_use`（id / name / input）。原生 `web_search` 的 `web_search_tool_result` 块被 Claude 折叠进正文，无需单独处理。

两者的产出统一成 `AgentTurn`，让 `runAgentLoop` 双 provider 通用。

### 4.3 工具定义构建

- `buildOpenAiTools(registry)` → `[{ type:'function', function:{ name, description, parameters } }]`。网关只收 `type:'function'`（已实测），所以这是 openai-compatible 唯一合法形状。
- `buildAnthropicTools(registry)` → 客户端工具数组 `[{ name, description, input_schema: parameters }]`，可与原生 `web_search_20260209` 服务端工具共存。

### 4.4 统一编排 `runAgentLoop`

```ts
export function runAgentLoop(opts: {
  initialMessages: AgentChatMessage[]
  modelId: string
  params?: { reasoningEffort?: string; maxTokens?: number }
  registry: AgentToolRegistry
  buildRequest: (messages: AgentChatMessage[], modelId: string, params?: { reasoningEffort?: string; maxTokens?: number }) => AgentRoundRequest
  readTurn: (stream: ReadableStream<Uint8Array>, onContent?: (t: string) => void, signal?: AbortSignal) => Promise<AgentTurn>
  maxRounds: number
  signal?: AbortSignal
}): ReadableStream<Uint8Array>
```

循环体（向客户端输出 **OpenAI 格式 SSE**：`data: {choices:[{delta:{content:…}}]}` + `data: [DONE]`，前端 `streamChat` 已解析）：

1. `readTurn(上游流)` → 得 `AgentTurn`；期间 `onContent` 已把正文流式写给客户端。
2. 若 `toolCalls` 为空 → 发 `[DONE]` 结束。
3. 若 `rounds >= maxRounds` → 写「（已连续调用工具，以下为本地生成结果）」再结束。
4. 否则遍历 `toolCalls`：
   - 无对应工具 → 结果「（工具 X 不存在）」；
   - `readTurn` 时参数已解析成对象，直接 `await registry[name].execute(args)`；
   - 执行抛错 → 结果「（工具 X 出错：…）」，吞掉异常继续。
5. `appendToolMessages(…)` 回填 assistant（含 tool_calls）+ 各工具结果 → `buildRequest` 重建请求 → fetch 下一轮。
6. 任一环节失败（fetch 抛错 / 响应非 OK）→ 写提示 + `[DONE]` 结束，不抛给调用方。

> 说明：`runAgentLoop` 输出 OpenAI 格式 SSE 是为了统一前端解析；anthropic 若只走原生 web_search（无客户端工具）时，仍可沿用现在的「原始 passthrough」，两种路径由 provider 侧开关决定（见 §7 风险）。

### 4.5 消息回填

- openai-compatible：用现有 `appendToolLoopMessages` 形状——`role:'tool'` + `tool_call_id`。
- anthropic：追加 `role:'assistant'`（content + `tool_use` 块）+ `role:'user'`（`tool_result` 块）。

## 5. 首批三个工具

| 工具 | 参数 | 执行 | 说明 |
|---|---|---|---|
| `web_search` | `{ query: string }` | `runWebSearch`（`server/web-search.ts`，Claude 落地检索，零新增 Key） | 沿用现有；从写死逻辑改为注册表一项 |
| `web_fetch` | `{ url: string }` | 服务端 fetch → 剥 HTML → 预算截断（如 4000 字符） | 只允许 `http(s):` scheme，设超时；双 provider 统一走客户端工具（避免依赖网关是否支持原生 web_fetch） |
| `finance_quote` | `{ q: string }` | 导出/包装 `searchEastmoney` + `fetchTencentQuotes`；按名称或代码解析 | 复用 `server/finance.ts` 现有逻辑与数据源，返回紧凑实时行情摘要（名字、代码、现价、涨跌幅） |

## 6. 接入 `server/ai-platform.ts`

- chat handler 里构建 `registry`（`web_search` 用 `webSearchExecutor` 合成；`web_fetch` / `finance_quote` 各自 executor）。
- `buildUpstreamRequest` / `buildAnthropicPlatformRequest` 改为能注入对应 provider 的工具定义（openai：`buildOpenAiTools`；anthropic：客户端工具 + 原生 web_search）。
- 用 `runAgentLoop` 替换 `streamOpenAiWebSearch`；openai-compatible 的「带工具请求被拒 → 回退纯直通」逻辑保留。
- 前端零改动。

## 7. 风险与验证

- **anthropic 客户端工具是否被网关接受未验证**：`ai-service.tal.com` 只实测过原生 `web_search_20260209`，任意客户端工具（`name/description/input_schema`）可能被拒。**实现期先发一个 probe 验证**：
  - 网关接受 → anthropic 也启用客户端工具循环。
  - 网关拒绝 → anthropic 保持「原生 web_search 自闭环（passthrough）」；客户端工具仅 openai-compatible 可用。已做成 provider 内布尔开关，互不阻塞。
- **finance 工具的最坏情况**：`searchEastmoney` 无结果时返回「（未找到该标的，请核对名称或代码）」，不崩。
- **`web_fetch` 安全**：仅 `http(s)`；限制大小；超时。这是对外的 fetch 工具，需确认不会引入 SSRF 类风险（本项目为本地个人工具，风险可控，但仍做 scheme 白名单）。

## 8. 测试计划

`tests/agent-engine.test.ts`（沿用 `npx tsx --test`，node:test）：

- `readOpenAiTurn`：伪 SSE 流 → 内容累积、多 tool_call 按 index 拼接、`[DONE]` 停止。
- `readAnthropicTurn`：伪事件流 → `text_delta` 吐字、`tool_use` 收集 id/name/input。
- `buildOpenAiTools` / `buildAnthropicTools`：由注册表生成正确的工具定义形状。
- `appendToolMessages`：双 provider 回填形状。
- `runAgentLoop`：mock `readTurn`/`buildRequest`/`execute` 编排 —— 一轮分发多个工具、工具不存在兜底、`maxRounds` 上限、流式吐字。
- `webFetchExecutor` / `financeQuoteExecutor`：参数校验、URL scheme 白名单、无结果兜底。
- 回归：现有 `tests/ai-platform-proxy.test.ts` 保持通过（`web-search` 相关测试随迁移更新 import）。

真机验证：让模型发起「同一轮多工具」调用（如先 `finance_quote` 查两家公司实时行情，再 `web_fetch` 打开公告页面对比，或先 `web_search` 再补充 `web_fetch` 指定来源），确认循环多轮分发正确、流式输出正常、前端可渲染。

## 9. 文档与学习内容（「两者都要」）

- `docs/ai-capability-design.md` 增一节「Agent 工具循环」，记录不变量与落地结构（与既有 context-engine 节同构）。
- `src/learn/cc-*` 对应 `s01/s02` 补一段「把课程里的 Agent Loop 落到自己的 /ai 平台」的 crosswalk（平台实现作为案例）。
- 本设计文档（`docs/superpowers/specs/2026-08-29-agent-tool-loop-design.md`）。

## 10. 本期不做

- 工具活动 UI 指示器（模型在调工具时前端转圈/显示「正在检索」）——本期工具对用户透明，做提示推后。
- 工具结果前端卡片化展示。
- 子代理 / 跨会话记忆 / 后台定时任务（后续增量）。

## 11. 参考

- `docs/ai-capability-design.md`（设计方法论）
- `server/context-engine.ts`、`server/web-search.ts`（既有基础）
- `server/ai-platform.ts`（接入点）
- `server/finance.ts`（`searchEastmoney`、`fetchTencentQuotes`、`Quote` / `SearchItem` 类型）
