# AI 多模态图片会话实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Gemini 3 Pro Image 改造成可返回文字、图片或两者的会话内多模态创作模式，同时让 GPT-Image-2 能安全地基于当前会话中的私有图片进行图像编辑。

**Architecture:** 保留现有受认证图片资产边界：浏览器只持有同源资源路径，服务端按当前用户读取私有二进制。Gemini 使用独立的多模态创作 API，将可选参考图在服务器内存中编码进 `image_url` 内容块；GPT 有参考图时转至图片编辑 endpoint 的 multipart 请求，无参考图时继续走图片生成 endpoint。前端通过结构化 Gemini 消息保存文字和可选图片，普通聊天上游仍严格排除全部图片与多模态消息。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Pinia、Hono、Drizzle + SQLite、Node `FormData` / `Blob`、`node:test`、Vite。

## Global Constraints

- 仅在当前 `main` 工作目录完成；不创建 worktree，不覆盖、不清理已有未提交改动。
- 每个已完成的实现任务单独提交并立即推送 `origin/main`；精确暂存任务文件，绝不使用 `git add .` 或 `git add -A`。
- 浏览器、会话 JSON、日志、测试快照、提交和文档不得包含图片 base64、`data:` URI、完整上游 URL、认证头或凭证。
- 浏览器只可使用精确 `/api/ai-platform/images/<UUID>` 同源资源路径或经验证的 HTTPS 图片 URL；只有受控同源资源可作为参考图。
- 参考图只能通过当前用户的 `ai_image_assets` 所属关系读取；非法 UUID、归属不符、元数据缺失或文件缺失均不能提交给上游。
- 默认只使用当前会话中最近一张已完成的受控图片；不实现多图上下文、历史图片选择器、浏览器上传、外部 URL 拉取或未确认的尺寸/比例映射。
- Gemini 的纯文字响应是成功结果，不能显示“图片生成失败”。
- Composer 的聊天、Gemini 创作和 GPT 图片工具均采用 `Enter` 发送、`Shift + Enter` 换行、`Escape` 退出图片模式并保留对应草稿。
- 图片请求与普通 SSE 聊天保持独立；会话切换、取消和卸载后的迟到响应不得写入其他会话。

---

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `src/ai-platform/types.ts` | 定义 Gemini 多模态用户/助手消息联合类型。 |
| `src/ai-platform/api.ts` | 解析受控图片资源 ID，调用 GPT 图片工具与 Gemini 多模态 API，校验结构化响应。 |
| `src/ai-platform/composables/useImageGeneration.ts` | 保持 GPT 图片工具请求的取消生命周期。 |
| `src/ai-platform/composables/useGeminiMultimodal.ts` | 管理 Gemini 多模态请求与取消生命周期。 |
| `src/ai-platform/composer.ts` | 提供可单测的 Composer 提交快捷键判断。 |
| `src/ai-platform/message-markdown.ts` | 集中定义 Markdown 的 HTML 转义、链接协议白名单与同步渲染，供文本消息和 Gemini 结果共同使用。 |
| `src/ai-platform/components/Composer.vue` | 提供 GPT 图片工具和 Gemini 创作模式、独立草稿、参考图状态与统一 Enter/Shift+Enter 行为。 |
| `src/ai-platform/components/ChatArea.vue` | 编排参考图选择、GPT 图片请求、Gemini 多模态消息状态、取消、重试与会话失效。 |
| `src/ai-platform/components/MessageBubble.vue` | 按联合消息类型分派文本、图片与 Gemini 多模态结果。 |
| `src/ai-platform/components/GeminiMultimodalCard.vue` | 渲染 Gemini 生成中、文字、可选图片、失败、取消和“基于此图继续”。 |
| `src/ai-platform/components/ImageMessageCard.vue` | 为已完成的受控图片增加“基于此图继续”事件。 |
| `server/ai-image-assets.ts` | 导出服务端参考图读取所需的受控 ID 验证和已验证二进制读取能力。 |
| `server/ai-platform.ts` | 构建 Gemini 内容块 / GPT multipart 编辑请求，归一 Gemini 文字+图片响应，提供认证 API。 |
| `tests/ai-platform-images.test.ts` | 覆盖私有参考图、GPT 编辑请求、Gemini 多模态请求与响应归一化。 |
| `tests/ai-platform-chat-stream.test.ts` | 覆盖多模态消息不进入普通聊天上游。 |
| `tests/ai-platform-composer.test.ts` | 覆盖 Enter/Shift+Enter 提交判断与受控参考图 ID。 |

