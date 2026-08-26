# AI Playground 输入区与文生图设计

> 日期：2026-08-24
> 方案：Composer 生图模式（方案 A）

## 1. 目标与范围

### 目标

提升 AI Playground 底部输入区的长文本输入体验，并在不混淆普通聊天与图片生成语义的前提下，接入 `gpt-image-2` 与 `gemini-3-pro-image` 的第一期文生图能力，其中 `gpt-image-2` 为默认模型。

### 第一期开启范围

- Composer 文本区随内容自动扩展，达到上限后才出现内部滚动。
- Composer 工具栏提供明确的“生图”入口，切换到图像生成模式。
- Composer 生图模式可选择已登记的 `gpt-image-2` 与 `gemini-3-pro-image`，默认 `gpt-image-2`。
- 会话保留 `1:1`、`16:9`、`9:16` 的比例元数据；在未取得两家模型明确的比例请求映射前，界面不展示不可生效的比例选择器，也不向上游猜测 `size` 或比例字段。
- 在当前会话中持久化生成请求、生成中状态、结果、失败状态与原参数。
- 图片结果卡片支持下载、重新生成、取消生成和使用原参数重试。
- 新增独立的受认证图片生成 API；不复用普通聊天 SSE 接口。
- 在服务端为 TAL OpenAI-compatible 网关建立可替换的图片请求/响应适配层、图片资产持久化层与契约测试。

### 第一期开启范围外

本文保留 2026-08-24 第一阶段的历史设计。后续已在 [AI Playground Gemini 多模态创作对话设计](2026-08-25-ai-multimodal-image-conversation-design.md) 中实现单张私有参考图、GPT 图像编辑和 Gemini 多模态创作会话；该后续实现不改变本阶段当时的范围判断。

仍不包含：

- 多图批量生成、独立图片图库、图片模型选择器与独立生图工作台。
- 历史图片选择器、浏览器上传、外部 URL 拉取、局部重绘或图片编辑遮罩。
- 将图片或结构化多模态消息自动发送到普通聊天模型。
- 在浏览器暴露任何上游地址、应用凭证、认证头或原始上游错误。

## 2. 产品交互

### 2.1 模式入口和退出

普通聊天模型选择器继续只展示 `chat` 和 `reasoning` 分类，图片模型不进入该选择器。Composer 工具栏新增带 tooltip 和可访问名称的生图按钮。

点击生图按钮后，Composer 切换为图像生成模式：

- 顶部出现轻量模式条，显示“生图”和图片模型选择；默认 `GPT-Image-2`，可切换至 `Gemini 3 Pro Image`。
- 输入框 placeholder 改为“描述你想生成的图片”，同时显示当前图片模型。
- 不展示比例选择器，避免出现无法传递到上游的伪控制项；请求仍保存默认 `1:1` 比例元数据。
- 主操作改为“生成图片”。
- 点击模式条的“退出生图”、再次点击工具栏入口或按 `Escape` 返回普通聊天模式。
- 两个模式分别保留其未发送文本；切换不创建消息、不修改当前普通聊天模型。

普通聊天保持 `Enter` 发送、`Shift + Enter` 换行。生图模式以 `Command/Ctrl + Enter` 触发生成，普通 `Enter` 仅换行，避免长描述意外提交。

### 2.2 文本输入的高度与滚动

文本模式和生图模式复用同一套自动高度机制：

- 保持当前单行输入时的视觉高度。
- 内容增长时，textarea 根据 `scrollHeight` 自动增加高度。
- 可见文本区最大高度固定为 **160px**，约为 7 行 14px、`line-height: 1.6` 的文本。
- 达到 160px 后，textarea 使用 `overflow-y: auto`；未达到上限时不显示滚动条。
- 滚动条采用与消息区相同的细窄风格：6px、透明轨道、圆角 thumb，悬停时仅提高对比度。
- 文本区尺寸变化必须同步通知聊天区。回到底部按钮的位置基于 Composer 实际渲染高度计算，不允许使用固定 `--composer-height`，从而避免与扩展的输入框重叠。
- 生图模式下，描述文本区可以滚动，模型选择和生成按钮保持可见和可操作。

