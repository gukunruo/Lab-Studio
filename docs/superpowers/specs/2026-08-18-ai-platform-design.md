# AI 平台设计文档

> 日期：2026-08-18
> 方案：Playground 优先（方案 A）— 全屏多模型对话平台

## 1. 目标与范围

### 目标
在 Lab Studio 平台中新增一个全屏 AI 对话平台，支持多模型切换、流式对话、会话持久化。作为后续 AI 能力研究、使用、学习的统一入口。

### MVP 范围
- 多模型对话（对话类模型）
- 模型库管理（DB 存储与分类）
- 流式对话 + 会话持久化
- 全屏三栏式 UI

### 不在 MVP 范围（第二期）
- 图像生成（文生图 / 图生图）— `gpt-image-2` 已入库但前端不展示
- Agent 工具调用（多步骤、函数调用）
- 多用户支持

## 2. 入口与路由

### 路由
在 `src/router/index.ts` 中新增独立全屏路由，与 `/finance` 同级，不在 `LabShell` 内部：

```ts
{
  path: '/ai',
  name: 'ai-platform',
  component: () => import('@/views/AiPlatformView.vue'),
}
```

### 顶部导航入口
在 `LabShell.vue` 的 `shell__right` 区域，Finance 链接后新增 AI 入口（`PhSparkle` 图标），样式沿用 `shell__learn` 的 pill 样式。

## 3. 三层架构

```
浏览器 ──HTTP──> Hono 服务端(/api/ai-platform/*) ──> ai-service.tal.com
                   │
                   ├── 模型库管理(CRUD + 分类)
                   ├── 对话会话持久化
                   └── 统一上游代理(协议路由 + SSE 统一转换)
```

后端是统一代理层：根据每个模型的 `provider` 字段选择协议格式转发到 `ai-service.tal.com`，凭证只存服务端 `.env`，不暴露给浏览器。

## 4. 数据模型

### 表 1：`ai_models` — 模型注册表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer PK | 自增 |
| `modelId` | text, unique, notNull | 模型标识，如 `claude-opus-5`、`gpt-5.4` |
| `displayName` | text, notNull | 展示名，如 `Claude Opus 5` |
| `provider` | text, notNull | 协议类型：`openai-compatible` 或 `anthropic` |
| `category` | text, notNull | 分类：`chat`、`reasoning`、`image` |
| `vendor` | text, notNull | 厂商：`openai`、`anthropic`、`deepseek`、`zai`、`moonshot` |
| `capabilities` | text(json) | 能力标签数组，如 `["streaming","reasoning_effort"]` |
| `contextWindow` | integer | 上下文窗口大小 |
| `sortOrder` | integer, default 0 | 排序权重 |
| `enabled` | integer, default 1 | 是否启用 |
| `createdAt` | integer(timestamp_ms) | |
| `updatedAt` | integer(timestamp_ms) | |

### 表 2：`ai_conversations` — 对话会话

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | integer PK | 自增 |
| `userKey` | text, notNull | 管理员标识 |
| `title` | text, notNull, default '新对话' | 会话标题 |
| `modelId` | text, notNull | 当前使用的模型 |
| `systemPrompt` | text, default '' | 系统提示词 |
| `params` | text(json) | 模型参数，如 `{ reasoningEffort: "high" }` |
| `messages` | text(json) | 消息数组 `[{role, content, createdAt}]` |
| `createdAt` | integer(timestamp_ms) | |
| `updatedAt` | integer(timestamp_ms) | |

### 初始模型数据

通过 seed 脚本写入：

**OpenAI 兼容协议（`provider: openai-compatible`）：**
- `gpt-5.4`（chat）
- `gpt-5.5`（chat）
- `gpt-5.6-sol`（chat）
- `deepseek-v4-pro`（chat）
- `deepseek-v4-flash`（chat）
- `glm-5.2`（chat）
- `kimi-k2-7-code`（reasoning，支持 `reasoning.mode` 参数）
- `gpt-image-2`（image，第二期启用）

**Anthropic 协议（`provider: anthropic`）：**
- `claude-opus-4.6`（chat）
- `claude-opus-4.7`（chat）
- `claude-opus-4.8`（chat）
- `claude-opus-5`（chat）
- `claude-sonnet-4.6`（chat）
- `claude-sonnet-5`（chat）

MVP 前端只展示 `category != 'image'` 的模型。

## 5. 后端 API 设计

所有路由注册在 `protectedApi`（需认证）下，前缀 `/api/ai-platform`。

### 5.1 模型库管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai-platform/models` | 获取所有启用的模型（按 category 分组返回） |
| POST | `/api/ai-platform/models` | 新增模型 |
| PUT | `/api/ai-platform/models/:id` | 编辑模型 |
| DELETE | `/api/ai-platform/models/:id` | 删除模型 |

GET 返回结构：
```json
{
  "chat": [{ "modelId": "claude-opus-5", "displayName": "Claude Opus 5", "vendor": "anthropic", "capabilities": ["streaming"] }],
  "reasoning": [ ... ],
  "image": [ ... ]
}
```

### 5.2 会话管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai-platform/conversations` | 列出当前用户的所有会话（按 updatedAt 降序，不含 messages 全文） |
| POST | `/api/ai-platform/conversations` | 新建会话（返回带 id 的空会话） |
| GET | `/api/ai-platform/conversations/:id` | 获取单个会话完整内容（含 messages） |
| PUT | `/api/ai-platform/conversations/:id` | 更新会话（title / modelId / systemPrompt / params / messages） |
| DELETE | `/api/ai-platform/conversations/:id` | 删除会话 |

### 5.3 对话代理（核心）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai-platform/chat` | 流式对话代理 |

