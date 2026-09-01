# 豆包式生图（比例/风格/模板）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「生图」和「Gemini 创作」两个图标签的输入框旁加比例选择器、风格选择器和模板库（内置 + 用户自建），「同款」把模板 prompt 填进输入框；比例默认不选，选中才真正发上游 `size`。

**Architecture:** 前端持有风格/模板的静态数据模块（`image-styles.ts` / `image-templates.ts`），发送时把选中风格的提示词后缀拼进 `prompt`（原始 prompt + `style` 存在消息里）。服务端把可选 `aspectRatio` 映射成 gpt-image 上游 `size`（真正接通）；自定义模板按 `USER_KEY` 存新的 `ai_image_templates` 表，走 CRUD 端点。Gemini 比例先「记录 + 展示」，是否转发上游用环境变量门控。

**Tech Stack:** Vue3 composition API + TS，Hono + Drizzle + SQLite（`tsx watch server/index.ts`），`node:test` via `npx tsx --test tests/*.test.ts`。

## Global Constraints

- 比例默认不选（`aspectRatio` 为可选，未选不发 `size`）。
- `IMAGE_PROMPT_MAX = 2000`；`aspectRatio` 合法值集：`'1:1' | '4:3' | '3:4' | '16:9' | '9:16'`。
- 风格 = 提示词后缀增强（模型无风格专用参数）；前端拼成最终 `prompt` 发送，消息里存原始 `prompt` + `style`。
- Gemini 走 `openai-compatible/v1/chat/completions`，无明确 `size` 参数 → 只记录 + 展示；是否转发由 `FORWARD_GEMINI_ASPECT_RATIO === '1'` 门控（默认关）。
- 自定义模板按 `USER_KEY` 归属；端点返回 camelCase（`aspectRatio`/`style`）。
- 提交格式：每个任务单独 commit 并 push 到 origin/main。
- 测试命令：`npx tsx --test tests/<file>.test.ts`（单测）、`npx tsx --test tests/*.test.ts`（全量）、`npm run type-check`。

---

### Task 1: 前端静态数据模块（风格 + 内置模板）

**Files:**
- Create: `src/ai-platform/image-styles.ts`
- Create: `src/ai-platform/image-templates.ts`

**Interfaces:**
- Produces: `IMAGE_STYLES`, `imageStyleName(id?)`, `imageStyleSuffix(id?)`, `composeImagePrompt(prompt, styleId?)`, `ImageStyleId`；`IMAGE_TEMPLATES`, `ImageTemplate`.

- [ ] **Step 1: Write the failing test** for the style composition helper.

Create `tests/image-styles.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { IMAGE_STYLES, composeImagePrompt, imageStyleName, imageStyleSuffix } from '../src/ai-platform/image-styles'

test('imageStyleSuffix returns the known tail for a style id', () => {
  const suffix = imageStyleSuffix('ink-wash')
  assert.ok(suffix.includes('水墨'))
})
test('imageStyleSuffix returns empty for unknown/empty id', () => {
  assert.equal(imageStyleSuffix(''), '')
  assert.equal(imageStyleSuffix('nope'), '')
})
test('imageStyleName returns the Chinese display name', () => {
  assert.equal(imageStyleName('cyberpunk'), '赛博朋克')
  assert.equal(imageStyleName(''), '')
})
test('composeImagePrompt appends the suffix and keeps a bare prompt unchanged', () => {
  assert.equal(composeImagePrompt('一只猫'), '一只猫')
  assert.ok(composeImagePrompt('一只猫', 'ink-wash').includes('一只猫'))
  assert.ok(composeImagePrompt('一只猫', 'cinematic').includes('电影'))
})
test('IMAGE_STYLES has unique ids and a none-less curated set', () => {
  assert.ok(IMAGE_STYLES.length >= 8)
  const ids = IMAGE_STYLES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/image-styles.test.ts`
Expected: FAIL with module not found / `IMAGE_STYLES` undefined.

- [ ] **Step 3: Implement `src/ai-platform/image-styles.ts`**

```ts
export type ImageStyleId =
  | 'photorealistic' | '3d-render' | 'flat-illustration' | 'ink-wash' | 'cyberpunk'
  | 'cinematic' | 'minimal' | 'anime' | 'watercolor' | 'vintage-film'

export interface ImageStyle { id: ImageStyleId; name: string; suffix: string }

export const IMAGE_STYLES: ImageStyle[] = [
  { id: 'photorealistic', name: '写实摄影', suffix: '，真实摄影质感，自然光影，高细节真实感' },
  { id: '3d-render', name: '3D 渲染', suffix: '，三维渲染风格，柔和光影，干净材质，类似 C4D/Blender 渲染' },
  { id: 'flat-illustration', name: '扁平插画', suffix: '，扁平矢量插画风格，简洁色块，几何造型' },
  { id: 'ink-wash', name: '国风水墨', suffix: '，中国水墨画风格，笔墨淋漓，留白意境，淡雅宣纸质感' },
  { id: 'cyberpunk', name: '赛博朋克', suffix: '，赛博朋克风格，霓虹灯，紫蓝配色，未来都市氛围' },
  { id: 'cinematic', name: '电影质感', suffix: '，电影级画面，电影感调色，宽画幅电影构图' },
  { id: 'minimal', name: '极简', suffix: '，极简风格，干净留白，单一主体，克制配色' },
  { id: 'anime', name: '卡通动漫', suffix: '，日系动漫风格，明亮清新，线条干净，二次元质感' },
  { id: 'watercolor', name: '水彩手绘', suffix: '，水彩手绘风格，柔和晕染，透明水彩质感，纸面肌理' },
  { id: 'vintage-film', name: '复古胶片', suffix: '，复古胶片风格，颗粒感，暖调褪色，怀旧氛围' },
]

const styleById = new Map(IMAGE_STYLES.map((s) => [s.id, s]))

export function imageStyleSuffix(id?: string): string {
  if (!id) return ''
  return styleById.get(id as ImageStyleId)?.suffix ?? ''
}

export function imageStyleName(id?: string): string {
  if (!id) return ''
  return styleById.get(id as ImageStyleId)?.name ?? ''
}

export function composeImagePrompt(prompt: string, styleId?: string): string {
  const suffix = imageStyleSuffix(styleId)
  return suffix ? `${prompt}${suffix}` : prompt
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/image-styles.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/ai-platform/image-templates.ts`**