### 2.3 生成、取消、失败与重试

一次仅允许一个图片生成请求。发起生成时：

1. 立即将一条用户图像请求消息写入当前会话，包含 prompt、图片模型、比例和创建时间。
2. 紧随其后写入一条处于 `generating` 状态的图片结果消息，并持久化。
3. Composer 禁用生成按钮，展示取消按钮；普通聊天发送也禁用，避免同一会话的状态竞态。
4. 消息区自动滚动到底部，结果卡片展示活动标识和“正在生成图像”。不呈现无法验证的百分比或剩余时间。

用户点击取消时，前端中止请求；若服务端仍完成上游请求，前端不采纳其结果。结果消息转为 `cancelled`，保留原 prompt、模型和比例，允许重新生成。

请求失败时，结果消息转为 `error`，使用安全、面向用户的失败说明；保留原参数。卡片提供：

- “使用原设置重试”：创建一条新的生成请求和新的结果消息；不覆盖历史失败或成功图片。
- “返回编辑”：将 prompt、图片模型和比例元数据恢复到生图 Composer，用户可修改后再次生成。

### 2.4 图片结果消息卡片

图片不经过 Markdown 渲染。每条图片结果使用专用 `ImageMessageCard`，仅处理结构化、经过验证的图片数据。

成功卡片包含：

- 依据原比例显示的图片预览，加载失败时显示本地错误占位而非破损图片。
- 图片模型、保存的比例元数据和生成时间。
- “下载”操作：基于已验证的图片 URL 或服务端安全下载路径，避免未验证 URL 的导航。
- “再生成”操作：复用当前图片请求参数，并创建新的独立结果消息。

图片消息的 hover 操作不复用普通文本消息的复制、编辑、分支或 Markdown 重新生成逻辑。

## 3. 数据模型和持久化

### 3.1 消息联合类型

现有 `ChatMessage` 从只含文本的模型扩展为可区分的联合类型，继续存储在 `ai_conversations.messages` JSON 内，以避免第一期新增独立图片会话或图库表。

逻辑类型如下：

```ts
type TextMessage = {
  type?: 'text'
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  status?: 'error' | 'interrupted'
}

type ImageRequestMessage = {
  type: 'image-request'
  role: 'user'
  prompt: string
  modelId: 'gpt-image-2' | 'gemini-3-pro-image'
  aspectRatio: '1:1' | '16:9' | '9:16'
  createdAt: string
}

type ImageResultMessage = {
  type: 'image-result'
  role: 'assistant'
  requestId: string
  modelId: 'gpt-image-2' | 'gemini-3-pro-image'
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16'
  status: 'generating' | 'completed' | 'error' | 'cancelled'
  imageUrl?: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

type ChatMessage = TextMessage | ImageRequestMessage | ImageResultMessage
```

`TextMessage.type` 缺省时视为现有文本消息，保证已存储的会话可读取。只有 `TextMessage` 会发送给普通 `/chat` 上游；图片消息不进入摘要、文本重试、编辑或对话模型 prompt。

### 3.2 会话标题和消息限制

图片请求消息使用 prompt 参与新会话标题的生成，保持与普通用户消息一致的可发现性。图片结果消息不改变标题。会话的 500 条消息上限维持不变；每张图片产生两条消息，达到上限时按现有更新校验拒绝继续写入。

## 4. API 与网关适配

### 4.1 前端 API

新增非流式客户端函数：

```ts
generateImage(input: {
  modelId: 'gpt-image-2' | 'gemini-3-pro-image'
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16'
  signal: AbortSignal
}): Promise<{
  imageUrl: string
  modelId: 'gpt-image-2' | 'gemini-3-pro-image'
}>
```

它只调用受认证路由并接收应用规范化 JSON，不解析上游响应、不拼接上游 URL。

新增 `useImageGeneration()` composable，独立于 `useChat()` 的 SSE、首 token 和中断状态。它持有单个 `AbortController` 和 `generating` 状态，提供 `generate()` 与 `abort()`。

