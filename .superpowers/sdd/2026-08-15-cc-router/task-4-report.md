# Task 4 Report: Hono 主服务 `cc-router/index.ts`

## 状态
DONE

## 创建/修改的文件
- **创建**: `cc-router/index.ts` — Hono 主服务，包含 `/v1/messages` 路由的多模态模型自动切换逻辑，以及 `*` 通配路由的透明代理
- **修改**: `package.json` — 在 `"dev"` 脚本后添加 `"router": "tsx cc-router/index.ts"`

## 类型检查结果
跳过。`tsc --noEmit` 使用 `--ignoreConfig` 时缺少 `@types/node` 上下文（`process`、`node:http` 等），且 `.ts` 导入扩展需要 `allowImportingTsExtensions`。这些都是配置层面的问题，不影响 tsx 运行时执行。Brief 明确允许跳过。

## Commit Hash
`660166f`

## 顾虑
- 无。代码与 brief 完全一致，未做任何改动。
- 类型检查跳过是预期的，brief 已预见此情况。

---

## 审查修复（Round 2）

### 修复的问题

1. **Critical — JSON 解析失败时原始 body 被丢弃**
   - **原因**：catch 块将 `upstreamBody` 设为 `rawBody`，但后续代码继续执行 `upstreamBody = JSON.stringify(parsed)`（此时 `parsed` 为 `{}`），覆盖了原始 body，导致上游收到 `"{}"`。
   - **修复**：catch 块中直接用 `rawBody` 转发请求并 `return`，跳过后续 model 改写逻辑。同时移除 `parsed` 的 `{}` 初始值（try 块内赋值即可）。

2. **Important — model 改写后 Content-Length 不匹配**
   - **原因**：model 被改写后请求体长度变化，但转发的 headers 仍携带原始 `Content-Length`。
   - **修复**：在两个路由中均创建 `forwardHeaders = new Headers(reqHeaders)` 并删除 `content-length`，让 fetch 自动重新计算。

### 修改的行
- **第 13-15 行**：提前定义 `upstreamUrl` 和 `forwardHeaders`（从 if/else 块后移到前面），供 catch 块使用。
- **第 20 行**：`parsed` 声明移除 `= {}` 初始值。
- **第 23-33 行**：catch 块改为直接转发 rawBody 并 return。
- **第 46-48 行**：`/v1/messages` 主 fetch 使用 `forwardHeaders` 代替 `reqHeaders`。
- **第 62-63 行**：catch-all 路由添加 `forwardHeaders` 创建和 `content-length` 删除。
- **第 66 行**：catch-all 路由 fetch 使用 `forwardHeaders` 代替 `reqHeaders`。

### Commit Hash
`26dffbc`
