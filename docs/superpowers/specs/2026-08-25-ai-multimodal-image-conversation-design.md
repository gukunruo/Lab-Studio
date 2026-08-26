# AI Playground Gemini 多模态创作对话设计

> 日期：2026-08-25
> 状态：已实现

## 实现结果

- `POST /api/ai-platform/images/generations` 仅承载 `gpt-image-2` 的生成与私有参考图编辑；携带受控参考图时，服务端使用图像编辑契约。
- `POST /api/ai-platform/images/gemini` 承载 Gemini 创作请求，并规范化为文字与可选受控图片路径；纯文字响应按成功处理。
- 会话通过 `gemini-multimodal-user` 与 `gemini-multimodal-assistant` 两类结构化消息保存 Gemini 创作过程。普通聊天上游只接收文本消息。
- Composer 分为聊天、GPT 图片工具、Gemini 创作三个模式；三者均使用 `Enter` 发送、`Shift + Enter` 换行，图片模式可用 `Escape` 退出并保留各自草稿。
- 当前会话最近一张已完成的受控图片默认作为参考图。用户可以明确选择历史结果或移除参考图，移除后不会在同一会话中自动恢复。
- 已执行图片、Composer、聊天流与代理契约测试，以及 TypeScript 检查、生产构建和差异空白检查。浏览器已验证图片工具入口、Gemini 模式切换、草稿退出与多行输入扩展；真实模型调用仍由受控 API 契约测试覆盖，未在验收期间重复发起消耗型请求。

## 1. 目标

将 `gemini-3-pro-image` 从“纯文生图模型”调整为会话内的多模态创作模型：用户以自然语言连续对话，模型可返回文字、图片或文字加图片；用户可以基于最近一张已生成图片继续提出“优化一下”等指令。

`gpt-image-2` 保持为明确的图片工具：文生图和图生图。两种体验共用现有 AI Playground 会话、图片资产权限与历史记录，不创建独立工作台。

## 2. 已确认事实与问题根因

- `gemini-3-pro-image` 经 TAL 的 `chat/completions` 接口调用，`modalities` 为 `['text', 'image']`。
- 该模型可以只返回文字、只返回图片，或同时返回文字和图片；`modalities` 不保证每次都生成图片。
- 当前图片生成请求只提交 `modelId`、`prompt`、`aspectRatio`，不会提交之前的图片或会话上下文。
- 因此在 GPT 图片之后用 Gemini 输入“优化一下”时，Gemini 无从得知目标图片，正常地只返回文字；现有纯生图路由把“成功但没有图片”误判为无效图片响应。
- 当前普通聊天 Composer 已是 `Enter` 发送、`Shift + Enter` 换行；本设计将此规则统一到 Gemini 创作和 GPT 图片工具输入。

## 3. 交互设计

### 3.1 Composer 中的两种图片体验

图片入口保留在 Composer，不进入普通聊天模型选择器。

| 选择的模型 | 体验 | 发送结果 |
| --- | --- | --- |
| `GPT-Image-2` | 图片工具 | 每次发送要求产生或编辑一张图片 |
| `Gemini 3 Pro Image` | 多模态创作对话 | 每次发送可以得到文字、图片，或两者 |

选择 Gemini 后，模式条文案变为“Gemini 创作对话”，输入框采用普通对话视觉与输入方式，而不是“必须生成图片”的工具界面。模式条展示当前参考图状态：

- 有可用参考图时显示“基于上一张图片”；
- 用户可点击移除，让下一条变为没有图片上下文的纯创作对话；
- 没有可用参考图时不显示占位或虚假的附件状态；
- 新生成的成功图片自动成为下一轮的默认参考图。

不在第一期提供历史图片选择器、多图上下文、文件上传或图像编辑遮罩。

### 3.2 输入与快捷键

所有 Composer 输入模式使用同一规则：

- `Enter`：发送当前内容；在 GPT 图片工具中即生成/编辑图片。
- `Shift + Enter`：插入换行。
- `Escape`：退出图片/创作模式并保留草稿。

聊天草稿、GPT 图片草稿和 Gemini 创作草稿彼此独立。输入框仍自动增长至 160px，超出后显示内部滚动条。

### 3.3 Gemini 结果呈现

Gemini 的一轮创作会作为一条用户消息和一条多模态助手消息加入会话。

- **只返回文字**：渲染为普通助手文本，属于成功结果，不出现图片错误提示。
- **只返回图片**：渲染专用图片卡片。
- **文字加图片**：同一条助手结果先显示文字，再显示图片卡片，保持一次请求对应一次回答。
- **无文字且无有效图片**：显示安全的“本次创作未返回可展示内容，请修改描述后重试。”错误。

图片卡片保留下载、重试和“基于此图继续”操作。“基于此图继续”将该图设为当前 Composer 的参考图，并切换到 Gemini 创作对话；不会立即发起请求。

### 3.4 GPT 图片工具结果呈现

GPT 仍然要求图片结果。存在参考图时，发送行为是“编辑这张图”；没有参考图时是“根据描述生成图片”。结果卡片和历史记录沿用现有图片请求/结果样式。

## 4. 上下文和安全边界

### 4.1 默认上下文策略

