# AI Composer 与文生图实施记录

**目标：** 为 AI Playground 提供 160px 自适应 Composer，以及 `gpt-image-2`（默认）与 `gemini-3-pro-image` 的第一期文生图模式。

**架构：** Composer 仅管理模式、双草稿与用户操作；`ChatArea` 管理图片会话消息和请求生命周期。图片请求使用独立受认证 JSON API，不复用普通聊天 SSE。GPT 的 base64 成功结果只在服务端短暂处理并转化为受认证同源图片资源。

**技术栈：** Vue 3、Pinia、Hono、Drizzle ORM + SQLite、`node:test`、Vite、SCSS。

## 已确认的网关契约

- `gpt-image-2`：`POST /openai-compatible/v1/images/generations`，请求体仅为 `{ model, prompt }`。
- `gemini-3-pro-image`：`POST /openai-compatible/v1/chat/completions`，请求体为单条用户消息及 `modalities: ['text', 'image']`。
- 图片比例仅保留为 `1:1`、`16:9`、`9:16` 会话元数据；当前不传递到上游，也不在 Composer 展示无法确认生效的比例控制。
- 已实际验证 GPT 成功响应使用 `data[0].b64_json`，不是仅有 HTTPS URL 的形态。
- Gemini 的实际成功图片响应结构尚未确认；不能将其假定为 GPT 的 base64 形态，也不能猜测图片尺寸或专有参数。

## 全局约束

- 所有改动直接在当前 `main` 工作目录完成；不创建 worktree，不覆盖或清理既有未提交改动。
- 图片模型不会进入普通聊天模型选择器，图片消息不会进入 `/api/ai-platform/chat`。
- 图片接口是受认证的独立 JSON API，不能复用普通聊天 SSE。
- TAL 凭证、认证头、完整环境变量、上游原始错误、上游内部地址、图片 base64 和实际图片产物都不得进入浏览器响应、日志、测试快照、文档或提交。
- 第一期仅包含文生图，不包括参考图、图生图、局部重绘、批量生成、独立图库或独立工作台。

## 已完成实现

### Composer 与会话交互

- Composer 的聊天与生图模式维护独立草稿。
- 普通聊天保持 `Enter` 发送、`Shift + Enter` 换行。
- 生图模式使用 `Command/Ctrl + Enter` 生成，普通 `Enter` 只换行，`Escape` 退出并保留生图草稿。
- 默认图片模型为 `gpt-image-2`，`gemini-3-pro-image` 仅可在生图模式中选择。
- textarea 随 `scrollHeight` 增高，最大可见高度固定为 **160px**；超过后才启用细窄、低对比度的内部滚动条。
- `ResizeObserver` 将 Composer 实际高度写入 `--composer-height`，跳到最新消息按钮使用该值定位，避免与扩展输入区重叠。
- 图片请求和结果使用结构化 `ChatMessage` 联合类型持久化；普通聊天上游仅接收文本消息。
- 图片请求有唯一 `requestId`，取消、切换会话、卸载和迟到回调均受 generation 与会话 key 防护。

### 受控图片资源链路

GPT 的 `b64_json` 不会被转发给浏览器。服务端执行以下步骤：

1. 严格验证 base64 格式和最大编码长度。
2. 解码后限制图片二进制最大 **8 MiB**，并验证 PNG、JPEG 或 WebP 文件签名。
3. 以随机 UUID 和 `wx` / `0600` 写入私有资产目录；默认位置为 SQLite 数据文件同级的 `data/ai-images`，可用 `AI_IMAGE_ASSET_DIR` 覆盖。
4. 在 `ai_image_assets` 中仅保存资源 ID、用户归属、MIME、扩展名、字节数与创建时间。数据库写入失败时删除刚创建的文件。
5. 将结果转为 `/api/ai-platform/images/<uuid>`，并只把该受控路径写入会话 JSON。
6. 通过受认证的 `GET /api/ai-platform/images/:id` 提供资源；资源 ID 非法、不存在、文件缺失或用户归属不符一律返回 404。成功响应包含真实 `Content-Type`、`Cache-Control: private` 与 `X-Content-Type-Options: nosniff`。

前端仅接受两种图片 URL：严格的 `https:` URL，或精确匹配 `/api/ai-platform/images/<uuid>` 的受控同源路径。拒绝 `data:`、`http:`、任意其他相对路径和非法 UUID。

## 关键文件

| 路径 | 责任 |
| --- | --- |
| `src/ai-platform/types.ts` | 定义文本、图片请求、图片结果的结构化消息联合类型。 |
| `src/ai-platform/composer.ts` | 提供 160px 高度和图片快捷键的纯逻辑。 |
| `src/ai-platform/components/Composer.vue` | 管理聊天/生图模式、双草稿、模型选择和键盘交互。 |
| `src/ai-platform/components/ChatArea.vue` | 编排图片状态、取消、失效、滚动及会话更新。 |
| `src/ai-platform/components/ImageMessageCard.vue` | 安全渲染图片消息状态和下载链接。 |
| `src/ai-platform/api.ts` | 调用图片 API，并验证受控路径或 HTTPS 图片 URL。 |
| `server/ai-platform.ts` | 构造图片上游请求、归一响应、注册生成与读取路由。 |
| `server/ai-image-assets.ts` | 解码、验证、落盘和读取私有图片资产。 |
| `server/db/schema.ts` | 定义 `ai_image_assets` 元数据表。 |
| `server/db/migrations/0016_add_ai_image_assets.sql` | 创建图片资产表。 |
| `tests/ai-platform-images.test.ts` | 覆盖客户端 URL 白名单、上游适配、base64 校验和资源路径构造。 |

## 已验证结果

- 本地迁移已成功应用。
- GPT-Image-2 已在浏览器进行真实生成验证。
- 页面最终展示“图片已生成”，浏览器实际加载受认证同源 `/api/ai-platform/images/<uuid>` 资源；下载链接也使用该资源。
- 图片预览成功加载且得到非零自然宽高，证明浏览器未使用 data URL、base64 或上游图片地址。
- 已通过图片、聊天流、模型、代理和 Composer focused 测试；`pnpm type-check`、`pnpm build-only` 与 `git diff --check` 均通过。

## 剩余验收与后续任务

1. 为受控资源读取补充路由级自动化测试：非法 ID、资源缺失、文件缺失、用户归属不符，以及安全响应头。
2. 刷新已生成图片的会话，确认同源受控资源仍可加载和下载。
3. 在浅色与深色主题下复核 Composer、跳到最新消息按钮、生图退出/重试/返回编辑/取消等交互。
4. 仅在受控授权环境中探测 Gemini 的成功响应字段路径与类型；不得输出上游原始响应、URL、图片或 base64。确认前不宣称 Gemini 成功可用。
5. 提交前精确审阅和暂存本功能相关文件，不包含 `.env`、SQLite 文件、`data/ai-images`、真实图片、上游响应、`test-results` 或其他已有未提交改动。
