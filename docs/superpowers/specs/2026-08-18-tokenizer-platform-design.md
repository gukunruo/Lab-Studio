# Tokenizer 平台设计

## 概述

在 Lab Studio 中新增一个 Tokenizer 应用，支持 OpenAI、Claude、Doubao、DeepSeek、Kimi、GLM、Qianwen 等常见模型的 token 计算与可视化。参考 OpenAI tokenizer 页面，提供实时文本输入、token 计数和 token 边界高亮。

## 技术栈

- 前端：Vue 3 SFC + SCSS，复用现有设计系统（zinc 中性色 + teal 强调色，light/dark 主题，zh/en i18n）
- 后端：Hono 路由（`server/tokenizer.ts`），代理 Claude / Kimi 的 count API
- Token 引擎：统一接口，按模型分派到不同实现
- OpenAI 本地计算：tiktoken WASM（浏览器内运行）

## 整体架构

作为 Lab Studio 的一个新 app，slug = `tokenizer`，放在 `src/apps/tokenizer/` 下，遵循现有 app 约定（`meta.ts` + `index.vue` + 自动注册到 `_registry.ts`）。

### 三种 token 计算模式

1. **本地精确（OpenAI）**：tiktoken WASM，浏览器内运行，精确计数 + 可视化 token 边界高亮
2. **API 精确（Claude / Kimi）**：前端 → 后端 Hono 代理 → 官方 count API，保护 API Key。用户可选输入 API Key 启用精确模式；不输入 Key 时降级为估算
3. **本地估算（Doubao / DeepSeek / GLM / Qianwen）**：字符数 × 模型系数估算，UI 明确标注"近似值"

### App 页面模式

不增加 `entry` 或其他“模板/直出”开关。卡片点击后直接进入对应 app 的自定义页面，每个 app 自己负责完整的全屏布局和页面级交互。

- **框架改动**：`AppView.vue` 降为极薄的全屏组件加载器，只负责根据 slug 查找并渲染 app 组件，不再提供通用标题栏、stage 容器、文档按钮或浏览器全屏切换。
- **app 自定义**：每个 app 自己实现返回入口、顶部操作区、内容布局、错误状态和响应式行为。卡片仍通过现有的 slug 路由进入 app，不经过额外中间页。
- **tokenizer app**：直接在 `index.vue` 中实现全屏页面，自带左上角返回按钮和自己的页面工具栏。
- `_registry.ts` 删除 `entry` 类型字段，避免继续维护模板分支。另一个 agent 的 AI 平台也按同样方式由自己的页面组件负责布局。

## 模型分组

按厂商分组的下拉选择器：

| 厂商 | 模型 | 计算方式 |
|------|------|----------|
| OpenAI | gpt-4o, gpt-4, gpt-3.5-turbo | 本地精确（tiktoken WASM） |
| Anthropic | Claude (claude-sonnet-4, claude-opus-4 等) | API 精确（需 Key）/ 估算降级 |
| 月之暗面 | Kimi (moonshot-v1) | API 精确（需 Key）/ 估算降级 |
| 字节跳动 | Doubao | 本地估算 |
| DeepSeek | deepseek-chat, deepseek-coder | 本地估算 |
| 智谱 | GLM-4, GLM-3 | 本地估算 |
| 阿里 | Qianwen (qwen-turbo, qwen-plus, qwen-max) | 本地估算 |

默认选中 OpenAI gpt-4o（本地精确 + 可视化效果最好，打开即用）。

## 模块设计

### 1. 前端 `src/apps/tokenizer/`

```
src/apps/tokenizer/
├── meta.ts              # app 元信息
├── index.vue            # 主界面入口（自定义全屏页面）
├── components/
│   ├── ModelSelector.vue    # 模型分组下拉选择
│   ├── TextInput.vue        # 文本输入区
│   ├── TokenStats.vue       # token 计数统计展示
│   ├── TokenVisualizer.vue  # token 边界高亮可视化
│   └── ApiKeyPanel.vue      # API Key 输入（Claude / Kimi 可选）
├── engine/
│   ├── types.ts         # 统一接口定义
│   ├── tiktoken.ts      # OpenAI tiktoken WASM 封装
│   ├── api.ts           # Claude / Kimi API 调用（经后端代理）
│   ├── estimate.ts      # 本地估算引擎
│   ├── registry.ts      # 模型注册表 + 分派逻辑
│   └── coefficients.ts   # 各模型估算系数
└── composables/
    └── useTokenizer.ts  # 组合式函数，管理状态和计算
```

#### 统一接口 `engine/types.ts`

