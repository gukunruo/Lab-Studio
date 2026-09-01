# 生图能力迭代：尺寸比例 + 风格 + 模板（对标豆包）

## Context

`/ai` 平台的「生图」与「Gemini 创作」两个图标签，目前输入框只支持「文本框 + 图片模型下拉 + 生成」。
`aspectRatio` 字段在类型里已存在，但：① 界面没有控件；② 服务端 `buildGptImageRequest` 发给 gpt-image-2 的 body 只有 `{ model, prompt }`，比例从未真正传上去——形同虚设。

用户要求参考豆包：输入框支持选择生图的尺寸比例、风格，以及支持模板（选择模板做「同款」，把对应 prompt 应用到输入框）。用户指定：**比例默认不选**，由用户主动选择；模板需内置 + 支持用户自建（在模板列表加「添加模板」入口）。控件作用到**生图 + Gemini 两个标签**。

## 目标

1. 比例选择器：用户点选比例后才作为请求参数；不选则走上游默认尺寸。
2. 风格选择器：一排可横向滑动的风格 chips，选中的风格用提示词后缀增强拼进实际发送的 prompt。
3. 模板 / 同款：内置模板 + 用户自定义模板；点「同款」把模板 prompt 填入输入框并选中其比例/风格。
4. 全部内联在 composer 的 `__image-mode` 区域，无弹窗、无二级确认。

## 控件设计

### 1. 尺寸比例
- 一排比例 chips：`1:1 / 4:3 / 3:4 / 16:9 / 9:16`。
- **默认不选**：初始无高亮；点了才选中；再次点击可取消回到不选。
- 选中后作为请求参数 `aspectRatio`（可选）；未选中时不传。
- 服务端把比例映射成 gpt-image 上游 `size`：

  | 比例 | size |
  |------|------|
  | 1:1 | 1024x1024 |
  | 4:3 | 1536x1024（就近映射，上游无精确 4:3） |
  | 3:4 | 1024x1536（就近映射） |
  | 16:9 | 1792x1024 |
  | 9:16 | 1024x1792 |

  ⚠️ 风险：TAL 网关可能只认部分 `size`。真机验证；若上游拒绝，**回退不加 `size`（默认尺寸）再试一次**，不阻塞出图。

### 2. 风格
- 一排可横向滑动的风格 chips（约 10 个），默认「无」。
- 模型无风格专用参数 → 用**提示词后缀增强**。前端发送时把选中风格的描述后缀追加到用户 prompt 尾部，作为一次请求的完整 `prompt`。
- 消息里记录 `style` id，便于在历史消息上显示「风格」标签。

| id | 名称 | 提示词后缀 |
|----|------|-----------|
| photorealistic | 写实摄影 | ，真实摄影质感，自然光影，高细节真实感 |
| 3d-render | 3D 渲染 | ，三维渲染风格，柔和光影，干净材质，类似 C4D/Blender 渲染 |
| flat-illustration | 扁平插画 | ，扁平矢量插画风格，简洁色块，几何造型 |
| ink-wash | 国风水墨 | ，中国水墨画风格，笔墨淋漓，留白意境，淡雅宣纸质感 |
| cyberpunk | 赛博朋克 | ，赛博朋克风格，霓虹灯，紫蓝配色，未来都市氛围 |
| cinematic | 电影质感 | ，电影级画面，电影感调色，宽画幅电影构图 |
| minimal | 极简 | ，极简风格，干净留白，单一主体，克制配色 |
| anime | 卡通动漫 | ，日系动漫风格，明亮清新，线条干净，二次元质感 |
| watercolor | 水彩手绘 | ，水彩手绘风格，柔和晕染，透明水彩质感，纸面肌理 |
| vintage-film | 复古胶片 | ，复古胶片风格，颗粒感，暖调褪色，怀旧氛围 |

### 3. 模板 / 同款
- 「模板」按钮在 composer 图片模式展开一个**面板**（非模态弹窗）。
- 内容：
  - **内置模板**：静态数据 `image-templates.ts`（约 8 个，含 name + prompt + 预设比例/风格）。
  - **自定义模板**：从 DB 按 `USER_KEY` 读取。
  - 每张卡一个「**同款**」按钮 → 把模板 prompt **填入输入框** + 选中其比例/风格，用户微调后生成。
  - 自定义模板卡提供删除。
  - 底部「**＋ 添加模板**」入口 → 内联表单（名称 + prompt + 比例 + 风格）→ 保存到库。