---

### Task 1: 服务端私有参考图与上游请求适配

**Files:**
- Modify: `server/ai-platform.ts:94-213,929-984`
- Modify: `tests/ai-platform-images.test.ts:134-226`

`server/ai-image-assets.ts` 已有按用户读取并验证私有资产的 `readImageAsset()`，本任务直接复用它，不修改该文件。

**Consumes:** 现有 `readImageAsset(userKey, id)`、`decodeBase64Image(value)`、`storeImageAsset(userKey, image)`、`imageAssetUrl(id)`。

**Produces:**

```ts
type ImageToolRequestBody = {
  modelId: 'gpt-image-2'
  prompt: string
  aspectRatio: ImageAspectRatio
  referenceImageId?: string
}

type GeminiMultimodalRequestBody = {
  prompt: string
  referenceImageId?: string
}

type GeminiMultimodalResponse = {
  content: string
  imageUrl?: string
}

function buildGptImageRequest(
  body: ImageToolRequestBody,
  config: ImageGenerationConfig,
  reference?: { bytes: Buffer; mimeType: string },
): UpstreamRequest

function buildGeminiMultimodalRequest(
  body: GeminiMultimodalRequestBody,
  config: ImageGenerationConfig,
  reference?: { bytes: Buffer; mimeType: string },
): UpstreamRequest

function normalizeGeminiMultimodalResponse(payload: unknown): {
  content: string
  image?: DecodedImage | { imageUrl: string }
} | null
```

- [ ] **Step 1: 为受控参考图和 Gemini 多模态响应写失败测试**

在 `tests/ai-platform-images.test.ts` 中加入以下测试；示例只使用最小 PNG 魔数，不能使用真实图片或 base64 载荷：

```ts
test('buildGeminiMultimodalRequest includes a server-side image content block', () => {
  const request = buildGeminiMultimodalRequest(
    { prompt: '优化一下' },
    { baseUrl: 'https://ai.example.test', appId: 'test-app', appKey: 'test-key' },
    { bytes: png, mimeType: 'image/png' },
  )

  const body = JSON.parse(String(request.body))
  assert.deepEqual(body.messages[0].content.map((item: { type: string }) => item.type), [
    'text',
    'image_url',
  ])
  assert.deepEqual(body.modalities, ['text', 'image'])
})

test('buildGptImageRequest uses multipart edits only with a private reference image', () => {
  const request = buildGptImageRequest(
    { modelId: 'gpt-image-2', prompt: '改成蓝色', aspectRatio: '1:1' },
    config,
    { bytes: png, mimeType: 'image/png' },
  )

  assert.equal(request.url, 'https://ai.example.test/openai-compatible/v1/images/edits')
  assert.ok(request.body instanceof FormData)
  assert.equal(request.headers.has('Content-Type'), false)
})

test('normalizeGeminiMultimodalResponse preserves text-only success', () => {
  assert.deepEqual(normalizeGeminiMultimodalResponse({
    choices: [{ message: { content: '请提供一张需要优化的图片。' } }],
  }), { content: '请提供一张需要优化的图片。' })
})

test('normalizeGeminiMultimodalResponse returns text with a decoded image', () => {
  const result = normalizeGeminiMultimodalResponse({
    choices: [{
      message: {
        content: '已完成优化。',
        images: [{ image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }],
      },
    }],
  })

  assert.equal(result?.content, '已完成优化。')
  assert.equal(result?.image && 'bytes' in result.image, true)
})
```

