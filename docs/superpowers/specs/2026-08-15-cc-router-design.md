# cc-router：Claude Code 多模态路由代理

## 背景与问题

用户通过公司 token plan 使用 AI 网关 `http://ai-service.tal.com/coding`，统一使用一个 `sk-code-` API key。Claude Code 当前配置 `ANTHROPIC_MODEL=claude-sonnet-4.6`，网关将其映射到后端 `glm-5.2`。

**问题**：`glm-5.2` 不支持图片输入。当用户在 Claude Code 中发送图片时，网关返回 `400 Model do not support image input`。更严重的是，一旦历史记录中有了图片，Claude Code 后续每轮请求都会重发完整历史（含图片），导致即使不再发新图片也持续报错——只有等 Claude Code 压缩历史、图片被清掉后才恢复。

## 目标

构建一个本地路由代理，自动检测请求是否包含多模态内容，在默认模型不支持图片时将请求路由到支持图片的模型，从而：

1. 修复含图片请求报 400 的问题
2. 自动修复"卡住"问题——历史中残留图片时持续路由到多模态模型
3. 纯文本请求保持使用默认模型（glm-5.2），不受影响

## 网关测试结论

实测公司网关 `http://ai-service.tal.com/coding`（Anthropic Messages 格式，`/v1/messages` 端点），全部 23 个模型的多模态支持情况：

### 支持图片输入（HTTP 200）

| 模型名 | 后端实际模型 |
|--------|-------------|
| gpt-5.6-terra | gpt-5-6-terra |
| gpt-5.6-luna | gpt-5-6-luna |
| gpt-5.5 | gpt-5-5 |
| gpt-5.4 | gpt-5-4 |
| gpt-5.3-codex | gpt-5-3-codex |
| gpt-5.2-codex | gpt-5-2-codex |
| deepseek-v4-pro | deepseek-v4-pro |
| kimi-k2.7-code | kimi-k2-7-code |
| glm-4.7 | glm-4-7 |
| glm-5.1 | GLM-5-1 |
| glm-5 | glm-5 |

### 不支持图片输入（HTTP 400）

| 模型名 | 说明 |
|--------|------|
| glm-5.2 | 用户当前默认模型 |
| doubao-seed-evolving | — |
| deepseek-v4-flash | — |
| qwen3.7-max | — |
| 所有 claude-* 命名模型 | 网关将所有 Claude 模型名映射到 glm-5.2，均不支持图片 |

**关键结论**：
- 所有 `claude-*` 模型名都映射到 `glm-5.2`，不能用于多模态。
- 非 Claude 命名的模型会透传到真实后端，网关返回标准 Anthropic Messages 格式。
- 同一系列能力不一致：glm-4.7 / glm-5 / glm-5.1 支持图片，glm-5.2 不支持。

## 架构

```
Claude Code  --POST /v1/messages-->  cc-router (localhost:8787)
                                         │
                                   解析 body，读取 model 字段
                                   扫描 messages[].content[]
                                   和 system 块是否含多模态内容
                                         │
                    ┌────────────────────┴────────────────────┐
              含图片 且 当前模型                              不含图片 或 当前模型
              不支持多模态                                   支持多模态
              model → gpt-5.6-terra                         model → 原样透传
                    └────────────────────┬────────────────────┘
                                         │
                            转发到 http://ai-service.tal.com/coding/v1/messages
                            （Claude Code 的请求头原样转发）
                                         │
                            SSE 流式响应原样回传给 Claude Code
```

## 路由逻辑

```
收到 POST /v1/messages 请求
  ├─ 解析 body，读取 model 字段
  ├─ 查模型能力表：该 model 是否支持多模态？
  │    ├─ 支持 → 透传，不改写 model
  │    └─ 不支持 → 检测请求是否含多模态内容（image/document 块）
  │         ├─ 含多模态内容 → 改写 model 为 MULTIMODAL_MODEL（默认 gpt-5.6-terra）
  │         └─ 不含 → 透传
  └─ 转发到上游网关，SSE 流式响应原样回传
```

这样：
- 默认模型是纯文本（如 glm-5.2）→ 遇到图片自动路由到多模态模型
- 默认模型是多模态（如 gpt-5.6-terra）→ 所有请求直接透传，代理不干预

## 组件设计

新建顶层目录 `cc-router/`，包含三个模块：

### 1. `cc-router/config.ts` — 配置管理

读取环境变量：
- `UPSTREAM_BASE_URL`：上游网关地址（默认 `http://ai-service.tal.com/coding`）
- `MULTIMODAL_MODEL`：多模态模型名（默认 `gpt-5.6-terra`）
- `PORT`：监听端口（默认 `8787`）

不配置 API key——请求头由 Claude Code 自带，代理原样转发。