内置模板示例：

| id | 名称 | prompt | 比例 | 风格 |
|----|------|--------|------|------|
| city-night | 霓虹都市夜景 | 一座未来感十足的赛博朋克城市夜景，雨后的街道反光，高楼霓虹闪烁，行人撑伞 | 16:9 | cyberpunk |
| ink-mountain | 水墨山水 | 中国水墨风格的山水，远山近树，云雾缭绕，留白意境 | 4:3 | ink-wash |
| product-3d | 产品 3D 渲染 | 一个极简工业设计产品，3D 渲染，柔和影棚光，白色背景，质感干净 | 1:1 | 3d-render |
| cafe-watercolor | 水彩咖啡馆 | 街角咖啡馆，水彩手绘风格，阳光洒进窗户，温暖色调 | 3:4 | watercolor |
| space-cinema | 电影宇宙 | 宇航员在壮丽星云前的剪影，电影感构图，大片质感 | 16:9 | cinematic |
| minimal-poster | 极简海报 | 一株盆栽在纯色背景上的极简海报，大量留白，克制配色 | 1:1 | minimal |
| anime-girl | 日系插画 | 少女在樱花树下，日系动漫插画，明亮清新，微风花瓣 | 3:4 | anime |
| film-portrait | 复古肖像 | 一张复古胶片质感的人像，暖调褪色，颗粒感，怀旧氛围 | 4:3 | vintage-film |

## 覆盖面（两个图标签）

- **生图 (gpt-image)**：
  - 比例 → 映射上游 `size`（真正接通）。
  - 风格 → 提示词后缀。
  - 模板 → 「同款」填框 + 设比例/风格。
- **Gemini 创作**：
  - 风格、模板同样生效（纯提示词增强）。
  - 比例：**记录 + 尽力传参**。gemini 走 `chat/completions`，无明确 `size` 参数；先做到记录并在历史展示，是否影响输出尺寸待真机验证，若上游支持则转发、否则仅记录。

## 数据模型 / 消息类型

`src/ai-platform/types.ts`：
- `ImageAspectRatio` 从 `'1:1' | '16:9' | '9:16'` 扩为 `'1:1' | '4:3' | '3:4' | '16:9' | '9:16'`。
- `ImageRequestMessage`：`aspectRatio` 改为可选 `aspectRatio?: ImageAspectRatio`；新增 `style?: string`。
- `ImageResultMessage`：`aspectRatio` 改为可选；新增 `style?: string`。
- `GeminiMultimodalUserMessage`：新增 `aspectRatio?: ImageAspectRatio`、`style?: string`。

（旧持久化消息只有 `'1:1'|'16:9'|'9:16'` 仍合法，向后兼容。）

## 服务端改造

### 1. `server/ai-platform.ts`
- `ImageGenerationRequestBody.aspectRatio` 改可选，值集扩到 5 种：`'1:1' | '4:3' | '3:4' | '16:9' | '9:16'`。
- `IMAGE_ASPECT_RATIOS` 换成 `Set` 含 5 种；端点上 `if (body.aspectRatio && !IMAGE_ASPECT_RATIOS.has(body.aspectRatio))` 才 400（未选不校验）。
- 新增 `gptImageSizeFromRatio(ratio?)` → 返回映射的 `size` 字符串或 undefined。
- `buildGptImageRequest`：`body.aspectRatio` 存在时 JSON body 加 `size`；参考图 edits（multipart FormData）同样 `form.set('size', ...)`。
- 端点对 gpt-image：若带 `size` 被上游以 400/422 拒绝，回退去掉 `size` 重试一次。
- `GeminiMultimodalRequestBody` 增加可选 `aspectRatio?`；`buildGeminiMultimodalRequest` 记录并在 `chat/completions` body 中尽力带上（待真机确认的字段，见上）。
- 新增自定义模板端点：
  - `GET /ai-platform/image-templates` → 该 `USER_KEY` 的自定义模板列表。
  - `POST /ai-platform/image-templates`（body: name/prompt/aspectRatio?/style?）→ 创建，返回记录；`aspectRatio` 可选（未选留空），选中时校验是否在 5 种之列。
  - `DELETE /ai-platform/image-templates/:id` → 校验归属后删除。