```typescript
export type TokenMode = 'local-exact' | 'api-exact' | 'estimate'

export interface TokenResult {
  count: number
  tokens: TokenSegment[]    // 用于可视化高亮
  mode: TokenMode            // 标注精确/估算
  model: string
}

export interface TokenSegment {
  text: string
  id: number
}

export interface TokenizerEngine {
  model: string
  mode: TokenMode
  requiresApiKey: boolean
  count(text: string, apiKey?: string): Promise<TokenResult>
}
```

### 2. 后端 `server/tokenizer.ts`

Hono 路由，挂在 `server/app.ts` 下：

```
POST /api/tokenizer/count
  Body: { model: string, text: string, apiKey?: string }
  Response: { count: number, tokens: TokenSegment[], mode: TokenMode }
```

- 支持 Claude（Anthropic Messages API count_tokens 端点）和 Kimi（Moonshot token 计算接口）
- API Key 从请求体传入，不持久化，不写日志
- 后端只做转发，不缓存

### 3. 估算系数 `engine/coefficients.ts`

基于经验数据的字符/token 比率：

| 模型类型 | 中文 字/token | 英文 字/token | 混合策略 |
|----------|---------------|---------------|----------|
| Claude | ~1.5 | ~4.0 | 按中英文比例加权 |
| Kimi | ~1.5 | ~4.0 | 按中英文比例加权 |
| Doubao | ~1.5 | ~4.0 | 按中英文比例加权 |
| DeepSeek | ~1.5 | ~4.0 | 按中英文比例加权 |
| GLM | ~1.5 | ~4.0 | 按中英文比例加权 |
| Qianwen | ~1.5 | ~4.0 | 按中英文比例加权 |

估算逻辑：统计中文字符数和英文单词数，按各自系数加权求和。UI 标注"近似值"。

## UI 布局（全屏）

```
┌─────────────────────────────────────────────────┐
│ ← 返回                              [tokenizer] │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│   模型选择        │    Token 统计                │
│   [OpenAI ▼]     │    总计: 42 tokens           │
│   gpt-4o         │    字符: 128                 │
│                  │    模式: 精确 ✓              │
│   ─────────────  │                              │
│                  │    Token 可视化              │
│   文本输入        │    [Hello] [ world] [!]     │
│   ┌────────────┐ │    [你好] [世界]              │
│   │            │ │                              │
│   │  输入文本  │ │    每个 token 用不同色块      │
│   │            │ │    高亮，hover 显示 ID        │
│   └────────────┘ │                              │
│                  │                              │
├──────────────────┴──────────────────────────────┤
│ API Key: [可选，用于 Claude/Kimi 精确计算]       │
└─────────────────────────────────────────────────┘
```

- 左侧：模型选择 + 文本输入
- 右侧：实时 token 统计 + 可视化高亮
- 底部：API Key 输入区（仅 Claude / Kimi 模型时显示）
- 支持 light/dark 主题
- 支持 zh/en 切换

## 数据流

```
用户输入文本
  → useTokenizer composable 监听变化（debounce 300ms）
  → engine/registry.ts 根据 model 分派
    → OpenAI: engine/tiktoken.ts 本地计算
    → Claude/Kimi (有 Key): POST /api/tokenizer/count → 后端代理 → 官方 API
    → Claude/Kimi (无 Key) / 其余: engine/estimate.ts 本地估算
  → 返回 TokenResult
  → 更新 TokenStats + TokenVisualizer
```

## 错误处理

- API Key 无效：显示错误提示，降级为估算模式
- API 调用失败（网络/超时）：显示错误，降级为估算模式
- tiktoken WASM 加载失败：显示错误，提示刷新
- 空文本：token 数为 0，清空可视化

## 测试

- 单元测试：估算系数计算、tiktoken 编码结果
- 集成测试：后端代理路由（mock 官方 API）
- E2E：输入文本 → 实时显示 token 数 → 切换模型 → 可视化高亮

## 框架改动

- `src/apps/_registry.ts`：删除 `AppMetaInput` 和相关类型中的 `entry` 字段。
- `src/views/AppView.vue`：移除通用标题栏、stage 容器、文档弹窗和浏览器全屏切换逻辑，保留 slug 对应组件的异步加载，并让根容器占满视口。
- `src/apps/tokenizer/index.vue`：实现完整的自定义全屏页面，包括返回按钮、工具栏、主体布局、API Key 状态和响应式适配。

## 依赖

- `tiktoken`（npm 包，提供 WASM tokenizer）或 `js-tiktoken`
- 无其他新依赖，复用项目现有的 Hono / Vue / Pinia
