# 生图能力迭代 · 需求 → 提示词卡 → 生成 设计

> 日期：2026-08-31
> 方案：构图描述 → AI 起草可编辑的提示词卡 → 用户确认/润色 → 出图；保留「直接生图」路径，用户可自选模式；gpt-image-2 与 gemini-3-pro-image 都接入。

## 1. 目标与范围

### 问题

现有生图（`/ai` 平台「生图」与「Gemini 创作」）是用户输入**一句 prompt 即直接出图**。描述写得不好时，图片模型会按字面理解，结果是「描述需求→效果不佳」。用户往往不知道该怎么描述才理想——缺一个把「需求/愿望」转成「高质量 prompt」且可交互的环节（优化 prompt、增加细节等）。

### 目标

在「需求 → 成图」之间加一层**交互式提示词起草**：用户输入一句需求，AI 起草一张**可编辑的提示词卡**（主题/风格/构图/细节/负面提示），用户确认、逐项润色、增减细节或追问补细节后再生成；出图后仍可「基于此图继续」迭代。

### 范围

- 新增「智能优化生图」模式，且与「直接生图」**并排可切换**（用户自选，不替用户决定）。
- `gpt-image-2`（生图 tab）与 `gemini-3-pro-image`（Gemini 创作 tab）**都**接入。
- 出图本体的链路（服务端 `/images/generations`、`/images/gemini`、参考图、重试/返回编辑/基于此图继续）**保持不变**，只在其前面插入起草层。
- 每次出图最多多**一次廉价的起草调用**，出图成本不变。

### 范围外

- 不改文本对话链路；「智能优化」只作用于生图输入区。
- 不做本地生图/扩散模型；仍是网关后面已有的图片模型。
- 不做图片编辑的所见即所得画布（保留现有「基于参考图编辑/继续」）。

## 2. 交互总览

在生图输入区，用户先选**模式**，再输入内容：

- **直接生图**：输入现成 prompt，回车即出图（＝现有链路，保留不动；仍走现有隐性联网消歧）。
- **智能优化生图**（新增）：输入一句需求，AI 起草提示词卡，用户确认/润色后再生图。

两种模式并排可切换（像「对话/生图/Gemini 创作」一样是用户可感知的选择）。进入「生图/Gemini 创作」时的**默认模式是「智能优化」**，可一键切回「直接」。

## 3. 提示词卡（新消息类型 `image-draft`）

AI 把需求拆成几个可单独编辑的要素，每个都是明文的词条：

| 要素 | 作用 | 交互 |
|---|---|---|
| 主题 | 画面核心主体（logo 主体：字母/图形/抽象符号） | 点击编辑 |
| 风格 | 艺术风格（扁平/3D/拟物/插画/摄影/极简） | 点击编辑 + 快捷风格 chips |
| 构图 | 主体位置、视角、画面比例 | 点击编辑 |
| 细节 | 材质、光影、配色、装饰元素、画面附加信息 | 增减详情 chips + 追问 |
| 负面提示 | 明确要避免的元素（杂乱背景、多余文字…） | 点击编辑 |

卡片动作：

- **确认生成** → 所有要素拼成一条最终 prompt → 走现有 `generateImage`/`generateGemini` 出图。
- **重新润色** → AI 基于当前需求重写整张卡（可换风格方向）。
- **增减细节** → 一组可点选 chips（加光影/加材质质感/强化主体/去杂乱），点即增删对应要素文本。
- **AI 追问补细节** → 卡片下方展开输入框，补一句（「做成深蓝色背景」），AI 补进合适要素。
- **直接编辑** → 点任一要素改原文。

### 落地增强（比「直接输入」更强）的关键杠杆

进度卡在「AI 起草一组要素 → 拼成 prompt」仍与直接输入**无本质区别**，因为缺了业界平台的真正质量杠杆。已落地：

- **风格预设**：`src/ai-platform/image-styles.ts` 的 `STYLE_PRESETS`（3D 渲染 / 扁平插画 / 写实摄影 / 电影质感 / 水墨国风 / 赛博朋克 / 极简 / 拟物 / 像素艺术 / 梦幻插画）。一键把用户「描述不好」的抽象风格替换成图片模型真正吃的高质量风格词——这是最大的单点杠杆。
- **负面预设**：`NEGATIVE_PRESETS`（模糊 / 文字水印 / 畸形 / 低清 / 变形）。一键勾选常见要避免元素，比手工写「避免」更稳。`toggleNegative` 按词元而非子串移除，避免误伤既有短语（如「过多文字水印」）。
- **画质增强**：`QUALITY_BOOSTER`（masterpiece/best quality/highly detailed…）默认追加到 prompt 尾部，`enhancePrompt` 组合。
- **提示词预览**：卡片底部实时展示最终拼好的 prompt，用户确认前可见完整内容。
- **结果迭代**：出图结果卡新增「换一版」（同 prompt 再生变体）与「返回编辑」（回到 composer 改描述），复用现有 retry/edit 链路。