### 2. `server/db/schema.ts`
新增表：

```ts
export const aiImageTemplates = sqliteTable('ai_image_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userKey: text('user_key').notNull(),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  aspectRatio: text('aspect_ratio'), // 可空：用户未选比例时留空，与应用「比例默认不选」一致
  style: text('style'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

（复用 `ai_conversations` 的 userKey 归属模式；migrate.ts 会按 schema 建表。）

## 前端改造

### 1. 新模块
- `src/ai-platform/image-styles.ts`：`IMAGE_STYLES`（id/name/suffix）+ `imageStyleSuffix(id)` + 由 `style` 取显示名的帮助函数。
- `src/ai-platform/image-templates.ts`：`IMAGE_TEMPLATES`（内置）+ `toTemplateInput(t)` 输出 `{ prompt, aspectRatio?, style? }`。

### 2. `src/ai-platform/components/Composer.vue`
- `imageAspectRatio = ref<ImageAspectRatio | ''>('')`。比例 chips 行（无默认高亮，点击选中/再点取消）。
- 风格 chips 行（横向滑动）+「模板」按钮。
- 模板面板：内置 + 自定义模板，各卡「同款」；自定义卡删除；底部「＋ 添加模板」内联表单。
- `generateImage()`：`aspectRatio: imageAspectRatio.value || undefined`；若选中风格，`prompt = userPrompt + suffix`，并带 `style`。
- 增加 `imageStyles` / `imageTemplates` prop（或在组件内 import 静态模块 + 接收自定义模板列表）。
- `restoreImageDraft`：兼容 `aspectRatio` 为 undefined 的情况（置空）。
- 新增 events：`add-template`、`delete-template`（交由父组件调 API），或 Composer 内直接调 `api.ts`。

### 3. `src/ai-platform/api.ts`
- `generateImage`：`aspectRatio` 仅在非空时加入请求体。
- 新增 `fetchImageTemplates()` / `createImageTemplate()` / `deleteImageTemplate()`。

### 4. 消息卡片
- `ImageMessageCard.vue` / `GeminiMultimodalCard.vue`：有 `aspectRatio`/`style` 时显示比例/风格标签（轻量小 chip）。

### 5. 父组件（ChatArea.vue）
- 传入自定义模板列表、处理 `add-template`/`delete-template`、拉取模板。

## 交互细节

- 比例/风格/模板都即时作用于当前请求；回车即出图，不打断输入流。
- 「同款」填入 prompt + 选中比例/风格，用户可改后再生成。
- 比例默认不选：不选 → 上游默认尺寸。
- 风格默认「无」。

## 测试

- `tests/`：
  - 更新 `buildGptImageRequest` 相关断言：`aspectRatio` 存在时 body 含 `size`；不存在时不含。
  - 新增 `buildGptImageRequest` 编辑（multipart）携带 `size` 的用例。
  - `gptImageSizeFromRatio` 映射单测（5 种 + undefined）。
  - 新增自定义模板端点单测（CRUD + 归属校验）。
  - 前端类型检查。
- `test-results/` 不应提交。

## 交付顺序（每步单独提交推送）

1. 前端数据模块 `image-styles.ts` + `image-templates.ts`（纯数据 + 帮助函数）。
2. 后端 `db/schema.ts` 加 `aiImageTemplates` 表 + 迁移。
3. 后端 `ai-platform.ts`：`size` 映射、`aspectRatio` 可选化、gemini 比例记录，模板 CRUD 端点。
4. 后端相关单测（size 映射 + 模板端点）。
5. 前端 `types.ts`（类型 + 可选 ratio/style）。
6. 前端 `api.ts`（模板 API + generateImage 可选 ratio）。
7. 前端 `Composer.vue`（比例 chips + 风格 chips + 模板面板/同款/添加）。
8. 消息卡片显示比例/风格标签。
9. 全量校验（单测 + 类型检查 + 浏览器真机）+ 提交推送收尾。

## 风险 / 待真机验证

- 网关对 `size` 的接受范围：若不认，回退默认尺寸重试。
- gemini 比例是否影响输出尺寸：优先记录 + 尽力转发，待真机确认。
- 「＋添加模板」自建依赖 DB，属本次范围。
