# MCP（Model Context Protocol）接入设计

> 日期：2026-08-30
> 方案：远程 HTTP/SSE MCP client、服务端配置、工具自动注入、通用示例打通链路

## 1. 目标与范围

### 目标

给 Lab-Studio 的 `/ai` 平台接入 MCP，让模型能调用外接 MCP server 提供的工具，最终把「正常 agent 的能力」接进来。

平台已有的能力基础（见 `server/agent-engine.ts`）：一套通用化、双 provider（openai-compatible `tool_calls` / anthropic `tool_use`）的工具循环 `runAgentLoop` + 注册表 `AgentToolRegistry`。当前注册表里是 3 个静态工具：`web_search`、`web_fetch`、`finance_quote`。MCP 接入即把 MCP server 动态暴露的工具合入这张注册表，复用现有工具循环，不再新造一套 agent 执行器。

### 第一期范围

- 新增一个 MCP client，通过**远程 HTTP/SSE** 连接 MCP server，把 `tools/list` 暴露的工具适配成 `AgentTool` 合入注册表。
- **服务端配置**接入哪些 MCP server（env / 配置文件），用户侧不任意填 URL。
- 工具**自动注入**给模型，对用户不可见（延续现有「联网开关」式的隐式管道）。
- 首个用**通用示例**（本地起的 HTTP MCP demo server）打通整条链路，后续替换为真实远程 server 只改配置。

### 第一期范围外

- 不做前端 MCP 管理 / 工具勾选 UI（最多预留一个开关/指示位，后加）。
- 不做本地 stdio 子进程 MCP server（本期只走 HTTP/SSE）。
- 不改图片 / Gemini 多模态创作路径（图片模型不接受工具）。
- 不做 MCP `resources` / `prompts`（只接 `tools`）。

## 2. 架构

```
/chat 路由
  buildAgentRegistry() ──静态──▶ { web_search, web_fetch, finance_quote }
                            +
  mcpSession 缓存 ──动态──▶ { mcp__<server>__<tool> }      ← 新增
                            │
                            ▼
  mergedRegister = mergeRegistry(静态注册表, mcpTools)
  upstreamTools  = buildOpenAiTools / buildAnthropicTools(mergedRegister)
  runAgentLoop(registry = mergedRegister)
```

新增 `server/mcp-client.ts`（纯模块 + 连接缓存）：

- `McpServerConfig { id, name, url, transport: 'streamable-http' | 'sse', enabled }`
- `loadMcpTools(config)`：连接 server → `listTools()` → 每个 MCP tool 适配成 `AgentTool`：
  - name 命名空间化为 `mcp__<serverId>__<toolName>`（避免与内置工具撞名，符合 MCP namespaced 心智）。
  - `parameters` = 上游 inputSchema；`description` 截断。
  - `execute(args)` = 调 `tools/call`，把 result content 序列化成字符串回填模型（与现有 executor 返回 string 的契约一致）。
- **进程级缓存**连接 + 工具列表，避免每个 `/chat` 请求都重连；连接或 `listTools` 失败返回空并降级，不影响主流程。
- 工具总数上限（如 ≤ 25），超出截断，避免上游 payload 过大。

### 工具适配要点

- MCP tool 名可能含空格/特殊字符，统一 `encodeURIComponent` 到 segments 或用安全字符重写，保证能作为上游 function name。
- `execute` 返回必须是 string；把 MCP `callTool` 的 `content` 数组按 `text`/`image` 序列化，非纯文本结果统一 `JSON.stringify` 兜底。
- 结果二次回填时，模型看到的是工具返回的字符串；对可能被 MCP server 污染的内容，首期不加额外护栏（只做转发），在安全章节说明。

## 3. 与现有代码的接缝

- `buildAgentRegistry(anthropicConfig)`（`server/ai-platform.ts:406`）保持；新增 `mergeRegistry(静态注册表, mcpTools)` 合并。
- `/chat` 路由（`ai-platform.ts:1322` 起）的 gate 从 `useWebSearch` 放宽为 `useWebSearch || mcpEnabled`，即「有工具可注入就走 `runAgentLoop`」。
- openai-compatible 首轮带工具请求被拒时的 fallback（`ai-platform.ts:1381`）同样覆盖 MCP：回退为不带工具的纯直通。
- 图片 / Gemini 路径（`ai-platform.ts:1167`、`1233`）不动。

## 4. 配置

服务端 env，`MCP_SERVERS` 为 JSON 数组：

```json
[
  { "id": "demo", "name": "Demo MCP", "url": "http://127.0.0.1:8765/mcp", "transport": "streamable-http", "enabled": true }
]
```

解析放在 `server/mcp-client.ts` 的 `parseMcpServerConfig(raw)` 纯函数里，亦便于单测。首个示例用本地起一个 HTTP MCP demo server（SDK 的 tsx 独立进程）。默认：未配置 `MCP_SERVERS` 时该模块整体禁用，不产生任何连接。

## 5. 安全

- 只连服务端 allowlist（env）里的 URL，**前端 / 用户不能任意填**（防 SSRF）。
- 校验 url 为 `http:`/`https:`，否则丢弃并记日志。
- MCP 工具在其 server 侧执行，本服务只做按名转发。远程 MCP server 默认被信任；接外部 server 前需确认其可信（本层无法阻断 server 自身的恶意行为，随文档对使用者说明）。

## 6. 测试

- 单测（`tests/`，沿用 `node:test`）：
  - MCP tool → `AgentTool` 映射：命名空间、`parameters = inputSchema`、`execute` 结果序列化。
  - `mergeRegistry` 合并不覆盖静态工具、命名空间去重。
  - 工具总数上限 / 描述截断。
  - `parseMcpServerConfig` 解析与非法输入。
- 集成/真机：起 demo MCP server + dev server，经 `/ai` 对话触发模型调用 MCP 工具，验证工具被注入、模型发起调用、结果回填到 SSE。

## 7. 交付顺序（每步单独提交推送）

1. 加 `@modelcontextprotocol/sdk` 依赖 + `server/mcp-client.ts` 纯模块（适配/合并/裁剪/解析）。
2. 单测。
3. 起 demo MCP server（tsx 独立进程）。
4. 接 `/chat` 路由：registry 合并 + gate 放宽 + fallback。
5. 真机验证（模型真调 MCP 工具）。
6. 文档 + 提交推送收尾。