### 2. `cc-router/models.ts` — 模型能力表

硬编码的模型多模态支持表（基于实测结果）。导出 `supportsMultimodal(model: string): boolean`。

不支持的模型列表（含通配规则）：
- 所有 `claude-*` 前缀 → 不支持（映射到 glm-5.2）
- `glm-5.2`、`glm-5.1`... 等具体判断（glm-5.2 不支持，glm-5.1 支持）
- `doubao-seed-evolving`、`deepseek-v4-flash`、`qwen3.7-max` → 不支持

支持列表见上方测试结论表。

**安全默认**：未知模型默认视为"不支持多模态"，这样遇到新模型时会走多模态路由（安全），而不是直接透传给一个可能不支持图片的模型。

### 3. `cc-router/detect.ts` — 多模态内容检测

纯函数 `hasMultimodalContent(body: unknown): boolean`。

扫描范围：
- `body.messages[].content`：支持 string 和 array 两种形式
  - array 形式：检查是否有 `type: "image"` 或 `type: "document"` 的块
- `body.system`：支持 string 和 array 两种形式
  - array 形式：检查是否有 `type: "image"` 或 `type: "document"` 的块

无副作用，可独立单元测试。

### 4. `cc-router/index.ts` — Hono 主服务

监听 `PORT`（默认 8787），路由：

- `POST /v1/messages`：
  1. 读取请求 body
  2. 解析 JSON，提取 model 字段
  3. 查 `supportsMultimodal(model)`
  4. 若不支持，调 `hasMultimodalContent(body)` 决定是否改写 model
  5. 转发到 `${UPSTREAM_BASE_URL}/v1/messages`，请求头原样转发
  6. SSE 流式响应原样回传，客户端断开时 abort 上游请求

- `* /*`（其他所有路径：`/v1/messages/count_tokens`、`/v1/models`、GET 请求等）：
  - 盲转发到上游，响应原样回传
  - 保证 Claude Code 的所有请求都通

## 关键决策

1. **请求头**：Claude Code 自带 `x-api-key`、`anthropic-version`、`user-agent`、`x-app`、`x-stainless-*`，代理原样转发，不添加自己的 header（除 `host`）。代理不需要知道 API key。

2. **只改 model 字段**：tools、system、max_tokens、stream、messages 全部不动。网关会处理非 Claude 模型的格式转换。

3. **流式透传**：pipe 上游 SSE body 直接到客户端（与现有 `vite-ai-proxy.ts` 相同方式），客户端断开时 abort 上游。

4. **卡住 bug 自动修复**：检测每次请求都重新扫描完整历史。只要历史中还有图片，就自动路由到多模态模型。Claude Code 压缩历史、图片被清掉后，自动回到默认模型。无需维护跨请求状态。

5. **不按问题类型路由**：代理唯一可靠检测的信号是"请求是否含图片"。"这个问题需要什么级别的模型"无法可靠判断（Claude Code 每轮带完整历史、可能同时包含代码/工具/对话、无控制信号）。所以只做"有图片 → 多模态 / 无图片 → 默认"的二元路由，不做问题类型自动分类。

6. **MULTIMODAL_MODEL 做成环境变量**：方便切换不同多模态模型。默认 `gpt-5.6-terra`（已验证识图准确）。用户可换 `gpt-5.6-luna`、`deepseek-v4-pro`、`kimi-k2.7-code` 等试效果。

## 配置与启动

### 环境变量

代理自身：
```
UPSTREAM_BASE_URL=http://ai-service.tal.com/coding
MULTIMODAL_MODEL=gpt-5.6-terra
PORT=8787
```

Claude Code（修改 `~/.claude/settings.json`）：
```
ANTHROPIC_BASE_URL=http://localhost:8787
```
API key 和 model 保持不变。

### 启动

在 `package.json` 添加脚本：
```json
"router": "tsx cc-router/index.ts"
```

运行：`pnpm router`

## 已知风险

1. **Agentic 场景**：Claude Code 遇到图片时常常是带工具调用的（"看这张截图，修代码"），多模态模型需要支持 Anthropic 的 tool-use 格式，不只是看图。`gpt-5.6-terra` 已验证接受图片输入，但在完整 agentic 流程下的表现需实际验证。如效果不佳，可通过 `MULTIMODAL_MODEL` 环境变量换其他模型。

2. **模型能力表维护**：公司平台可能新增模型或变更能力。能力表是硬编码的，需要手动更新。安全默认（未知模型视为不支持多模态）保证新模型出现时不会直接报 400。

## 不在范围内（YAGNI）

- 格式转换（网关已处理）
- 图片描述缓存
- 多 key 池化
- 请求日志 UI
- 按问题类型自动选模型
- 多模态模型分档（高端/性价比）——信号不可靠，改为单一环境变量可切换