请求体：
```json
{
  "modelId": "claude-opus-5",
  "messages": [{ "role": "user", "content": "你好" }],
  "system": "You are a helpful assistant.",
  "params": { "reasoningEffort": "high" }
}
```

后端逻辑：
1. 从 DB 查 `modelId` 对应的 `provider` 字段
2. 根据 provider 组装请求：
   - `openai-compatible` → POST `{baseUrl}/openai-compatible/v1/chat/completions`，Header `Authorization: Bearer {appId}:{appKey}`，Body 含 `stream: true`、`reasoning_effort`（如有）
   - `anthropic` → POST `{baseUrl}/v1/messages`，Header `Authorization: Bearer {appId}:{appKey}`，Body 含 `max_tokens`、`stream: true`
3. 透传上游 SSE 流给浏览器

### 5.4 SSE 协议统一转换

后端把两种协议的 SSE 响应统一转换成 **OpenAI 格式**输出：

```
data: {"choices":[{"delta":{"content":"..."}}]}
data: [DONE]
```

这样前端只需写一套 SSE 解析逻辑，不因模型切换而变。错误统一为非流式 JSON `{ "error": "..." }` 返回。

## 6. 环境变量

`.env` 新增：
```
TAL_MLOPS_APP_ID=300000636
TAL_MLOPS_APP_KEY=0d0c4f8da50fb9c9dd4296207ba6cdb5
TAL_AI_BASE_URL=http://ai-service.tal.com
```

凭证只在服务端使用，前端永远不接触。

## 7. 前端设计

### 7.1 布局：三栏式

```
┌──────────┬─────────────────────────┬──────────┐
│          │  顶部栏(模型选择器+操作)  │          │
│  会话列表  ├─────────────────────────┤  参数面板  │
│          │                         │ (可折叠)  │
│  搜索框   │     对话消息流            │          │
│          │                         │ reasoning │
│  分组:    │     (流式光标动画)        │ max_tokens│
│  今天     │                         │ system   │
│  昨天     │                         │ prompt   │
│  7天内    ├─────────────────────────┤          │
│          │  输入框 + 工具栏 + 发送    │          │
└──────────┴─────────────────────────┴──────────┘
```

- 左侧：264px 会话列表 + 搜索 + 按时间分组
- 中间：顶部模型选择器、对话消息流、底部输入框
- 右侧：300px 可折叠参数面板（reasoning pills、滑块、system prompt 编辑器）

### 7.2 视觉风格

参考 DeepSeek 官网 + 项目现有 token 系统：

- **背景**：近黑 `#0a0a0a`（暗色模式），深色表面层级 `#111113`、`#18181b`
- **玻璃面板**：白色 4-7% 叠加 + `backdrop-filter: blur(16px) saturate(125%)`
- **渐变边框**：1px `linear-gradient(135deg, accent, transparent 50%)`，仅用于输入框聚焦、模型选择器等关键元素
- **强调色**：teal `#2dd4bf`（项目现有），发光效果 `box-shadow: 0 0 12px rgba(45,212,191,0.22)`
- **字体**：DM Sans（与 DeepSeek 一致）+ JetBrains Mono（代码/参数）
- **圆角**：10px / 14px / 18px / 9999px（pill）
- **缓动**：`cubic-bezier(0.16,1,0.3,1)`（premium 感）

### 7.3 交互细节

- **模型选择器**：pill 样式 + 脉冲指示灯（`animation: pulse 2.5s`），点击展开下拉
- **流式消息**：光标 `blink` 动画，逐 token 渲染
- **消息操作栏**：hover 时 `opacity: 0→1`，复制/重新生成/编辑
- **输入框聚焦**：渐变边框淡入 + teal 光晕 `box-shadow: 0 0 0 3px accent-tint`
- **右侧面板**：`width: 0 → 300px` 过渡动画，内部内容延迟淡入
- **会话列表项**：hover 背景 + active 状态左侧 teal 指示点
- **空状态**：居中 icon + 标题 + 建议卡片网格（点击填充输入框）

### 7.4 组件结构

```
src/ai-platform/
├── AiPlatformView.vue        # 全屏页面入口，三栏布局容器
├── components/
│   ├── ConversationSidebar.vue   # 左侧会话列表
│   ├── ChatArea.vue              # 中间对话区
│   ├── ModelSelector.vue         # 顶部模型选择下拉
│   ├── MessageBubble.vue         # 单条消息（角色头像+内容+操作栏）
│   ├── Composer.vue              # 底部输入框+工具栏+发送
│   └── ParameterPanel.vue        # 右侧参数面板
├── composables/
│   ├── useModels.ts              # 模型列表加载与缓存
│   ├── useConversations.ts       # 会话 CRUD
│   └── useChat.ts               # 流式对话核心逻辑(SSE 解析+AbortController)
└── types.ts                     # 类型定义
```

## 8. 错误处理

- **上游 API 错误**：后端捕获上游非 200 响应，统一返回 `{ "error": "..." }` JSON（非流式）
- **模型不可用**：前端在模型选择器中标记 disabled 模型，点击时显示 toast 提示
- **网络中断**：前端 `AbortController` 中止请求，保留已接收的部分消息
- **SSE 解析错误**：忽略不完整 JSON 块（沿用 `learn/ai.ts` 的 `flushBlock` 模式），等待后续数据补全

## 9. 扩展点（为第二期预留）

- **图像生成**：`gpt-image-2` 已入库，第二期在模型选择器中展示 `category: image` 模型，触发不同的 UI（prompt → 图片展示）
- **Agent 工具**：后端代理层可扩展工具调用（function calling），前端可扩展多步骤执行展示
- **更多 provider**：`provider` 字段可扩展新协议类型，只需在后端代理层增加一个分支