## 4. 消息模型与时间线

在「智能优化」模式下，时间线新增一档：

```
image-request（你的需求，user）
   ↓
image-draft（AI 起草的提示词卡，assistant）   ← 新增消息类型
   ↓（可反复编辑/润色，卡原地更新）
image-result（确认生成后的图）                ← 复用现有
```

- 新增 `ImageDraftMessage`（`types.ts` 的 `ChatMessage` 并集成员），含 `requestId`、`modelId`、`facets`（结构化要素）、`prompt`（拼好的最终 prompt）、`status`、`createdAt`。
- 新增 `ImageDraftCard.vue` 渲染该卡，置于 `image-request` 与 `image-result` 之间；编辑/润色更新该条消息。
- 出图的 `image-result` 的 `requestId` 与 `image-request` 保持一致（沿用现有语义）。

### 前端触发（Composer）

- 生图输入区加**模式切换**（直接 / 智能优化），两个图片 tab 共用。
- 智能优化模式下，`generateImage`/`generateGemini` 先调起草端点拿 `image-draft`，而非直接出图；用户「确认生成」才走现有出图。
- `editImage`/`retryImage`/`use-as-reference` 逻辑保持；「返回编辑」在智能优化模式下回到 `image-draft` 卡（而非草稿框）。

## 5. 服务端：提示词起草服务

新增纯函数模块 `server/image-prompt-drafter.ts`（沿用 `image-prompt-enricher.ts` 的模式），新端点 `POST /ai-platform/images/draft`：

- 输入：`{ modelId, desire, referenceImageId?, history? }`（`history` 用于「追问补细节」时带上一版卡 + 补语）。
- 过程：Claude 原生 `web_search` 先消歧（沿用「豆包→拟人化助手」逻辑，复用 `buildAnthropicWebSearchTools`），再产出**结构化的要素 JSON**（主题/风格/构图/细节/负面提示 → 最终拼好的 `prompt`）。
- 输出：要素 JSON + 最终 prompt；任何失败（网络 / 非 2xx / 解析不出）都退化为「把需求原样当 prompt + 空要素」，绝不阻塞出图。
- 模型：默认 Haiku（同现有 enricher，可用 `ANTHROPIC_DRAFT_MODEL` 覆盖为 Sonnet），联网复用 Claude `web_search`，零新增 Key。

### 关键纯函数

- `buildImageDraftRequest(desire, config, opts)` —— 请求构建。
- `parseImageDraftResponse(payload)` —— 从 content 块提取结构化要素 + prompt（含 `<facets>...</facets>` 标记，`<prompt>...</prompt>` 标记）。
- `collapseDraftToPrompt(facets)` —— 要素拼成最终 prompt 的确定性逻辑（前端「确认生成」与服务端共用）。
- `draftImagePrompt(desire, config, opts)` —— 编排：构建→发→解析→兜底返回。

## 6. 覆盖范围与成本

- `gpt-image-2` 与 `gemini-3-pro-image` 都走「智能优化」；模式切换器在生图输入区，与图片模型选择并列。
- 起草为短任务，默认 Haiku；只多一次廉价调用，出图成本不变。

## 7. 测试与落地

- 单测覆盖 `server/image-prompt-drafter.ts` 全部纯函数：请求构建、响应解析（含缺失/非法）、要素拼 prompt、兜底退化。
- `collapseDraftToPrompt`（要素→最终 prompt）以 `server/image-prompt-drafter.ts` 为单一来源；前端「确认生成」在 `src/ai-platform/composer.ts` 用一个等价的纯函数镜像，两侧各有一组对齐模板的单测，避免漂移。
- `imageDraftConfirmFlow`（前端 `composer.ts`）：按提示词卡底层的愿望消息类型分发确认生成——`gemini-multimodal-user` 前驱走 Gemini 创作链路、`image-request` 前驱走 GPT 出图链路，非 draft 返回 `null`；有单测锁定，避免 Gemini 卡「确认生成」静默失效。
- 前端补 `image-draft` 消息类型 + `ImageDraftCard.vue` + Composer 模式切换。
- 真机：进入「智能优化」输需求 → 出提示词卡 → 确认生成 → 出图；切回「直接」仍即时出图。