### 4.2 服务端路由

新增：

```text
POST /api/ai-platform/images/generations
```

请求体：

```json
{
  "modelId": "gpt-image-2",
  "prompt": "一只在雨夜咖啡馆写代码的橘猫，电影感",
  "aspectRatio": "1:1"
}
```

路由规则：

1. 验证 `modelId` 对应数据库记录存在、已启用、`category === 'image'`，并且只允许 `gpt-image-2` 或 `gemini-3-pro-image`。
2. 验证 prompt 为非空字符串，去除首尾空白后最大 2,000 字符；比例仅接受三个固定元数据值。
3. 读取 TAL 凭证仅限服务端环境变量；不在响应、日志、测试快照或异常字符串中输出它们。
4. 通过纯函数 `buildImageGenerationRequest()` 按模型构造已确认的 TAL 请求：GPT 使用 `/openai-compatible/v1/images/generations` 与 `{ model, prompt }`；Gemini 使用 `/openai-compatible/v1/chat/completions` 与 `{ model, messages, modalities: ['text', 'image'] }`。
5. 未取得明确比例映射前，`aspectRatio` 不传递到上游，避免猜测 GPT `size` 或 Gemini 图片配置字段。
6. 上游非 2xx、超时或不可解析响应均归一为安全错误码与用户文案；不回传上游 body。
7. 上游 HTTPS URL 仅在通过 `https:` 校验时原样返回。GPT 已验证的 `data[0].b64_json` 成功响应必须在服务端严格解码、校验图片魔数和 8 MiB 字节上限，落盘到 gitignored 数据目录，并只返回应用受控的资源路径。

### 4.3 图片资产与受控读取

`b64_json` 仅在服务端内存中短暂存在，绝不写入会话 JSON、浏览器响应、日志、测试快照或文档。服务端对 PNG、JPEG、WebP 的文件签名进行验证后：

1. 使用随机 UUID 作为资源 ID，并以 `wx` 和 `0600` 权限写入专用资产目录；默认目录与 SQLite 数据库同级的 `data/ai-images`，可由 `AI_IMAGE_ASSET_DIR` 覆盖。
2. 在 `ai_image_assets` 中仅保存资源 ID、所属用户、MIME 类型、扩展名、字节数和创建时间；数据库写入失败时删除刚写入的文件。
3. 将成功响应归一为 `/api/ai-platform/images/<uuid>`，会话中的 `imageUrl` 只保存这一受控路径或已验证的外部 HTTPS URL。
4. 通过受认证的 `GET /api/ai-platform/images/:id` 提供二进制内容。路由按资源所属用户读取，不存在、文件缺失、ID 非法或归属不符均返回 404；响应包含实际 `Content-Type`、`Cache-Control: private` 和 `X-Content-Type-Options: nosniff`。

前端仅允许精确匹配 `/api/ai-platform/images/<uuid>` 的同源路径，或严格的 `https:` URL；拒绝 `data:`、`http:`、任意相对路径和非法 UUID。

### 4.4 契约验证门槛

已确认的 TAL OpenAI-compatible 请求契约为：`gpt-image-2` 使用图片生成 endpoint 和 `{ model, prompt }`；`gemini-3-pro-image` 使用 chat-completions endpoint、单条用户消息与 `modalities: ['text', 'image']`。GPT 实际成功响应已经验证为 `data[0].b64_json`，并按上述资产链路安全处理。尚未确认的是两者的比例/尺寸映射、Gemini 的准确成功响应形态、URL 有效期及是否必然返回 HTTPS URL；不得猜测 Gemini 的图片字段或将其假定为 GPT 的 `b64_json` 格式。

仅在已授权的受控环境中确认实际网关响应。验证不得在浏览器执行；不得输出、记录或提交应用凭证、请求认证头、上游原始响应、图片 base64 或完整环境变量。若实际响应不符合已支持的安全形态，停留在 adapter 层报告差异，不以猜测替代事实。

## 5. 组件职责