图片创作只默认带入**当前会话中最近一张已完成、受控存储的图片**。普通文本会话历史不自动拼接到图片请求；用户的当前输入是该轮的唯一文字指令。

这样可以让“优化一下”“把背景改成蓝色”等短指令有明确对象，同时避免把长会话、多张图片或无关内容送到上游造成语义混乱与成本上升。

### 4.2 服务端图片引用

浏览器保存和展示的仍然只能是受认证同源的 `/api/ai-platform/images/<uuid>` 路径。服务端在需要将参考图提交给上游时：

1. 从 `ai_image_assets` 根据当前用户和 UUID 读取私有二进制；归属不符、文件缺失或非法 ID 不可作为参考图。
2. Gemini 请求中仅在服务端内存内转换为其已验证可接受的 `data:image/<type>;base64,...` 输入。
3. GPT 图生图请求使用 `/openai-compatible/v1/images/edits`，以 multipart `image` 文件字段传入同一私有二进制。
4. 二进制、临时 base64、上游 URL、认证头和凭证不进入浏览器、会话 JSON、日志、错误文案、测试快照或仓库。

外部 HTTPS 图片不能作为参考图：服务端不抓取任意 URL，避免 SSRF 和权限绕过。若历史结果为非受控外部 URL，界面不提供“基于此图继续”。

### 4.3 Gemini 上游契约

无参考图时，请求保持已确认的单条用户文本消息与 `modalities: ['text', 'image']`。

有参考图时，用户消息的 `content` 改为有序数组：先放当前文本，再放受控的 `image_url` 数据 URI。服务端仅接受并归一化模型返回的文字与通过既有 PNG/JPEG/WebP、大小上限校验的图片；图片继续私有落盘。

### 4.4 GPT 上游契约

无参考图时继续使用 `/images/generations` 与 `{ model, prompt }`。

有参考图时使用已确认的 `/images/edits` multipart 契约，包含 `model`、`prompt` 和由私有资产构造的单张 `image` 文件。不会猜测未确认的尺寸、比例或其他厂商扩展字段。

## 5. 数据与 API 边界

### 5.1 消息模型

现有 `ImageRequestMessage` / `ImageResultMessage` 保持兼容，用于 GPT 图片工具历史。新增明确的 Gemini 多模态消息类型，持久化在既有 `ai_conversations.messages` JSON 中：

```ts
type GeminiMultimodalUserMessage = {
  type: 'gemini-multimodal-user'
  role: 'user'
  requestId: string
  content: string
  referenceImageId?: string
  createdAt: string
}

type GeminiMultimodalAssistantMessage = {
  type: 'gemini-multimodal-assistant'
  role: 'assistant'
  requestId: string
  content: string
  status: 'generating' | 'completed' | 'error' | 'cancelled'
  imageUrl?: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
}
```

`referenceImageId` 仅保存受控资源 UUID，不保存 base64、数据 URI 或外部图片地址。普通 `/chat` 上游仍然只接收 `TextMessage`，不会意外收到图片消息或多模态消息。

### 5.2 专用 API

保留现有纯图片生成路由，并新增或扩展受认证的多模态创作路由。请求明确区分：

```ts
type GeminiMultimodalRequest = {
  prompt: string
  referenceImageId?: string
}
```

服务端通过当前用户权限解析可选参考图，不相信浏览器提供的任意图片 URL 或 data URI。响应返回经过规范化的 `content` 与可选受控 `imageUrl`，并将“文字但无图片”作为 200 成功。

## 6. 并发、失败与恢复

- Gemini 创作与 GPT 图片工具共享“单个图片/创作请求进行中”的会话级限制。
- 每个请求使用独立 `requestId` 与 generation 计数；取消、切换会话、卸载后到达的结果不得写进其他会话。
- 文本成功但没有图片不是错误；上游非 2xx、缺少任何可展示内容、图片解码失败或参考图不属于当前用户才是错误。
- 重试保留原模型、提示词和参考图 ID；当参考图已不存在或无权访问时，结果提示用户重新选择一张图片，而不是回退到未知图片。

## 7. 验收标准

1. Gemini 创作模式中，`Enter` 发送、`Shift + Enter` 换行；GPT 图片工具也遵循相同规则。
2. Gemini 没有参考图时，纯文本回答正常呈现，不显示“图片生成失败”。
3. 使用 GPT 生成一张受控图片后，切换到 Gemini 输入“优化一下”，请求会携带该私有图片并得到文字、图片或两者的成功结果。
4. 使用 Gemini 生成一张受控图片后，切换到 GPT 输入编辑指令，服务端走 GPT 图生图契约并使用私有参考图。
5. “基于此图继续”明确选中目标图片；移除参考图后不再提交图片。
6. 参考图的所有权、非法 UUID、丢失文件、非受控外部 URL 均不能绕过服务端访问边界。
7. 图片、base64、数据 URI、上游 URL、认证头和凭证不出现在浏览器响应、会话 JSON、日志、仓库或测试快照中。
8. 覆盖 Gemini 文本/图片/图文响应、GPT 图生图请求构造、上下文权限检查、取消与迟到响应、Composer 键盘交互的自动化测试；并通过类型检查、生产构建和浏览器验收。
