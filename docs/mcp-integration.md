# MCP 接入与配置

> 面向开发者：如何给 `/ai` 平台接入 MCP（Model Context Protocol，模型上下文协议）server、暴露它的工具给模型调用。
> 设计与实现细节见 `docs/superpowers/specs/2026-08-30-mcp-integration-design.md`。

## 是什么

平台内置了一套通用 Agent 工具循环（`server/agent-engine.ts` 的 `runAgentLoop` + 注册表 `AgentToolRegistry`），注册表当前有 3 个静态工具：`web_search`、`web_fetch`、`finance_quote`。MCP 接入就是把外接 MCP server 通过 `tools/list` 暴露的工具，适配成 `AgentTool` 合入这张注册表，复用现有工具循环——不新造一套 agent 执行器。

模型侧看到的工具名按 `mcp__<serverId>__<toolName>` 命名空间化，例如本机 demo server 的 `add` 工具对外是 `mcp__demo__add`。工具对用户不可见（延续「联网开关」式的隐式管道）。

## 配置（服务端）

通过 env `MCP_SERVERS` 声明要接入的 MCP server，值为 JSON 数组：

```json
[
  {
    "id": "demo",
    "name": "Demo MCP",
    "url": "http://127.0.0.1:8765/mcp",
    "transport": "streamable-http",
    "enabled": true
  }
]
```

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识，作为工具命名空间前缀（`mcp__<id>__<tool>`）。必填。 |
| `name` | 展示名，缺省用 `id`。 |
| `url` | server 端点，只接受 `http:` / `https:`。必填，非法则整条丢弃。 |
| `transport` | `streamable-http`（默认）或 `sse`。 |
| `enabled` | `false` 时整条忽略，默认 `true`。 |

解析在 `server/mcp-client.ts` 的 `parseMcpServerConfig` 纯函数里。默认未配置 `MCP_SERVERS` 时模块整体禁用，不发生任何连接。

## 本地 demo server

用 SDK 起一个本地 HTTP MCP server（独立 tsx 进程）：

```bash
pnpm mcp:demo
# -> MCP demo server on http://127.0.0.1:8765/mcp
```

默认监听 `8765`，可用 `MCP_DEMO_PORT` 覆盖。暴露 3 个回显/计算工具：`echo`、`add`、`greet`，并在日志里打印每次 `tools/call`，便于验证链路。

配合 `MCP_SERVERS` 启动主服务即可让它接入：

```bash
MCP_SERVERS='[{"id":"demo","name":"Demo MCP","url":"http://127.0.0.1:8765/mcp"}]' pnpm server
```

## 验证

登录拿到会话 `lab_session` cookie 后，向 `/api/ai-platform/chat` 发一段要求「调用 `mcp__demo__add` 工具」的话。若 demo server 日志出现 `[mcp-demo] tools/call add {...}` 且模型回复了工具结果，即整条链路打通：

```
agent 工具循环 → 模型发起 tool_use(mcp__demo__add) → mcp-client 调 tools/call
→ demo server 执行并回填 → 结果序列化回填模型 → 最终回复
```

对不支持函数调用的 openai-compatible 模型，首轮带工具请求被网关拒绝时，代码会回退成不带工具的纯直通（见 `server/ai-platform.ts`），保证会话不报错。

## 运行限制

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `MCP_MAX_TOOLS` | `25` | 单 server 注入工具数上限，超出截断，避免上游 payload 过大。 |
| `MCP_DESCRIPTION_MAX` | `800` | 工具描述截断长度，超出加省略号。 |
| `MCP_LOAD_TIMEOUT_MS` | `8000` | 单 server 连接/`listTools` 超时，超时降级为空，避免挂起 `/chat`。 |

## 安全

- 只连服务端 allowlist（`MCP_SERVERS`）里的 URL，**前端 / 用户不能任意填**（防 SSRF）。
- 仅接受 `http:`/`https:`，其他协议（`file:`、`ws:` 等）直接丢弃。
- MCP 工具在其 server 侧执行，本服务只做按名转发。远程 MCP server 默认被信任；接外部 server 前需确认其可信——本层无法阻断 server 自身的恶意行为。