| 组件 / 模块 | 职责 |
| --- | --- |
| `Composer.vue` | 管理文字/生图模式、两个草稿、默认图片模型、160px 自动高度、键盘交互和可访问标签；只发出动作，不调用 API。 |
| `ChatArea.vue` | 编排文字聊天和图片生成，创建/更新图片消息、自动滚动、取消和结果卡片事件；禁止把图片消息传入 `useChat()`。 |
| `MessageBubble.vue` | 继续负责文本消息；遇到图片消息时分派给 `ImageMessageCard`，不使用 Markdown 处理图片。 |
| `ImageMessageCard.vue` | 仅渲染结构化图片请求/结果的 generating、completed、error、cancelled 状态与下载/重试/编辑事件。 |
| `useImageGeneration.ts` | 非流式图片请求与取消生命周期。 |
| `api.ts` | `generateImage()` 的 JSON 传输和响应校验。 |
| `server/ai-platform.ts` 或专用图片模块 | 图片输入验证、数据库模型检查、上游 adapter 调用和安全错误归一。 |

## 6. 可访问性与视觉要求

- 生图入口、退出、模型选择、生成、取消、下载和重试均使用真实控件，有清晰的中文 `aria-label`、键盘焦点和 disabled 状态。
- 模式变化使用适度的 `aria-live` 提示，例如“已切换到图像生成模式”；不对每个视觉动画广播。
- 生成中的图片卡片使用 `aria-busy`；失败状态使用 `role="alert"`。
- 所有 UI 颜色使用既有 AI Playground token，浅色与深色主题都保持足够边界和文字对比度。模式条为轻量强调，不得与错误色混淆。
- 图片使用 prompt 的简短派生描述作为 `alt`；无法生成准确描述时使用“根据提示词生成的图像”。

## 7. 错误与并发规则

- 在生成中发起新图、普通聊天、会话切换或页面卸载时，必须取消或使当前图片请求结果失效。
- 每次生成使用唯一 `requestId`；结果只能更新与该 ID 匹配且仍处于 `generating` 的消息。
- 切换会话后迟到的响应不得写入新会话。
- 失败、取消、HTTP 非 2xx、空响应和无效图片 URL 都需有自动化覆盖。
- 图片 URL 只能是严格的 `https:` URL，或精确匹配 `/api/ai-platform/images/<uuid>` 的受控同源路径；拒绝 `data:`、`http:`、任意其他相对路径和非法 UUID。图片 base64 不得进入会话、浏览器或 `img.src`。

## 8. 验收标准

### Composer

- 单行输入的视觉高度与改动前一致。
- 超过一行后输入区平滑扩展，最多 160px；超过上限后出现细窄内部滚动条。
- Composer 展开、收起、切换生图模式和窗口调整时，“跳转到最新消息”按钮不遮挡输入区。
- 文字模式的 Enter/Shift+Enter 行为不回归；生图模式的 Command/Ctrl+Enter 与 Enter 行为符合设计。

### 文生图

- 用户可从 Composer 进入和退出生图模式，两个模式草稿互不丢失。
- 用户可选择 `gpt-image-2` 或 `gemini-3-pro-image`，默认 `gpt-image-2`，并完成一次文生图请求。
- 每次生成在当前会话产生一条请求消息和一条结果消息；刷新后仍可读取、展示和下载成功图片。
- 生成中可取消；取消、失败和成功都不覆盖历史图片。
- 重试与再生成均使用原参数创建新结果；“返回编辑”恢复原参数而不自动请求。
- `gpt-image-2` 不出现在普通聊天模型选择器中，图片消息不会发送到 `/api/ai-platform/chat`。
- 未授权、超时、上游错误、无效上游响应和无效图片 URL 都显示安全的用户提示，且不泄露凭证或内部响应。

### 验证

- 对 adapter、路由输入校验、图片消息状态转换、并发失效、前端响应校验和 Composer 自动高度编写 focused 测试。
- 执行相关 `node:test` 测试、`pnpm type-check`、`pnpm build-only`、`git diff --check`。
- 启动当前主目录的开发服务，在浏览器验证浅色和深色主题下的普通文字对话、生图成功、取消和失败路径。