```ts
import type { ImageAspectRatio } from './types'

export interface ImageTemplate {
  id: string
  name: string
  prompt: string
  aspectRatio?: ImageAspectRatio
  style?: string
}

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  { id: 'city-night', name: '霓虹都市夜景', prompt: '一座未来感十足的赛博朋克城市夜景，雨后的街道反光，高楼霓虹闪烁，行人撑伞', aspectRatio: '16:9', style: 'cyberpunk' },
  { id: 'ink-mountain', name: '水墨山水', prompt: '中国水墨风格的山水，远山近树，云雾缭绕，留白意境', aspectRatio: '4:3', style: 'ink-wash' },
  { id: 'product-3d', name: '产品 3D 渲染', prompt: '一个极简工业设计产品，3D 渲染，柔和影棚光，白色背景，质感干净', aspectRatio: '1:1', style: '3d-render' },
  { id: 'cafe-watercolor', name: '水彩咖啡馆', prompt: '街角咖啡馆，水彩手绘风格，阳光洒进窗户，温暖色调', aspectRatio: '3:4', style: 'watercolor' },
  { id: 'space-cinema', name: '电影宇宙', prompt: '宇航员在壮丽星云前的剪影，电影感构图，大片质感', aspectRatio: '16:9', style: 'cinematic' },
  { id: 'minimal-poster', name: '极简海报', prompt: '一株盆栽在纯色背景上的极简海报，大量留白，克制配色', aspectRatio: '1:1', style: 'minimal' },
  { id: 'anime-girl', name: '日系插画', prompt: '少女在樱花树下，日系动漫插画，明亮清新，微风花瓣', aspectRatio: '3:4', style: 'anime' },
  { id: 'film-portrait', name: '复古肖像', prompt: '一张复古胶片质感的人像，暖调褪色，颗粒感，怀旧氛围', aspectRatio: '4:3', style: 'vintage-film' },
]
```

（这会依赖 Task 5 的 `ImageAspectRatio` 拓宽；若此任务先提交，可先用当前 `'1:1' | '16:9' | '9:16'`，Task 5 再拓宽。）

- [ ] **Step 6: Run type-check**

Run: `npm run type-check`
Expected: PASS（`image-templates.ts` 现在能用窄版 `ImageAspectRatio`，Task 5 拓宽后仍兼容）。

- [ ] **Step 7: Commit**

```bash
git add src/ai-platform/image-styles.ts src/ai-platform/image-templates.ts tests/image-styles.test.ts
git commit -m "feat(ai): add image style and template data modules"
git push origin main
```

---