- [ ] **Step 2: 运行测试，确认新测试因导出缺失而失败**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-images.test.ts
```

Expected: FAIL，错误指出 `buildGeminiMultimodalRequest`、`buildGptImageRequest` 或 `normalizeGeminiMultimodalResponse` 未导出。

- [ ] **Step 3: 实现纯请求构造与响应归一化函数**

在 `server/ai-platform.ts` 中：

1. 将 `UpstreamRequest.body` 改为 `BodyInit | null`，保留 GPT 文生图和既有普通聊天构造函数的字符串 body。
2. 添加一个内部函数，将 `{ bytes, mimeType }` 转为仅在服务端内存中使用的 `data:${mimeType};base64,${bytes.toString('base64')`；只允许 `image/png`、`image/jpeg`、`image/webp`，其他 MIME 类型返回 `null`。
3. 实现 `buildGeminiMultimodalRequest()`：没有参考图时 `messages[0].content` 保持字符串；有参考图时使用：

```ts
messages: [{
  role: 'user',
  content: [
    { type: 'text', text: body.prompt },
    { type: 'image_url', image_url: { url: dataUrl } },
  ],
}],
modalities: ['text', 'image'],
```

4. 实现 `buildGptImageRequest()`：没有参考图时调用既有 GPT `/images/generations` JSON 构造逻辑；有参考图时使用 `/images/edits`、`FormData`，并设置 `model`、`prompt`、`image`。`image` 必须是 `new Blob([reference.bytes], { type: reference.mimeType })`，文件名以受验证的 MIME 类型映射为 `reference.png`、`reference.jpg` 或 `reference.webp`。multipart 请求不得手动设置 `Content-Type`。
5. 抽取现有 Gemini 图片解析逻辑为内部函数，供 `normalizeGeminiMultimodalResponse()` 使用。它读取 `choices[0].message.content` 字符串与可选 `message.images[0]`，返回文字、可选 HTTPS URL 或经现有 `decodeImageDataUrl()` 校验的二进制图片。无文字且无图片时返回 `null`。

- [ ] **Step 4: 为认证路由添加最小的私有参考图解析**

在 `POST /ai-platform/images/generations` 中将 body 改为 `ImageToolRequestBody`：

```ts
const reference = body.referenceImageId
  ? await readImageAsset(USER_KEY, body.referenceImageId)
  : null
if (body.referenceImageId && !reference) {
  return c.json({ error: '参考图片不存在或不可用。' }, 404)
}
```

只允许 `modelId === 'gpt-image-2'` 使用该图片工具路由；调用 `buildGptImageRequest()`。使用 `normalizeImageGenerationResponse()` 处理 GPT 结果，并维持已有的安全资产落盘分支。

新增：

```text
POST /api/ai-platform/images/gemini
```

路由只接受 `{ prompt, referenceImageId? }`，验证 prompt、检查 `gemini-3-pro-image` 已启用且为 image 模型、按相同用户规则读取参考图，调用 `buildGeminiMultimodalRequest()`。结果写成：

```json
{ "content": "", "imageUrl": "/api/ai-platform/images/<uuid>" }
```

`imageUrl` 仅在有有效图片时出现。文字-only 响应返回 200；无文字且无图片返回安全的 502 错误。落盘失败仍返回“图片生成结果保存失败，请稍后重试。”。

- [ ] **Step 5: 运行服务端契约测试，确认通过**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-images.test.ts tests/ai-platform-proxy.test.ts
```

Expected: PASS，包含 GPT 文生图、GPT 图生图 multipart、Gemini 文本、Gemini 图片及图文结果的断言。

- [ ] **Step 6: 提交并推送服务端适配任务**

Run:

```bash
git add server/ai-platform.ts tests/ai-platform-images.test.ts
git diff --cached --check
git commit -m "feat(ai): add private image references"
git push origin main
```

Expected: 只包含本任务的服务端和测试文件，推送为 fast-forward；若远端已变化，先 `git fetch origin main`，检查提交差异，使用保留工作区修改的安全 rebase 整合，绝不 force push。

### Task 2: 多模态客户端契约与 Composer 键盘语义

**Files:**
- Modify: `src/ai-platform/types.ts:41-76`
- Modify: `src/ai-platform/api.ts:139-195`
- Modify: `src/ai-platform/composer.ts:1-15`
- Modify: `src/ai-platform/components/Composer.vue:1-190`
- Test: `tests/ai-platform-chat-stream.test.ts:37-80`
- Test: `tests/ai-platform-composer.test.ts:1-26`
- Test: `tests/ai-platform-images.test.ts:42-132`

**Consumes:** Task 1 的 `POST /api/ai-platform/images/generations` 与 `POST /api/ai-platform/images/gemini` 路由契约。

**Produces:**

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

type GeminiMultimodalResponse = {
  content: string
  imageUrl?: string
}

function controlledImageAssetId(value: unknown): string | null
function composerSubmitMatches(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean
```

- [ ] **Step 1: 写客户端与键盘语义失败测试**

在 `tests/ai-platform-composer.test.ts` 中替换旧的 `imageShortcutMatches` 断言：

```ts
test('Composer sends on Enter and preserves a newline on Shift plus Enter', () => {
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: false }), true)
  assert.equal(composerSubmitMatches({ key: 'Enter', shiftKey: true }), false)
  assert.equal(composerSubmitMatches({ key: 'Escape', shiftKey: false }), false)
})
```

在 `tests/ai-platform-images.test.ts` 中添加以下测试。每个测试在 `finally` 中恢复 `globalThis.fetch`，并且只使用固定 UUID 和受控本地路径：

```ts
test('generateGeminiMultimodal accepts text-only and controlled image results', async () => {
  const originalFetch = globalThis.fetch
  let call = 0
  globalThis.fetch = async () => Response.json(call++ === 0
    ? { content: '已完成优化。' }
    : {
        content: '已完成优化。',
        imageUrl: '/api/ai-platform/images/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
      })

  try {
    assert.deepEqual(await generateGeminiMultimodal({
      prompt: '优化一下',
      signal: new AbortController().signal,
    }), { content: '已完成优化。' })
    assert.deepEqual(await generateGeminiMultimodal({
      prompt: '优化一下',
      signal: new AbortController().signal,
    }), {
      content: '已完成优化。',
      imageUrl: '/api/ai-platform/images/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateImage sends only a controlled reference image id', async () => {
  const originalFetch = globalThis.fetch
  let body: Record<string, unknown> | undefined
  globalThis.fetch = async (_request, init) => {
    body = JSON.parse(String(init?.body))
    return Response.json({
      modelId: 'gpt-image-2',
      imageUrl: '/api/ai-platform/images/b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
    })
  }

  try {
    await generateImage({
      ...input,
      referenceImageId: 'b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
    })
    assert.deepEqual(body, {
      modelId: 'gpt-image-2',
      prompt: '电影感的橘猫',
      aspectRatio: '1:1',
      referenceImageId: 'b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateGeminiMultimodal rejects unsafe image results', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    content: '',
    imageUrl: 'data:image/png;base64,abc',
  })

  try {
    await assert.rejects(() => generateGeminiMultimodal({
      prompt: '优化一下',
      signal: new AbortController().signal,
    }), { message: '图片创作服务返回了无效结果，请稍后重试。' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

在 `tests/ai-platform-chat-stream.test.ts` 中扩展图片过滤样例：

```ts
{
  type: 'gemini-multimodal-user',
  role: 'user',
  requestId: 'gemini-1',
  content: '优化一下',
  referenceImageId: 'b4d7cf09-5548-4c45-ac5a-8f5a5f7e6b56',
  createdAt: '2026-08-25T00:00:00.000Z',
},
{
  type: 'gemini-multimodal-assistant',
  role: 'assistant',
  requestId: 'gemini-1',
  content: '已完成。',
  status: 'completed',
  createdAt: '2026-08-25T00:00:01.000Z',
},
```

并断言 `toUpstreamMessages()` 仍只返回普通 `TextMessage`。

- [ ] **Step 2: 运行客户端测试，确认失败**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-composer.test.ts tests/ai-platform-images.test.ts tests/ai-platform-chat-stream.test.ts
```

Expected: FAIL，错误指出多模态类型、`composerSubmitMatches`、`controlledImageAssetId` 或 `generateGeminiMultimodal` 尚不存在。

- [ ] **Step 3: 实现联合类型、API 客户端和过滤边界**

在 `src/ai-platform/types.ts` 添加两种 Gemini 消息接口并纳入 `ChatMessage`。`referenceImageId` 只能是受控资源 UUID，不新增 `dataUrl`、上游 URL 或二进制字段。

在 `src/ai-platform/api.ts`：

1. 添加 `controlledImageAssetId(value)`，只从精确 `/api/ai-platform/images/<UUID>` 路径提取 UUID；HTTPS、`data:`、`http:` 和无效路径均返回 `null`。
2. 将 `ImageGenerationInput` 添加可选 `referenceImageId?: string`；`generateImage()` 请求体只发送该 ID，不发送图片 URL。
3. 添加：

```ts
export async function generateGeminiMultimodal(input: {
  prompt: string
  referenceImageId?: string
  signal: AbortSignal
}): Promise<GeminiMultimodalResponse>
```

它调用 `/api/ai-platform/images/gemini`，接受非空 `content` 或安全 `imageUrl`；两者都没有时抛出“图片创作服务返回了无效结果，请稍后重试。”。`imageUrl` 若存在必须通过 `isSafeImageUrl()`。
4. 维持 `toUpstreamMessages()` 只接受 `isTextMessage()`，因此 Gemini 多模态消息绝不进入 `/api/ai-platform/chat`。

在 `src/ai-platform/composer.ts` 用 `composerSubmitMatches()` 取代 `imageShortcutMatches()`：只有 `event.key === 'Enter' && !event.shiftKey` 返回 true。

- [ ] **Step 4: 将 Composer 改为两个图片子模式与统一快捷键**

在 `Composer.vue`：

1. 状态改为 `mode: 'chat' | 'gpt-image' | 'gemini'`，分别保存 `chatDraft`、`gptImageDraft`、`geminiDraft`。
2. 保留点击图片入口默认进入 GPT 图片工具；在模式条模型选择切换时，GPT 进入 `gpt-image`，Gemini 进入 `gemini`。
3. 新增 props：

```ts
referenceImageId?: string | null
referenceImageLabel?: string | null
```

新增事件：

```ts
'clear-reference': []
```

Gemini 与 GPT 模式均在存在参考图时显示“基于上一张图片”和“移除参考图”按钮；无参考图时不显示该状态。
4. 在三个模式中，当 `composerSubmitMatches(event)` 为 true 时 `preventDefault()` 并执行当前模式对应动作；`Shift + Enter` 不阻止默认换行；`Escape` 在非聊天模式退出且不清除草稿。
5. Gemini 模式发出新事件：

```ts
'generate-gemini': [input: { prompt: string }]
```

GPT 模式的 `generate-image` 事件显式带 `modelId: 'gpt-image-2'`、比例和 `referenceImageId?: string`；`Composer.vue` 从当前 props 读取受控 ID 并随事件一并发出，`ChatArea.vue` 只使用该 ID，不能隐式以图片 URL 补充。按钮、placeholder、aria-label 和模式条文案分别使用“生成/编辑图片”和“Gemini 创作对话”。

- [ ] **Step 5: 运行客户端 focused 测试，确认通过**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-composer.test.ts tests/ai-platform-images.test.ts tests/ai-platform-chat-stream.test.ts
```

Expected: PASS，且断言 Gemini 文本-only 成功、所有非文本结构化消息被普通聊天过滤、Shift+Enter 不发送。

- [ ] **Step 6: 提交并推送客户端契约任务**

Run:

```bash
git add src/ai-platform/types.ts src/ai-platform/api.ts src/ai-platform/composer.ts src/ai-platform/components/Composer.vue tests/ai-platform-composer.test.ts tests/ai-platform-images.test.ts tests/ai-platform-chat-stream.test.ts
git diff --cached --check
git commit -m "feat(ai): add Gemini creation mode"
git push origin main
```

Expected: 只暂存本任务文件；若远端移动，按 Task 1 的 fetch/rebase 安全规则处理，不覆盖其他人的提交。

### Task 3: 会话编排、结果渲染与参考图控制

**Files:**
- Create: `src/ai-platform/composables/useGeminiMultimodal.ts`
- Create: `src/ai-platform/components/GeminiMultimodalCard.vue`
- Create: `src/ai-platform/message-markdown.ts`
- Modify: `src/ai-platform/components/ChatArea.vue:1-570`
- Modify: `src/ai-platform/components/MessageBubble.vue:1-155`
- Modify: `src/ai-platform/components/ImageMessageCard.vue:1-193`
- Test: `tests/ai-platform-chat-stream.test.ts`
- Test: `tests/ai-platform-images.test.ts`

**Consumes:** Task 1 服务端 API、Task 2 的 `GeminiMultimodal*Message`、`controlledImageAssetId()`、Composer 事件。

**Produces:** 用户可在会话中发起 Gemini 创作，收到文字/图片/图文，选择或清除受控参考图，且 GPT/Gemini 图片请求都使用同一个会话级失效边界。

- [ ] **Step 1: 写 Gemini 会话状态和参考图选择的失败测试**

在 `tests/ai-platform-chat-stream.test.ts` 增加纯函数测试，先在 `src/ai-platform/api.ts` 声明将实现的：

```ts
export function latestControlledImageAssetId(messages: ChatMessage[]): string | null
```

测试数据按时间包含：外部 HTTPS 图片、错误图片、完成的受控图片和 Gemini 完成图片；断言函数只返回最后一个 `status === 'completed'` 且 `controlledImageAssetId(imageUrl)` 非空的资源 ID。

在 `tests/ai-platform-images.test.ts` 增加 Gemini 的错误和取消客户端语义测试：`AbortError` 走 `onAbort`，安全错误消息走 `onError`，文字-only `onDone` 不转为错误。

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-chat-stream.test.ts tests/ai-platform-images.test.ts
```

Expected: FAIL，错误指出 `latestControlledImageAssetId` 或 Gemini composable 尚不存在。

- [ ] **Step 3: 实现 Gemini 请求生命周期和参考图决策**

创建 `useGeminiMultimodal.ts`，结构与 `useImageGeneration.ts` 一致：维护单个 `AbortController`、`generating`、`generate(input, callbacks)`、`abort()`；调用 `generateGeminiMultimodal()`。回调接口为：

```ts
{
  onDone: (result: GeminiMultimodalResponse) => void
  onError: (message: string) => void
  onAbort: () => void
}
```

在 `api.ts` 实现 `latestControlledImageAssetId(messages)`，倒序扫描 `image-result` 和 `gemini-multimodal-assistant`：仅返回已完成且受控路径的最新资源 ID；其它消息一律跳过。

- [ ] **Step 4: 在 ChatArea 统一编排两类请求**

在 `ChatArea.vue`：

1. 新增 `useGeminiMultimodal()`，并把 `imageGenerating` 改为 GPT 与 Gemini 任一请求进行中的组合状态。
2. 新增按会话 key 重置的引用选择状态：默认值为 `latestControlledImageAssetId(props.messages)`；用户点击移除后，将当前会话引用设为 `null`，不得在同一次会话中自动恢复；用户点击“基于此图继续”时显式设置其 ID。
3. `handleGenerateImage()` 只处理 GPT，调用时将当前选择的 `referenceImageId` 添加到 input。它继续创建现有 `image-request` 和 `image-result` 消息。
4. 新增 `handleGenerateGemini({ prompt })`：立即创建一个 `gemini-multimodal-user` 和一个 `gemini-multimodal-assistant`（`generating`）消息；将当前参考图 ID 记录在用户消息；完成时写入 `content`、可选 `imageUrl`、`completedAt` 与 `completed` 状态。文字-only 必须保留 completed 状态。
5. 扩展 `invalidateRequest()`：递增独立 Gemini generation 计数，调用 Gemini abort，清空双方等待状态。重用当前会话 key 检查，阻止迟到回调污染其他会话。
6. 将 Composer 绑定到 `@generate-gemini`、`@clear-reference`、参考图 props；将结果卡片的“基于此图继续”绑定到当前受控资源 ID。

- [ ] **Step 5: 实现多模态结果卡与安全事件分派**

先创建 `src/ai-platform/message-markdown.ts`，将现有 `MessageBubble.vue` 的 `marked` 初始化、`escapeHtml()`、HTML 转义、`https:` / `mailto:` / `#` 链接白名单与同步 `renderMarkdown(value: string): string` 完整迁入并导出。`MessageBubble.vue` 改为导入该函数，删除本地重复渲染器；这样 `GeminiMultimodalCard.vue` 与普通文本拥有相同的 HTML 转义和链接规则。

创建 `GeminiMultimodalCard.vue`：

- 接收 `GeminiMultimodalAssistantMessage` 与配对用户消息的 prompt；
- `generating` 显示“Gemini 正在创作”及停止按钮；
- `completed` 使用共享 `renderMarkdown()` 呈现非空文本；有通过 `isSafeImageUrl()` 验证的图片时显示图片、下载和“基于此图继续”；
- `error` 与 `cancelled` 使用现有中文错误样式、重试和返回编辑动作；
- 绝不将 `data:` 写入 `src` / `href`。

在 `ImageMessageCard.vue` 的已完成受控图片 footer 中添加“基于此图继续”按钮，并发出 `use-as-reference`。只有 `controlledImageAssetId(imageUrl)` 有值时才渲染该按钮；外部 HTTPS 图片只保留下载。

在 `MessageBubble.vue` 增加 Gemini 多模态消息分支；普通用户 Gemini 消息沿用纯文本用户气泡，Gemini 助手消息交给新卡片。`MessageBubble` 新增 `retry-gemini`、`edit-gemini`、`abort-gemini` 和 `use-image-reference` 事件并向 `ChatArea` 冒泡。Gemini 结构化消息不显示普通文本消息的复制、编辑、分支操作。`ChatArea.vue` 的重试使用原用户消息的 `content` 与 `referenceImageId`；返回编辑将该内容恢复至 Gemini 草稿；停止仅中止 Gemini 当前请求。

- [ ] **Step 6: 运行局部测试、类型检查与生产构建**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-composer.test.ts tests/ai-platform-images.test.ts tests/ai-platform-chat-stream.test.ts tests/ai-platform-proxy.test.ts
pnpm type-check
pnpm build-only
git diff --check
```

Expected: 所有命令退出码为 0。

- [ ] **Step 7: 浏览器与受控 API 验收**

启动当前 `main` 工作目录的 `pnpm dev:all`，确认 Vite 代理指向同一个 API 服务。通过已登录浏览器验证：

1. 普通聊天、Gemini 创作和 GPT 工具中 `Enter` 发送、`Shift + Enter` 换行。
2. Gemini 无参考图的纯文本回答展示为成功文本，不显示图片失败。
3. GPT 生成后切 Gemini 输入“优化一下”，Composer 显示“基于上一张图片”，Gemini 可完成创作并显示文字、图片或两者。
4. Gemini 生成后切 GPT 输入编辑指令，GPT 使用上一张受控图片进行图像编辑。
5. 点击“基于此图继续”切换当前参考图；点击“移除参考图”后请求不带参考图。
6. 刷新会话后最新受控图片仍被自动选为默认参考图；外部 HTTPS 图片不提供参考图按钮。
7. 取消生成或切换会话后，迟到响应不修改当前会话。

浏览器或网络日志不得复制真实资源 UUID、图片 URL、base64 或上游响应。

- [ ] **Step 8: 提交并推送会话交互任务**

Run:

```bash
git add src/ai-platform/composables/useGeminiMultimodal.ts src/ai-platform/components/GeminiMultimodalCard.vue src/ai-platform/components/ChatArea.vue src/ai-platform/components/MessageBubble.vue src/ai-platform/components/ImageMessageCard.vue src/ai-platform/message-markdown.ts src/ai-platform/api.ts tests/ai-platform-chat-stream.test.ts tests/ai-platform-images.test.ts
git diff --cached --check
git commit -m "feat(ai): add image creation conversations"
git push origin main
```

Expected: 推送成功，且只包含本任务文件。

### Task 4: 规格同步与最终回归

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-ai-multimodal-image-conversation-design.md`
- Modify: `docs/superpowers/specs/2026-08-24-ai-composer-image-generation-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-ai-multimodal-image-conversations.md`
- Test: `tests/ai-platform-images.test.ts`
- Test: `tests/ai-platform-chat-stream.test.ts`
- Test: `tests/ai-platform-composer.test.ts`
- Test: `tests/ai-platform-proxy.test.ts`

**Consumes:** Tasks 1–3 的最终 API、类型、组件与浏览器验收结果。

**Produces:** 规格不再宣称 Gemini 是纯文生图模式，计划记录实际执行与验证边界。

- [ ] **Step 1: 修正文档中的旧范围与契约表述**

在 2026-08-24 文档中将“参考图、图生图和多模态上下文不在范围内”的过期表述改为链接到 2026-08-25 规格；保留第一期历史事实，不重写成未发生的实现。更新 Gemini 说明：它可以返回文本、图片或两者，并且其 data URL 只能由服务端严格解码及私有落盘。

在 2026-08-25 规格顶部把状态从“待用户审阅”改为“已实现”，并以简短的“实现结果”小节记录最终 endpoint、消息类型、快捷键和验证结果；不粘贴任何真实图片、URL、base64、凭证或原始响应。

- [ ] **Step 2: 运行最终测试与静态验证**

Run:

```bash
pnpm exec tsx --test tests/ai-platform-composer.test.ts tests/ai-platform-images.test.ts tests/ai-platform-chat-stream.test.ts tests/ai-platform-proxy.test.ts
pnpm type-check
pnpm build-only
git diff --check
```

Expected: 全部命令退出码为 0。

- [ ] **Step 3: 提交并推送文档与最终回归任务**

Run:

```bash
git add docs/superpowers/specs/2026-08-24-ai-composer-image-generation-design.md docs/superpowers/specs/2026-08-25-ai-multimodal-image-conversation-design.md docs/superpowers/plans/2026-08-25-ai-multimodal-image-conversations.md
git diff --cached --check
git commit -m "docs(ai): document multimodal creation flow"
git push origin main
```

Expected: 推送成功，未纳入 `.env`、数据库、WAL、`data/ai-images`、真实图片、上游响应、`test-results` 或无关改动。