### Task 2: 数据库新增 `ai_image_templates` 表

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/migrations/00XX_add_ai_image_templates.sql`（由 drizzle-kit 生成）

**Interfaces:**
- Consumes: existing `db` from `server/db/client.ts`.
- Produces: `aiImageTemplates` table（drizzle schema）。

- [ ] **Step 1: 在 `server/db/schema.ts` 末尾追加表定义**

```ts
export const aiImageTemplates = sqliteTable('ai_image_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull(),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  aspectRatio: text('aspect_ratio'), // 可空：未选比例留空，与应用「比例默认不选」一致
  style: text('style'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

- [ ] **Step 2: 生成并应用迁移**

Run: `npm run db:generate`
Apply: `npm run db:migrate`
Expected: 生成新 SQL 文件到 `server/db/migrations/`，并更新 `meta/_journal.json`；本地 `./data/lab-studio.db` 出现 `ai_image_templates` 表。

- [ ] **Step 3: 写表结构断言单测** `tests/ai-image-templates-schema.test.ts`

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../server/db/client'
import { aiImageTemplates } from '../server/db/schema'

test('ai_image_templates table is queryable', async () => {
  const rows = await db.select().from(aiImageTemplates).limit(1)
  assert.ok(Array.isArray(rows))
})
```

Run: `npx tsx --test tests/ai-image-templates-schema.test.ts`
Expected: PASS（表存在；若表不存在会抛 no such table）。

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.ts server/db/migrations/ server/db/migrations/meta/
git commit -m "feat(ai): add ai_image_templates table"
git push origin main
```

---

### Task 3: 服务端 gpt-image `size` 映射 + aspectRatio 可选化 + gemini 记录 + 模板 CRUD

**Files:**
- Modify: `server/ai-platform.ts`

**Interfaces:**
- Consumes: `db`/`aiImageTemplates`/`USER_KEY`；existing `resolvePrivateImageReference`/`normalizeImageGenerationResponse` 等。
- Produces: `gptImageSizeFromRatio(ratio?)`, updated `buildGptImageRequest`（可带 `size`）, `ImageGenerationRequestBody` 可选 `aspectRatio`, `GeminiMultimodalRequestBody.aspectRatio?`, 新端点 GET/POST/DELETE `/ai-platform/image-templates`。

- [ ] **Step 1: 先失败——加 `size` 映射与请求 body 断言**。在 `tests/ai-platform-images.test.ts` 追加：

```ts
import { gptImageSizeFromRatio } from '../server/ai-platform'

test('gptImageSizeFromRatio maps supported ratios to exact sizes', () => {
  assert.equal(gptImageSizeFromRatio('1:1'), '1024x1024')
  assert.equal(gptImageSizeFromRatio('16:9'), '1792x1024')
  assert.equal(gptImageSizeFromRatio('9:16'), '1024x1792')
  assert.equal(gptImageSizeFromRatio('4:3'), '1536x1024')
  assert.equal(gptImageSizeFromRatio('3:4'), '1024x1536')
})

test('buildGptImageRequest includes size when an aspectRatio is present', () => {
  const request = buildImageGenerationRequest({
    modelId: 'gpt-image-2',
    prompt: '孙悟空',
    aspectRatio: '16:9',
  }, { baseUrl: 'https://ai.example.test/', appId: 'test-app', appKey: 'test-key' })
  assert.deepEqual(JSON.parse(request.body), { model: 'gpt-image-2', prompt: '孙悟空', size: '1792x1024' })
})

test('buildGptImageRequest omits size when no aspectRatio is chosen', () => {
  const request = buildImageGenerationRequest({
    modelId: 'gpt-image-2',
    prompt: '孙悟空',
  }, { baseUrl: 'https://ai.example.test/', appId: 'test-app', appKey: 'test-key' })
  const body = JSON.parse(request.body)
  assert.equal(body.size, undefined)
  assert.deepEqual(body, { model: 'gpt-image-2', prompt: '孙悟空' })
})
```

Run: `npx tsx --test tests/ai-platform-images.test.ts`
Expected: FAIL（`gptImageSizeFromRatio` 未定义；现有 `buildImageGenerationRequest uses the confirmed GPT image endpoint and body` 断言会因新增 `size` 而错——该断言需同步更新，见 Step 3）。

- [ ] **Step 2: 实现 `size` 映射 + 可选 aspectRatio + buildGptImageRequest 携带 size**

在 `server/ai-platform.ts`：

```ts
const IMAGE_ASPECT_RATIOS = new Set(['1:1', '4:3', '3:4', '16:9', '9:16'])

const GPT_IMAGE_SIZE_FROM_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1536x1024',
  '3:4': '1024x1536',
}

export function gptImageSizeFromRatio(ratio?: string): string | undefined {
  return ratio ? GPT_IMAGE_SIZE_FROM_RATIO[ratio] : undefined
}
```

`ImageGenerationRequestBody.aspectRatio` 改可选：`aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16'`。

`buildGptImageRequest`（无参考图分支）：
```ts
if (!reference) {
  const size = gptImageSizeFromRatio(body.aspectRatio)
  return {
    url: `${baseUrl}/openai-compatible/v1/images/generations`,
    headers: imageUpstreamHeaders(config, 'application/json'),
    body: JSON.stringify({ model: 'gpt-image-2', prompt: body.prompt, ...(size ? { size } : {}) }),
  }
}
```
（有参考图分支：`const size = gptImageSizeFromRatio(body.aspectRatio); if (size) form.set('size', size)`。）

- [ ] **Step 3: 同步已有的 GPT body 断言**

把既有 `test('buildImageGenerationRequest uses the confirmed GPT image endpoint and body', ...)` 里的期望改为 `{ model: 'gpt-image-2', prompt: '孙悟空' }` 并且该输入的 `aspectRatio: '16:9'` 改为触发 `size` → 期望 `{ model, prompt, size: '1792x1024' }`。把未带 ratio 的用例单独设为无 `size`（用 Step 1 的 `omits size` 用例）。保留 `buildGptImageRequest uses multipart edits only with a private reference image` 的 URL/FormData/无 Content-Type 断言。

- [ ] **Step 4: 端点校验异步化 + size 兜底重试**

gpt-image 端点的比例校验改为：
```ts
if (body.aspectRatio && !IMAGE_ASPECT_RATIOS.has(body.aspectRatio)) {
  return c.json({ error: '不支持的图片比例。' }, 400)
}
```
在 endpoint 的首次 `fetch` 失败分支后，加 size 兜底：
```ts
async function requestGptImage(sizeRatio: typeof body.aspectRatio, prompt: string, reference?: PrivateImageReference) {
  const request = buildGptImageRequest({ ...body, aspectRatio: sizeRatio, prompt }, config, reference ?? undefined)
  return fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: c.req.raw.signal })
}
let upstream = await requestGptImage(body.aspectRatio, finalPrompt, reference ?? undefined)
if (!upstream.ok && (upstream.status === 400 || upstream.status === 422) && body.aspectRatio) {
  upstream = await requestGptImage(undefined, finalPrompt, reference ?? undefined)
}
```
（把原有的内联 `fetch` 替换为上面的 `requestGptImage`。）

- [ ] **Step 5: gemini ratio 可选 + 门控转发**

`GeminiMultimodalRequestBody` 加 `aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16'`。`buildGeminiMultimodalRequest` 末尾：
```ts
const size = process.env.FORWARD_GEMINI_ASPECT_RATIO === '1' ? gptImageSizeFromRatio(body.aspectRatio) : undefined
...
body: JSON.stringify({
  model: 'gemini-3-pro-image',
  messages: [...],
  modalities: ['text', 'image'],
  ...(size ? { size } : {}),
}),
```
gemini 端点也把 `aspectRatio` 校验成可选（同 gpt-image）。默认不转发，避免未知字段导致 400。

- [ ] **Step 6: 模板 CRUD 端点**

在 `server/ai-platform.ts` 的 images 端点之后新增：
```ts
app.get('/ai-platform/image-templates', async (c) => {
  await ensureSeeded()
  const rows = await db.select().from(aiImageTemplates).where(eq(aiImageTemplates.userKey, USER_KEY)).orderBy(asc(aiImageTemplates.createdAt))
  return c.json(rows.map((r) => ({ id: r.id, name: r.name, prompt: r.prompt, aspectRatio: r.aspectRatio ?? undefined, style: r.style ?? undefined, createdAt: r.createdAt })))
})

app.post('/ai-platform/image-templates', async (c) => {
  await ensureSeeded()
  const body = await c.req.json<{ name?: unknown; prompt?: unknown; aspectRatio?: unknown; style?: unknown }>().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!name || !name.length || !prompt || prompt.length > IMAGE_PROMPT_MAX) {
    return c.json({ error: '模板名称和描述不能为空，描述不超过 2000 字。' }, 400)
  }
  const aspectRatio = typeof body?.aspectRatio === 'string' ? body.aspectRatio : undefined
  if (aspectRatio && !IMAGE_ASPECT_RATIOS.has(aspectRatio)) {
    return c.json({ error: '不支持的图片比例。' }, 400)
  }
  const style = typeof body?.style === 'string' && body.style ? body.style : undefined
  const inserted = await db.insert(aiImageTemplates).values({ userKey: USER_KEY, name, prompt, aspectRatio: aspectRatio ?? null, style: style ?? null, createdAt: Date.now() }).returning()
  const row = inserted[0]
  return c.json({ id: row.id, name: row.name, prompt: row.prompt, aspectRatio: row.aspectRatio ?? undefined, style: row.style ?? undefined, createdAt: row.createdAt })
})

app.delete('/ai-platform/image-templates/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
  const existing = await db.select({ userKey: aiImageTemplates.userKey }).from(aiImageTemplates).where(eq(aiImageTemplates.id, id)).get()
  if (!existing || existing.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
  await db.delete(aiImageTemplates).where(eq(aiImageTemplates.id, id))
  return c.json({ ok: true })
})
```

需在文件顶部 import：`asc` from `drizzle-orm`，以及 `aiImageTemplates` from `./db/schema`。确认 `ensureSeeded`/`USER_KEY`/`IMAGE_PROMPT_MAX` 已在作用域。

- [ ] **Step 7: 运行相关单测**

Run: `npx tsx --test tests/ai-platform-images.test.ts`
Expected: PASS（含新增的 size 断言与更新后的 GPT body 断言；无端到端用例会走到真实 fetch，因此模板端点不在此文件测，见 Task 4）。

- [ ] **Step 8: Commit**

```bash
git add server/ai-platform.ts tests/ai-platform-images.test.ts
git commit -m "feat(ai): wire image size mapping and template CRUD endpoints"
git push origin main
```

---

### Task 4: 服务端单测——size 映射 + 模板端点

**Files:**
- Create: `tests/ai-image-templates.test.ts`

**Interfaces:**
- Consumes: `gptImageSizeFromRatio`（Task 3）、模板端点、`db`/`aiImageTemplates`。

- [ ] **Step 1: 写模板端点单测（TDD）**。由于端点用 `db` 与 `USER_KEY`，直接测 Drizzle 层的归属增删，辅以 `gptImageSizeFromRatio` 边界：

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { db } from '../server/db/client'
import { aiImageTemplates } from '../server/db/schema'
import { gptImageSizeFromRatio } from '../server/ai-platform'

test('gptImageSizeFromRatio returns undefined for unknown or empty', () => {
  assert.equal(gptImageSizeFromRatio(undefined), undefined)
  assert.equal(gptImageSizeFromRatio(''), undefined)
  assert.equal(gptImageSizeFromRatio('21:9'), undefined)
  assert.equal(gptImageSizeFromRatio('1:1'), '1024x1024')
})

test('insert-and-delete a custom template owns it by user_key', async () => {
  const key = 'template-test-owner'
  const inserted = await db.insert(aiImageTemplates).values({
    userKey: key, name: '测试', prompt: '一只橘猫', aspectRatio: '16:9', style: 'cinematic', createdAt: Date.now(),
  }).returning()
  assert.ok(inserted[0].id)
  try {
    const mine = await db.select().from(aiImageTemplates).where(eq(aiImageTemplates.userKey, key))
    assert.equal(mine.length, 1)
    assert.equal(mine[0].aspectRatio, '16:9')
    assert.equal(mine[0].style, 'cinematic')
  } finally {
    await db.delete(aiImageTemplates).where(eq(aiImageTemplates.id, inserted[0].id))
  }
})
```

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npx tsx --test tests/ai-image-templates.test.ts`
Expected: 先 FAIL（`gptImageSizeFromRatio` 未导出或表不存在）；在 Task 3 已实现后为 PASS。此任务的 TDD 主要是锁定行为，若 Task 3 已先行实现则直接 PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/ai-image-templates.test.ts
git commit -m "test(ai): lock image size mapping and template ownership"
git push origin main
```

---

### Task 5: 前端类型拓宽（可选项 + style 字段）

**Files:**
- Modify: `src/ai-platform/types.ts`

**Interfaces:**
- Produces: `ImageAspectRatio` 拓宽为 5 种；`ImageRequestMessage`/`ImageResultMessage`/`GeminiMultimodalUserMessage` 的 `aspectRatio` 可选 + 新增 `style?: string`。

- [ ] **Step 1: 拓宽类型**

```ts
export type ImageAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16'
```

`ImageRequestMessage`：
```ts
aspectRatio?: ImageAspectRatio
style?: string
```
`ImageResultMessage`：
```ts
aspectRatio?: ImageAspectRatio
style?: string
```
`GeminiMultimodalUserMessage`：
```ts
aspectRatio?: ImageAspectRatio
style?: string
```

- [ ] **Step 2: Run type-check**

Run: `npm run type-check`
Expected: 可能有既存代码因 `aspectRatio` 变可选而报错（如 `ChatArea.vue` 里 `request.aspectRatio` 可能为 undefined——那是可接受的）。修复与执行相关的错误在 Task 7/9 进行。

- [ ] **Step 3: Commit**

```bash
git add src/ai-platform/types.ts
git commit -m "feat(ai): widen image aspect ratio and add style field"
git push origin main
```

---

### Task 6: 前端 API——可选 ratio + 模板 API + gemini ratio

**Files:**
- Modify: `src/ai-platform/api.ts`
- Modify: `tests/ai-platform-images.test.ts`

**Interfaces:**
- Consumes: `ImageAspectRatio`（Task 5）。
- Produces: `ImageGenerationInput.aspectRatio?`；`generateImage` body 仅在 ratio 非空时带 `aspectRatio`；`fetchImageTemplates()`, `createImageTemplate()`, `deleteImageTemplate(id)`；`generateGeminiMultimodal` 可选 `aspectRatio?`。

- [ ] **Step 1: 先失败——generateImage 省略未选 ratio**。在 `tests/ai-platform-images.test.ts` 追加：

```ts
test('generateImage omits aspectRatio when none is chosen', async () => {
  const originalFetch = globalThis.fetch
  let body: Record<string, unknown> | undefined
  globalThis.fetch = async (_request, init) => {
    body = JSON.parse(String(init?.body))
    return Response.json({ modelId: 'gpt-image-2', imageUrl: 'https://cdn.example.test/cat.png' })
  }
  try {
    await generateImage({ modelId: 'gpt-image-2', prompt: '猫', signal: new AbortController().signal })
    assert.deepEqual(body, { modelId: 'gpt-image-2', prompt: '猫' })
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

Run: `npx tsx --test tests/ai-platform-images.test.ts`
Expected: FAIL（当前 `generateImage` 总会发 `aspectRatio: undefined` → body 含 `'aspectRatio': undefined`，JSON.stringify 会丢掉该键吗？`JSON.stringify({aspectRatio: undefined})` 会省略该键，所以现有实现已符合。为让测试「先失败」，先给它一个会失败的实现——见 Step 2）。

- [ ] **Step 2: 更新 `ImageGenerationInput` + `generateImage` 显式只带非空 ratio**

`src/ai-platform/api.ts`：
```ts
export interface ImageGenerationInput {
  modelId: ImageModelId
  prompt: string
  aspectRatio?: ImageAspectRatio
  referenceImageId?: string
  signal?: AbortSignal
}
```
`generateImage` body：
```ts
body: JSON.stringify({
  modelId: input.modelId,
  prompt: input.prompt,
  ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
  ...(referenceImageId && CONTROLLED_IMAGE_ASSET_PATH.test(`/api/ai-platform/images/${referenceImageId}`)
    ? { referenceImageId }
    : {}),
}),
```

- [ ] **Step 3: 加模板 API 函数**

`src/ai-platform/api.ts`（顶部类型里加，或从 `image-templates.ts` 复用）：
```ts
import type { ImageTemplate } from './image-templates'

export async function fetchImageTemplates(signal?: AbortSignal): Promise<ImageTemplate[]> {
  const res = await fetch('/api/ai-platform/image-templates', { credentials: 'include', signal })
  if (!res.ok) return []
  const payload = await res.json().catch(() => [])
  return Array.isArray(payload) ? payload : []
}

export async function createImageTemplate(input: {
  name: string; prompt: string; aspectRatio?: ImageAspectRatio; style?: string
}): Promise<ImageTemplate> {
  const res = await fetch('/api/ai-platform/image-templates', {
    credentials: 'include', method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, prompt: input.prompt, ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}), ...(input.style ? { style: input.style } : {}) }),
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : '模板保存失败，请稍后重试。')
  return payload as ImageTemplate
}

export async function deleteImageTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/ai-platform/image-templates/${id}`, { credentials: 'include', method: 'DELETE' })
  if (!res.ok) throw new Error('模板删除失败，请稍后重试。')
}
```
`generateGeminiMultimodal` 的入参与 body 加可选 ratio：
```ts
export async function generateGeminiMultimodal(input: {
  prompt: string
  referenceImageId?: string
  history?: GeminiContextMessage[]
  aspectRatio?: ImageAspectRatio
  signal: AbortSignal
}): Promise<GeminiMultimodalResponse> {
  ...
  body: JSON.stringify({
    prompt: input.prompt,
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...
  }),
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npx tsx --test tests/ai-platform-images.test.ts` → PASS
Run: `npm run type-check` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai-platform/api.ts tests/ai-platform-images.test.ts
git commit -m "feat(ai): image template api and optional ratio"
git push origin main
```

---

### Task 7: Composer.vue——比例 chips + 风格 chips + 模板面板/同款/添加

**Files:**
- Modify: `src/ai-platform/components/Composer.vue`

**Interfaces:**
- Consumes: `IMAGE_STYLES`/`imageStyleName`（Task 1）、`IMAGE_TEMPLATES`/`ImageTemplate`（Task 1）、`fetchImageTemplates`/`createImageTemplate`/`deleteImageTemplate`（Task 6）、`ImageAspectRatio`（Task 5）。
- Produces: 更新 `generate-image`/`generate-gemini` 事件 payload（新增 `style?`、可选 `aspectRatio?`）。

- [ ] **Step 1: script 状态与 import**

在 `Composer.vue` `<script setup>` 追加：
```ts
import { onMounted } from 'vue'
import { IMAGE_STYLES, imageStyleName } from '../image-styles'
import { IMAGE_TEMPLATES, type ImageTemplate } from '../image-templates'
import { createImageTemplate, deleteImageTemplate, fetchImageTemplates } from '../api'

const IMAGE_ASPECT_RATIO_OPTIONS: ImageAspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16']
const imageStyleId = ref<string>('')
const templatesOpen = ref(false)
const customTemplates = ref<ImageTemplate[]>([])
const templateFormOpen = ref(false)
const templateForm = ref<{ name: string; prompt: string; aspectRatio: ImageAspectRatio | ''; style: string }>({
  name: '', prompt: '', aspectRatio: '', style: '',
})

onMounted(async () => {
  customTemplates.value = await fetchImageTemplates()
})

function toggleAspectRatio(ratio: ImageAspectRatio) {
  imageAspectRatio.value = imageAspectRatio.value === ratio ? '' : ratio
}
function toggleStyle(id: string) {
  imageStyleId.value = imageStyleId.value === id ? '' : id
}
function applyTemplate(t: ImageTemplate) {
  if (mode.value === 'gemini') geminiDraft.value = t.prompt
  else gptImageDraft.value = t.prompt
  imageAspectRatio.value = t.aspectRatio ?? ''
  imageStyleId.value = t.style ?? ''
  templatesOpen.value = false
}
async function saveTemplate() {
  const name = templateForm.value.name.trim()
  const prompt = templateForm.value.prompt.trim()
  if (!name || !prompt) return
  await createImageTemplate({
    name,
    prompt,
    ...(templateForm.value.aspectRatio ? { aspectRatio: templateForm.value.aspectRatio } : {}),
    ...(templateForm.value.style ? { style: templateForm.value.style } : {}),
  })
  customTemplates.value = await fetchImageTemplates()
  templateForm.value = { name: '', prompt: '', aspectRatio: '', style: '' }
  templateFormOpen.value = false
}
async function removeTemplate(id: number) {
  await deleteImageTemplate(id)
  customTemplates.value = await fetchImageTemplates()
}
```
`mode` 目前是 `ref<'chat' | 'gpt-image' | 'gemini'>('chat')`，需在 `imageStyleId`/比例等被模板引用前定义——保持现有 `mode` 声明顺序，追加上述逻辑在 `setMode` 附近。

更新 `generateImage()` 发送 payload：
```ts
emit('generate-image', {
  prompt: gptImageDraft.value.trim(),
  aspectRatio: imageAspectRatio.value || undefined,
  modelId: 'gpt-image-2',
  style: imageStyleId.value || undefined,
  ...(props.referenceImageId ? { referenceImageId: props.referenceImageId } : {}),
})
```
更新 `generateGemini()`：
```ts
emit('generate-gemini', {
  prompt: geminiDraft.value.trim(),
  aspectRatio: imageAspectRatio.value || undefined,
  style: imageStyleId.value || undefined,
})
```
但 `imageAspectRatio` 现在类型是 `ImageAspectRatio | ''`，且 `imageStyleId` 为 `string`。`restoreImageDraft`/`restoreGeminiDraft` 的赋值需兼容 `aspectRatio` 为 undefined：
```ts
function restoreImageDraft(input: { prompt: string; aspectRatio?: ImageAspectRatio; referenceImageId?: string; style?: string }) {
  gptImageDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio ?? ''
  imageStyleId.value = input.style ?? ''
  imageModelId.value = 'gpt-image-2'
  mode.value = 'gpt-image'
}
function restoreGeminiDraft(input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string }) {
  geminiDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio ?? ''
  imageStyleId.value = input.style ?? ''
  imageModelId.value = 'gemini-3-pro-image'
  mode.value = 'gemini'
}
```

更新 `defineEmits`：
```ts
'generate-image': [input: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  modelId: 'gpt-image-2'
  style?: string
  referenceImageId?: string
}]
'generate-gemini': [input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string }]
```

- [ ] **Step 2: template——加比例行、风格行、模板按钮与面板**

在 `composer__image-mode` div 之后、textarea 之前，加（仅 `imageMode` 时显示）：
```html
<div v-if="imageMode" class="composer__image-options">
  <div class="composer__chip-row">
    <span class="composer__chip-label">比例</span>
    <button
      v-for="ratio in IMAGE_ASPECT_RATIO_OPTIONS"
      :key="ratio"
      type="button"
      class="composer__chip"
      :class="{ 'composer__chip--active': imageAspectRatio === ratio }"
      @click="toggleAspectRatio(ratio)"
    >{{ ratio }}</button>
  </div>
  <div class="composer__chip-row">
    <span class="composer__chip-label">风格</span>
    <button
      v-for="style in IMAGE_STYLES"
      :key="style.id"
      type="button"
      class="composer__chip"
      :class="{ 'composer__chip--active': imageStyleId === style.id }"
      @click="toggleStyle(style.id)"
    >{{ style.name }}</button>
    <button type="button" class="composer__chip composer__chip--template" :class="{ 'composer__chip--active': templatesOpen }" @click="templatesOpen = !templatesOpen">模板</button>
  </div>

  <div v-if="templatesOpen" class="composer__template-panel">
    <div v-if="IMAGE_TEMPLATES.length || customTemplates.length" class="composer__template-grid">
      <template v-for="t in [...IMAGE_TEMPLATES, ...customTemplates]" :key="t.id">
        <div class="composer__template-card">
          <div class="composer__template-info">
            <strong>{{ t.name }}</strong>
            <span class="composer__template-tags">{{ [t.aspectRatio, imageStyleName(t.style)].filter(Boolean).join(' · ') }}</span>
            <p>{{ t.prompt }}</p>
          </div>
          <div class="composer__template-actions">
            <button type="button" class="composer__template-action" @click="applyTemplate(t)">同款</button>
            <button v-if="customTemplates.includes(t)" type="button" class="composer__template-action composer__template-action--danger" @click="removeTemplate((t as ImageTemplate).id as number)">删除</button>
          </div>
        </div>
      </template>
    </div>
    <div v-if="templateFormOpen" class="composer__template-form">
      <input v-model="templateForm.name" placeholder="模板名称" class="composer__template-input" />
      <input v-model="templateForm.prompt" placeholder="示例 prompt（这里的一句话会被原样填进输入框）" class="composer__template-input" />
      <div class="composer__chip-row">
        <button v-for="ratio in IMAGE_ASPECT_RATIO_OPTIONS" :key="ratio" type="button" class="composer__chip" :class="{ 'composer__chip--active': templateForm.aspectRatio === ratio }" @click="templateForm.aspectRatio = templateForm.aspectRatio === ratio ? '' : ratio">{{ ratio }}</button>
      </div>
      <div class="composer__chip-row">
        <button v-for="style in IMAGE_STYLES" :key="style.id" type="button" class="composer__chip" :class="{ 'composer__chip--active': templateForm.style === style.id }" @click="templateForm.style = templateForm.style === style.id ? '' : style.id">{{ style.name }}</button>
      </div>
      <div class="composer__template-form-actions">
        <button type="button" class="composer__template-action" @click="templateFormOpen = false">取消</button>
        <button type="button" class="composer__template-action composer__template-action--primary" :disabled="!templateForm.name.trim() || !templateForm.prompt.trim()" @click="saveTemplate">保存模板</button>
      </div>
    </div>
    <button v-else type="button" class="composer__template-action composer__template-action--primary" @click="templateFormOpen = true">＋ 添加模板</button>
  </div>
</div>
```

- [ ] **Step 3: SCSS**

加：
```scss
.composer__image-options { display: grid; gap: 6px; padding: 10px 18px 0; }
.composer__chip-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.composer__chip-label { color: var(--color-text-muted); font-size: 11px; flex-shrink: 0; }
.composer__chip { height: 22px; padding: 0 9px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); font-size: 11px; font-family: var(--font-sans); cursor: pointer; }
.composer__chip:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.composer__chip--active { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }
.composer__chip--template { margin-left: auto; }
.composer__template-panel { border-top: 1px solid var(--color-border); margin-top: 8px; padding-top: 8px; }
.composer__template-grid { display: grid; gap: 8px; max-height: 260px; overflow: auto; }
.composer__template-card { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface); padding: 8px 10px; }
.composer__template-info { min-width: 0; }
.composer__template-info strong { font-size: 12px; color: var(--color-text); display: block; }
.composer__template-tags { font-size: 10.5px; color: var(--color-text-muted); }
.composer__template-info p { margin: 3px 0 0; font-size: 11px; color: var(--color-text-muted); line-clamp: 2; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.composer__template-actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.composer__template-action { border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: 600 11px var(--font-sans); padding: 4px 8px; }
.composer__template-action--primary { border-color: var(--color-accent); background: var(--color-accent); color: #fff; }
.composer__template-action--danger { color: var(--color-danger); }
.composer__template-form { display: grid; gap: 6px; padding: 8px 0; }
.composer__template-input { border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 12px; padding: 6px 8px; outline: none; }
.composer__template-input:focus { border-color: var(--color-accent); }
.composer__template-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
```
（`v-model="templateForm.name"` 等需在模板里给 `templateForm` 绑定，`templateForm` 是 ref，模板里用 `templateForm.name` 自动解包。）

- [ ] **Step 4: Run type-check + 启动 dev 验证**

Run: `npm run type-check`
Expected: 若有 `request.aspectRatio` 使用处的报错，属 ChatArea（Task 9）范围，先修 Composer 内报错。手动验证：`npm run dev` 进入 `/ai`，切到「生图」，确认出现比例/风格 chips 与「模板」按钮，点开面板见内置模板与「＋ 添加模板」。

- [ ] **Step 5: Commit**

```bash
git add src/ai-platform/components/Composer.vue
git commit -m "feat(ai): add ratio/style/template controls to image composer"
git push origin main
```

---

### Task 8: 消息卡片展示比例/风格标签

**Files:**
- Modify: `src/ai-platform/components/ImageMessageCard.vue`
- Modify: `src/ai-platform/components/MessageBubble.vue`
- Create: `tests/image-tags.test.ts`（可选，仅纯帮助函数）+ 在 `image-styles.ts` 加 `aspectRatioLabel` 帮助函数

**Interfaces:**
- Consumes: `imageStyleName`（Task 1）、`aspectRatioLabel`（新增）。

- [ ] **Step 1: 加 `aspectRatioLabel` 帮助函数** 到 `src/ai-platform/image-styles.ts`：

```ts
export function aspectRatioLabel(ratio?: ImageAspectRatio): string {
  return ratio ?? ''
}
```
（`ImageAspectRatio` 从 `./types` 引入；为免耦合，仅作字符串透传。）

- [ ] **Step 2: `ImageMessageCard.vue` 显示比例/风格**

在 request 卡的 `.image-card__meta` 内追加：
```html
<div class="image-card__meta">
  <span>{{ message.modelId === 'gpt-image-2' ? 'GPT-Image-2' : 'Gemini 3 Pro Image' }}</span>
  <span v-if="message.aspectRatio">· {{ message.aspectRatio }}</span>
  <span v-if="message.style">· {{ imageStyleName(message.style) }}</span>
</div>
```
`<script setup>` 里 `import { imageStyleName } from '../image-styles'`。

- [ ] **Step 3: `MessageBubble.vue` 的 gemini 用户消息加标签**

在 gemini 用户分支（`message__plain` 之后）：
```html
<div v-if="geminiUserMessage" class="message__plain">{{ geminiUserMessage.content }}</div>
<div v-if="geminiUserMessage && (geminiUserMessage.aspectRatio || geminiUserMessage.style)" class="message__meta-tags">
  <span v-if="geminiUserMessage.aspectRatio">{{ geminiUserMessage.aspectRatio }}</span>
  <span v-if="geminiUserMessage.style">{{ imageStyleName(geminiUserMessage.style) }}</span>
</div>
```
`<script setup>` 引入 `imageStyleName` from `../image-styles`；`geminiUserMessage` computed 已存在。

- [ ] **Step 4: SCSS 小标签**

（在 MessageBubble.vue 加简单 `.message__meta-tags`，ImageMessageCard 复用现成 `.image-card__meta span` 样式即可。）

- [ ] **Step 5: Run type-check**

Run: `npm run type-check` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/ai-platform/image-styles.ts src/ai-platform/components/ImageMessageCard.vue src/ai-platform/components/MessageBubble.vue
git commit -m "feat(ai): show ratio/style tags on image messages"
git push origin main
```

---

### Task 9: ChatArea 接线——thread style + 可选 ratio

**Files:**
- Modify: `src/ai-platform/components/ChatArea.vue`

**Interfaces:**
- Consumes: `composeImagePrompt`（Task 1）、Composer 新事件 payload（Task 7）、api 新签名（Task 6）。
- Produces: `handleGenerateImage`/`handleGenerateGemini` 接收 `style`/可选 `aspectRatio`，把原始 prompt + style 存入消息，把 composed prompt 调用 API；retry/edit 透传风格与比例。

- [ ] **Step 1: handleGenerateImage 接收并组合 prompt**

```ts
import { composeImagePrompt } from '../image-styles'
...
async function handleGenerateImage(input: {
  prompt: string
  aspectRatio?: ImageAspectRatio
  modelId: 'gpt-image-2'
  style?: string
  referenceImageId?: string
}) {
  ...
  const requestMessage: ChatMessage = {
    type: 'image-request', role: 'user', requestId,
    prompt: input.prompt,
    modelId: input.modelId,
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(input.referenceImageId ? { referenceImageId: input.referenceImageId } : {}),
    createdAt,
  }
  const resultMessage: ImageResultMessage = {
    type: 'image-result', role: 'assistant', requestId,
    prompt: input.prompt,
    modelId: input.modelId,
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.style ? { style: input.style } : {}),
    status: 'generating', createdAt,
  }
  ...
  await generateImage({
    modelId: input.modelId,
    prompt: composeImagePrompt(input.prompt, input.style),
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.referenceImageId ? { referenceImageId: input.referenceImageId } : {}),
  }, { onDone..., onError..., onAbort... })
}
```

- [ ] **Step 2: retryImage / editImage 透传**

```ts
void handleGenerateImage({
  prompt: request.prompt,
  ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
  ...(request.style ? { style: request.style } : {}),
  modelId: 'gpt-image-2',
  ...(request.referenceImageId ? { referenceImageId: request.referenceImageId } : {}),
})
```
`editImage` 的 `restoreImageDraft`：
```ts
composerRef.value?.restoreImageDraft({
  prompt: request.prompt,
  ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
  ...(request.style ? { style: request.style } : {}),
})
```

- [ ] **Step 3: handleGenerateGemini 接收 style/ratio**

```ts
async function handleGenerateGemini(input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string; referenceImageId?: string | null }) {
  ...
  const userMessage: GeminiMultimodalUserMessage = {
    type: 'gemini-multimodal-user', role: 'user', requestId,
    content: input.prompt,
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(input.style ? { style: input.style } : {}),
    ...(reference ? { referenceImageId: reference } : {}),
    createdAt,
  }
  ...
  await generateGemini({
    prompt: composeImagePrompt(input.prompt, input.style),
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
    ...(reference ? { referenceImageId: reference } : {}),
    ...(history.length ? { history } : {}),
  }, { onDone..., onError..., onAbort... })
}
```

- [ ] **Step 4: 全量校验**

Run: `npx tsx --test tests/*.test.ts`
Run: `npm run type-check`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/ai-platform/components/ChatArea.vue
git commit -m "feat(ai): thread image style and optional ratio through chat area"
git push origin main
```

---

### Task 10: 全量校验 + 浏览器真机验证 + 收尾

**Files:**
- Runs tests/type-check; 人工浏览器验证。

- [ ] **Step 1: 全量单测 + 类型检查**

Run: `npx tsx --test tests/*.test.ts`
Run: `npm run type-check`
Expected: 全绿。

- [ ] **Step 2: 浏览器真机验证（`npm run dev` + `npm run dev:server`）**

1. `/ai` → 「生图」：出现比例/风格/模板控件，比例默认不选中。
2. 点「16:9」→ 生成 → 关键词带 size；下拉框中「返回编辑」恢复原始 prompt + 比例 chip 选中。
3. 选「国风水墨」风格 → 生成 → 消息卡显示「风格 · 国风水墨」。
4. 打开「模板」→ 点「水墨山水」的「同款」→ prompt 填入框 + 比例/风格选中 → 生成成功。
5. 「＋ 添加模板」→ 填名称/prompt/比例/风格 → 保存 → 出现在模板列表；点「删除」→ 移除。
6. 切到「Gemini 创作」：同样有比例/风格/模板；点「同款」填框；生成后用户消息显示比例/风格标签；比例对输出的影响待真机确认（默认不转发上游）。

- [ ] **Step 3: 若 `size` 被上游拒绝**

若真机发现某个 `size` 被 400/422 拒绝，确认兜底重试生效：带 size 失败 → 自动去掉 size 重试成功。若兜底不生效，回到 Task 3 调整映射集合或仅对有把握的比例发 size。

- [ ] **Step 4: 收尾提交（如有格式/文档改动）**

```bash
git add -A
git commit -m "chore(ai): verify doubao-style image generation feature"
git push origin main
```

---

## Self-Review（写完后对照 spec 逐条核对）

- 覆盖 spec 的「比例（size 映射 + 可选）」「风格（提示词后缀 + 消息存 style）」「模板·同款（内置 + 自定义 + 添加/删除）」「Gemini 记录 + 尽力转发（门控）」——已在 Task 3/5/6/7/9。✅
- 「比例默认不选」贯穿：Task 3 body 可选、Task 5 类型可选、Task 6 body 仅非空带、Task 7 UI 默认空。✅
- 无占位符：每个 code 步骤均为实际内容。✅
- 类型一致：`aspectRatio?: ImageAspectRatio`、`style?: string` 在 types/api/ChatArea/Composer 统一；`gptImageSizeFromRatio` 签名跨 Task 3/4 一致；`composeImagePrompt`/`imageStyleName` 跨 Task 1/8/9 一致。✅
- 风险标注：Gemini 转发默认关（`FORWARD_GEMINI_ASPECT_RATIO`）、size 兜底重试，均已在 Global Constraints 与 Task 3 说明。✅
