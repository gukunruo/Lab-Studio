import type { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { and, eq, desc } from 'drizzle-orm'
import { db } from './db/client'
import { aiModels, aiConversations, aiPreferences, aiRecommendationBatches } from './db/schema'
import {
  decodeBase64Image,
  imageAssetUrl,
  readImageAsset,
  storeImageAsset,
  type DecodedImage,
} from './ai-image-assets'
import { seedAiModels } from './ai-platform-seed'
import { engineerContext } from './context-engine'
import { buildAnthropicWebSearchTools, runWebSearch } from './web-search'
import {
  buildAnthropicTools,
  buildOpenAiTools,
  createFinanceQuoteExecutor,
  createWebFetchExecutor,
  MAX_AGENT_ROUNDS,
  readAnthropicTurn,
  readOpenAiTurn,
  runAgentLoop,
  type AgentChatMessage,
  type AgentToolRegistry,
} from './agent-engine'

const USER_KEY = 'admin'

type AnthropicConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

type SupportedModelProvider = 'openai-compatible' | 'anthropic'

function isSupportedModelProvider(value: unknown): value is SupportedModelProvider {
  return value === 'openai-compatible' || value === 'anthropic'
}

function readAnthropicConfig(): AnthropicConfig | null {
  const envConfig = {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? '',
    model: process.env.ANTHROPIC_MODEL ?? '',
  }
  if (envConfig.apiKey && envConfig.baseUrl) {
    return { ...envConfig, model: envConfig.model || 'claude-sonnet-4.6' }
  }

  try {
    const raw = readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8')
    const env = (JSON.parse(raw) as { env?: Record<string, string> }).env ?? {}
    const apiKey = envConfig.apiKey || env.ANTHROPIC_API_KEY || ''
    const baseUrl = envConfig.baseUrl || env.ANTHROPIC_BASE_URL || ''
    if (!apiKey || !baseUrl) return null
    return {
      apiKey,
      baseUrl,
      model: envConfig.model || env.ANTHROPIC_MODEL || 'claude-sonnet-4.6',
    }
  } catch {
    return null
  }
}

let seedPromise: Promise<void> | null = null
function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedAiModels().catch((e) => {
      console.error('AI platform seed failed:', e)
    })
  }
  return seedPromise
}

export interface ChatRequestBody {
  modelId: string
  messages: { role: string; content: string }[]
  system?: string
  summary?: string
  params?: { reasoningEffort?: string; maxTokens?: number; webSearch?: boolean }
}

interface UpstreamConfig {
  provider: string
  modelId: string
  baseUrl: string
  appId: string
  appKey: string
}

export interface UpstreamRequest {
  url: string
  headers: Headers
  body: string | FormData | null
}

export type ImageGenerationRequestBody = {
  modelId: string
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16'
  referenceImageId?: string
}

export type GeminiMultimodalRequestBody = {
  prompt: string
  referenceImageId?: string
}

export type GeminiMultimodalResponse = {
  content: string
  imageUrl?: string
}

type PrivateImageReference = {
  bytes: Buffer
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}

type ImageGenerationConfig = {
  baseUrl: string
  appId: string
  appKey: string
}

const IMAGE_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16'])
const IMAGE_PROMPT_MAX = 2_000

function readImageGenerationConfig(): ImageGenerationConfig | null {
  const appId = process.env.TAL_MLOPS_APP_ID ?? ''
  const appKey = process.env.TAL_MLOPS_APP_KEY ?? ''
  if (!appId || !appKey) return null
  return {
    baseUrl: process.env.TAL_AI_BASE_URL ?? 'http://ai-service.tal.com',
    appId,
    appKey,
  }
}

function imageUpstreamHeaders(config: ImageGenerationConfig, contentType?: string): Headers {
  return new Headers({
    Authorization: `Bearer ${config.appId}:${config.appKey}`,
    'api-key': `${config.appId}:${config.appKey}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  })
}

function privateImageDataUrl(reference: PrivateImageReference): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(reference.mimeType)) return null
  return `data:${reference.mimeType};base64,${reference.bytes.toString('base64')}`
}

function imageExtension(mimeType: PrivateImageReference['mimeType']): 'png' | 'jpg' | 'webp' {
  if (mimeType === 'image/jpeg') return 'jpg'
  return mimeType === 'image/webp' ? 'webp' : 'png'
}

export function buildGptImageRequest(
  body: ImageGenerationRequestBody,
  config: ImageGenerationConfig,
  reference?: PrivateImageReference,
): UpstreamRequest {
  const baseUrl = config.baseUrl.replace(/\/$/, '')
  if (!reference) {
    return {
      url: `${baseUrl}/openai-compatible/v1/images/generations`,
      headers: imageUpstreamHeaders(config, 'application/json'),
      body: JSON.stringify({ model: 'gpt-image-2', prompt: body.prompt }),
    }
  }

  const form = new FormData()
  form.set('model', 'gpt-image-2')
  form.set('prompt', body.prompt)
  form.set('image', new Blob([reference.bytes], { type: reference.mimeType }), `reference.${imageExtension(reference.mimeType)}`)
  return {
    url: `${baseUrl}/openai-compatible/v1/images/edits`,
    headers: imageUpstreamHeaders(config),
    body: form,
  }
}

export function buildGeminiMultimodalRequest(
  body: GeminiMultimodalRequestBody,
  config: ImageGenerationConfig,
  reference?: PrivateImageReference,
): UpstreamRequest {
  const content = reference
    ? (() => {
        const dataUrl = privateImageDataUrl(reference)
        if (!dataUrl) throw new Error('unsupported private image MIME type')
        return [
          { type: 'text', text: body.prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ]
      })()
    : body.prompt

  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/openai-compatible/v1/chat/completions`,
    headers: imageUpstreamHeaders(config, 'application/json'),
    body: JSON.stringify({
      model: 'gemini-3-pro-image',
      messages: [{ role: 'user', content }],
      modalities: ['text', 'image'],
    }),
  }
}

export function buildImageGenerationRequest(body: ImageGenerationRequestBody, config: ImageGenerationConfig): UpstreamRequest {
  return body.modelId === 'gemini-3-pro-image'
    ? buildGeminiMultimodalRequest(body, config)
    : buildGptImageRequest(body, config)
}

function asHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function decodeImageDataUrl(value: unknown): DecodedImage | null {
  if (typeof value !== 'string') return null
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value)
  if (!match) return null
  const image = decodeBase64Image(match[2])
  return image?.mimeType === match[1].toLowerCase() ? image : null
}

export type NormalizedImageGenerationResponse =
  | { kind: 'url'; imageUrl: string }
  | { kind: 'base64'; image: DecodedImage }

type NormalizedGeminiImage = { imageUrl: string } | DecodedImage

function normalizeGeminiImage(message: Record<string, unknown> | undefined): NormalizedGeminiImage | null {
  const images = message?.images
  if (Array.isArray(images)) {
    const image = images[0] as Record<string, unknown> | undefined
    const value = image?.url
      ?? (image?.image_url as Record<string, unknown> | undefined)?.url
    const imageUrl = asHttpsUrl(value)
    if (imageUrl) return { imageUrl }
    const decodedImage = decodeImageDataUrl(value)
    if (decodedImage) return decodedImage
  }

  const content = message?.content
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const value = item as Record<string, unknown>
      const image = value.image_url as Record<string, unknown> | undefined
      const imageUrl = asHttpsUrl(image?.url)
      if (imageUrl) return { imageUrl }
      const decodedImage = decodeImageDataUrl(image?.url)
      if (decodedImage) return decodedImage
    }
  }
  return null
}

function firstGeminiMessage(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const choices = (payload as Record<string, unknown>).choices
  const choice = Array.isArray(choices) ? choices[0] as Record<string, unknown> | undefined : undefined
  const message = choice?.message
  return message && typeof message === 'object' ? message as Record<string, unknown> : undefined
}

export function normalizeGeminiMultimodalResponse(payload: unknown): {
  content: string
  image?: NormalizedGeminiImage
} | null {
  const message = firstGeminiMessage(payload)
  const content = typeof message?.content === 'string' ? message.content : ''
  const image = normalizeGeminiImage(message)
  return content || image ? { content, ...(image ? { image } : {}) } : null
}

export function normalizeImageGenerationResponse(payload: unknown): NormalizedImageGenerationResponse | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const data = root.data
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined
    const imageUrl = asHttpsUrl(first?.url)
    if (imageUrl) return { kind: 'url', imageUrl }
    const image = decodeBase64Image(first?.b64_json)
    if (image) return { kind: 'base64', image }
  }

  const image = normalizeGeminiImage(firstGeminiMessage(payload))
  if (!image) return null
  return 'imageUrl' in image ? { kind: 'url', imageUrl: image.imageUrl } : { kind: 'base64', image }
}

export async function imageAssetResponse(userKey: string, id: string): Promise<Response> {
  const asset = await readImageAsset(userKey, id)
  if (!asset) {
    return Response.json({ error: '图片不存在或已不可用。' }, { status: 404 })
  }
  return new Response(asset.bytes, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(asset.bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function asPrivateImageReference(value: Awaited<ReturnType<typeof readImageAsset>>): PrivateImageReference | null {
  if (!value || !['image/png', 'image/jpeg', 'image/webp'].includes(value.mimeType)) return null
  return value as PrivateImageReference
}

async function resolvePrivateImageReference(referenceImageId: unknown): Promise<PrivateImageReference | null> {
  if (referenceImageId === undefined) return null
  if (typeof referenceImageId !== 'string') return null
  return asPrivateImageReference(await readImageAsset(USER_KEY, referenceImageId))
}

function hasInvalidReferenceImageId(value: unknown): boolean {
  return value !== undefined && typeof value !== 'string'
}

export function buildAnthropicPlatformRequest(
  body: ChatRequestBody,
  config: AnthropicConfig,
  tools?: unknown[],
): UpstreamRequest {
  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/v1/messages`,
    headers: new Headers({
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'User-Agent': 'claude-cli/2.0.0 (external, cli)',
      'x-app': 'cli',
      'x-stainless-lang': 'js',
      'x-stainless-runtime': 'node',
    }),
    body: JSON.stringify({
      model: body.modelId,
      messages: body.messages,
      max_tokens: body.params?.maxTokens ?? 4096,
      stream: true,
      ...(body.system ? { system: body.system } : {}),
      // 显式传入的工具（Agent 循环的客户端工具）优先；否则退回原生 web_search 直通。
      ...(tools && tools.length ? { tools } : body.params?.webSearch ? { tools: buildAnthropicWebSearchTools(3) } : {}),
    }),
  }
}

// 构建「Agent 工具循环」用的统一工具注册表：单一事实源，既是发给上游的工具定义，
// 也是按名字分发执行的依据。web_search 的检索执行复用 Claude web_search（零新增 Key），
// web_fetch / finance_quote 各自走本地 executor。
function buildAgentRegistry(anthropicConfig: AnthropicConfig | null): AgentToolRegistry {
  return {
    web_search: {
      name: 'web_search',
      description:
        '联网检索最新、实时或事实性问题，返回权威来源的摘要。当用户的提问涉及最新信息、时效性问题、或需要核实事实时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，应精炼并突出核心实体与时间' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = typeof args.query === 'string' ? args.query.trim() : ''
        if (!query) return '（未提供有效的搜索关键词）'
        if (!anthropicConfig) return '（未配置联网检索能力）'
        return runWebSearch(query, {
          apiKey: anthropicConfig.apiKey,
          baseUrl: anthropicConfig.baseUrl,
          model: anthropicConfig.model,
        })
      },
    },
    web_fetch: {
      name: 'web_fetch',
      description:
        '抓取指定 URL 的正文内容并去掉 HTML 标签，用于查看某个具体的网页或来源的详细内容。当模型已有一个明确链接、需要读取其正文时使用。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要抓取的完整 URL，仅支持 http/https' },
        },
        required: ['url'],
      },
      execute: createWebFetchExecutor(),
    },
    finance_quote: {
      name: 'finance_quote',
      description:
        '查询 A股、港股或指数的实时行情摘要（名称、代码、现价、涨跌幅、今日开高低、成交额、市盈率等）。输入股票名称或代码，如「600519」或「贵州茅台」或「00700」。',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: '标的名称或代码，如 600519 / 贵州茅台 / 00700' },
        },
        required: ['q'],
      },
      execute: createFinanceQuoteExecutor(),
    },
  }
}

export function buildUpstreamRequest(body: ChatRequestBody, config: UpstreamConfig, tools?: unknown[]): UpstreamRequest {
  const { provider, modelId, baseUrl, appId, appKey } = config
  const authHeader = `Bearer ${appId}:${appKey}`

  if (provider === 'anthropic') {
    const payload: Record<string, unknown> = {
      model: modelId,
      messages: body.messages,
      max_tokens: body.params?.maxTokens ?? 4096,
      stream: true,
    }
    if (body.system) payload.system = body.system
    return {
      url: `${baseUrl.replace(/\/$/, '')}/v1/messages`,
      headers: new Headers({
        Authorization: authHeader,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }
  }

  // openai-compatible
  const messages = [...body.messages]
  if (body.system) {
    messages.unshift({ role: 'system', content: body.system })
  }
  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
    stream: true,
  }
  if (modelId === 'doubao-seed-2.0-mini') {
    payload.stream_options = { include_usage: true }
    payload.reasoning = {
      mode: 'enabled',
      effort: body.params?.reasoningEffort ?? 'low',
    }
  } else if (modelId === 'kimi-k3') {
    payload.reasoning = {
      mode: 'enabled',
      effort: body.params?.reasoningEffort ?? 'low',
    }
  } else if (body.params?.reasoningEffort) {
    payload.reasoning_effort = body.params.reasoningEffort
  }
  if (tools && tools.length) {
    payload.tools = tools
  }
  return {
    url: `${baseUrl.replace(/\/$/, '')}/openai-compatible/v1/chat/completions`,
    headers: new Headers({
      Authorization: authHeader,
      'api-key': `${appId}:${appKey}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  }
}

const SSE_RESPONSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

type ConversationOutlineItem = {
  messageIndex: number
  title: string
  detail: string
}

type ConversationDigest = {
  summary: string
  outline: ConversationOutlineItem[]
  sourceMessageCount: number
  updatedAt: string
}

export interface ConversationUpdate {
  title?: string
  modelId?: string
  systemPrompt?: string
  params?: Record<string, unknown>
  messages?: unknown[]
  pinned?: boolean
  digest?: ConversationDigest | null
  digestMessageCount?: number
}

const TITLE_MAX = 200
const MESSAGE_MAX_AI = 500
const DIGEST_SUMMARY_MAX = 2_000
const DIGEST_OUTLINE_MAX = 8
const DIGEST_OUTLINE_TITLE_MAX = 120
const DIGEST_OUTLINE_DETAIL_MAX = 600

type AiThemePreference = 'system' | 'light' | 'dark'

type AiPreferences = {
  theme: AiThemePreference
}

function normalizeAiPreferences(value: unknown): AiPreferences {
  if (!value || typeof value !== 'object') return { theme: 'system' }
  const theme = (value as Record<string, unknown>).theme
  return { theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system' }
}

function summarizeConversation(messages: unknown[]): string {
  const firstUserMessage = messages.find((message) => {
    if (!message || typeof message !== 'object') return false
    const value = message as Record<string, unknown>
    return value.role === 'user' && (typeof value.content === 'string' || typeof value.prompt === 'string')
  }) as { content?: string; prompt?: string } | undefined
  const content = (firstUserMessage?.content ?? firstUserMessage?.prompt ?? '').replace(/\s+/g, ' ').trim()
  return content ? content.slice(0, 48) + (content.length > 48 ? '…' : '') : '新对话'
}

export function conversationKind(messages: unknown[] | null | undefined): 'chat' | 'image' {
  if (!Array.isArray(messages)) return 'chat'
  const first = messages[0] as { type?: unknown } | undefined
  return first !== null && typeof first === 'object' && first.type === 'image-request' ? 'image' : 'chat'
}

type Recommendation = {
  title: string
  desc: string
  query: string
  category: string
}

const RECOMMENDATION_BATCH_SIZE = 20
const RECOMMENDATION_DELIVERY_SIZE = 4

function parseRecommendationPayload(text: string): Recommendation[] {
  const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText.trim())
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item): Recommendation[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    if (typeof value.title !== 'string' || typeof value.desc !== 'string' || typeof value.query !== 'string') return []
    const category = typeof value.category === 'string' && value.category.trim()
      ? value.category.trim().slice(0, 24)
      : '科技'
    return [{
      title: value.title.trim().slice(0, 80),
      desc: value.desc.trim().slice(0, 120),
      query: value.query.trim().slice(0, 180),
      category,
    }]
  }).filter((item) => item.title && item.desc && item.query).slice(0, RECOMMENDATION_BATCH_SIZE)
}

let recommendationGeneration: Promise<void> | null = null
let recommendationDelivery = Promise.resolve()

function withRecommendationDelivery<T>(operation: () => Promise<T>): Promise<T> {
  const result = recommendationDelivery.then(operation, operation)
  recommendationDelivery = result.then(() => undefined, () => undefined)
  return result
}

async function insertRecommendationBatch(items: Recommendation[]): Promise<void> {
  if (!items.length) return
  const now = new Date()
  db.transaction((tx) => {
    const previousBatches = tx.select({ id: aiRecommendationBatches.id })
      .from(aiRecommendationBatches)
      .all()
    tx.insert(aiRecommendationBatches).values({
      items,
      deliveredCount: 0,
      createdAt: now,
      updatedAt: now,
    }).run()
    for (const batch of previousBatches) {
      tx.delete(aiRecommendationBatches)
        .where(eq(aiRecommendationBatches.id, batch.id))
        .run()
    }
  })
}

function startRecommendationGeneration(): Promise<void> {
  if (recommendationGeneration) return recommendationGeneration
  recommendationGeneration = generateLiveRecommendations()
    .then(insertRecommendationBatch)
    .catch((error) => console.error('[recommendations] background refill failed', error))
    .finally(() => { recommendationGeneration = null })
  return recommendationGeneration
}

function randomRecommendations(items: Recommendation[]): Recommendation[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]!, shuffled[index]!]
  }
  return shuffled.slice(0, RECOMMENDATION_DELIVERY_SIZE)
}

async function claimRecommendationBatch(): Promise<Recommendation[]> {
  return withRecommendationDelivery(async () => {
    const batch = await db.select().from(aiRecommendationBatches).orderBy(desc(aiRecommendationBatches.id)).get()
    if (!batch) return []
    const items = (batch.items ?? []) as Recommendation[]
    const available = items.slice(batch.deliveredCount, batch.deliveredCount + RECOMMENDATION_DELIVERY_SIZE)
    if (available.length === RECOMMENDATION_DELIVERY_SIZE) {
      const result = await db.update(aiRecommendationBatches).set({
        deliveredCount: batch.deliveredCount + RECOMMENDATION_DELIVERY_SIZE,
        updatedAt: new Date(),
      }).where(and(
        eq(aiRecommendationBatches.id, batch.id),
        eq(aiRecommendationBatches.deliveredCount, batch.deliveredCount),
      ))
      if (result.changes === 1) return available
    }
    return randomRecommendations(items)
  })
}

async function warmRecommendationPool(): Promise<void> {
  await ensureSeeded()
  const batch = await db.select().from(aiRecommendationBatches)
    .orderBy(desc(aiRecommendationBatches.id))
    .get()
  if (batch) {
    const items = (batch.items ?? []) as Recommendation[]
    if (batch.deliveredCount < items.length) return
  }
  await startRecommendationGeneration()
}

export async function warmAiRecommendations(): Promise<void> {
  await warmRecommendationPool()
}

async function generateLiveRecommendations(): Promise<Recommendation[]> {
  const deepseek = await db.select().from(aiModels).where(eq(aiModels.modelId, 'deepseek-v4-flash')).get()
  const appId = process.env.TAL_MLOPS_APP_ID ?? ''
  const appKey = process.env.TAL_MLOPS_APP_KEY ?? ''
  const anthropicConfig = readAnthropicConfig()
  const model = deepseek && appId && appKey
    ? deepseek
    : await db.select().from(aiModels).where(eq(aiModels.modelId, 'claude-sonnet-4.6')).get()

  console.info('[recommendations] model', {
    found: Boolean(model),
    provider: model?.provider,
    modelId: model?.modelId,
    usingOpenAiCompatible: Boolean(deepseek && appId && appKey),
    hasAnthropicConfig: Boolean(anthropicConfig),
  })
  if (!model || model.category === 'image') {
    throw new Error('recommendation model is unavailable')
  }
  if (model.provider === 'anthropic' && !anthropicConfig) {
    throw new Error('AI credentials not configured')
  }

  const prompt = `本次推荐请求批次 ID：${randomUUID()}。你是 AI 对话首页的“为你推荐”编辑。请基于当前日期和你掌握的最新公开信息，生成一批与上一批完全不同的 20 条话题。

你必须每次重新构思，禁止复用示例、固定模板或上一批表达；每条话题都要让用户有点击兴趣。

风格要求：
- 第一条优先放一条“资讯：……”格式的近期热点、科技进展、产业动态或公共事件；如果无法确认具体新闻，就写成“最近有哪些……值得关注？”这类不编造事实的开放问题。
- 其余话题要有明显差异，可以是科普、文化、生活、教育、职场、创意、金融、科技、AI 等，不要局限在固定四类。
- 每条必须是一句完整、自然、有上下文的问题或请求，让用户点开后可以直接交给 AI；不要只写几个词或短标签。
- 话题要具体、有趣、有想象空间，避免空泛和过时的模板问题。
- 不要编造无法确认的新闻事实、数字或来源；不确定时改成趋势分析、解释或提问。

只返回 JSON 数组，不要 Markdown，不要解释。每项格式为 {"title":"完整且有吸引力的一句话","desc":"可为空的补充说明","query":"点击后直接发送给 AI 的完整问题","category":"资讯|科技|AI|金融|科普|文化|生活|教育|职场|创意"}。`

  let response: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    if (model.provider === 'anthropic') {
      const config = readAnthropicConfig()
      console.info('[recommendations] anthropic config', {
        hasApiKey: Boolean(config?.apiKey),
        hasBaseUrl: Boolean(config?.baseUrl),
        model: config?.model,
      })
      if (!config) throw new Error('Anthropic credentials not configured')
      response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'User-Agent': 'claude-cli/2.0.0 (external, cli)',
          'x-app': 'cli',
          'x-stainless-lang': 'js',
          'x-stainless-runtime': 'node',
        },
        body: JSON.stringify({ model: config.model, max_tokens: 1800, messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal,
      })
    } else {
      const appId = process.env.TAL_MLOPS_APP_ID ?? ''
      const appKey = process.env.TAL_MLOPS_APP_KEY ?? ''
      const baseUrl = (process.env.TAL_AI_BASE_URL ?? 'http://ai-service.tal.com').replace(/\/$/, '')
      console.info('[recommendations] openai-compatible config', {
        hasAppId: Boolean(appId),
        hasAppKey: Boolean(appKey),
        baseUrl,
      })
      if (!appId || !appKey) throw new Error('OpenAI-compatible credentials not configured')
      response = await fetch(`${baseUrl}/openai-compatible/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appId}:${appKey}`,
          'api-key': `${appId}:${appKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.modelId,
          max_tokens: 1800,
          messages: [{ role: 'user', content: prompt }],
          ...(model.modelId === 'doubao-seed-2.0-mini'
            ? {
                stream: false,
                stream_options: { include_usage: true },
                reasoning: { mode: 'enabled', effort: 'low' },
              }
            : {}),
        }),
        signal: controller.signal,
      })
    }
    const contentType = response.headers.get('content-type') ?? ''
    console.info('[recommendations] upstream response', {
      status: response.status,
      contentType,
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`upstream returned ${response.status}${errorText ? `: ${errorText.slice(0, 240)}` : ''}`)
    }
    if (contentType.includes('text/event-stream')) {
      throw new Error('upstream returned SSE; recommendation aggregation is not enabled')
    }
    const payload = await response.json() as { content?: Array<{ text?: string }>; choices?: Array<{ message?: { content?: string } }> }
    const content = payload.content?.[0]?.text ?? payload.choices?.[0]?.message?.content ?? ''
    const recommendations = parseRecommendationPayload(content)
    console.info('[recommendations] parsed', { count: recommendations.length })
    if (!recommendations.length) throw new Error('upstream response did not contain valid recommendations')
    return recommendations
  } catch (error) {
    console.error('[recommendations] generation failed', error)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function normalizeConversationDigest(value: unknown): ConversationDigest | null {
  if (!value || typeof value !== 'object') return null
  const digest = value as Record<string, unknown>
  if (typeof digest.summary !== 'string' || !Array.isArray(digest.outline)) return null
  const sourceMessageCount = typeof digest.sourceMessageCount === 'number'
    ? Math.max(0, Math.floor(digest.sourceMessageCount))
    : 0
  const updatedAt = typeof digest.updatedAt === 'string' ? digest.updatedAt : new Date().toISOString()
  const outline = digest.outline.flatMap((item): ConversationOutlineItem[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    if (typeof value.messageIndex !== 'number' || typeof value.title !== 'string' || typeof value.detail !== 'string') return []
    return [{
      messageIndex: Math.max(0, Math.floor(value.messageIndex)),
      title: value.title.trim().slice(0, DIGEST_OUTLINE_TITLE_MAX),
      detail: value.detail.trim().slice(0, DIGEST_OUTLINE_DETAIL_MAX),
    }]
  }).filter((item) => item.title).slice(0, DIGEST_OUTLINE_MAX)
  return {
    summary: digest.summary.trim().slice(0, DIGEST_SUMMARY_MAX),
    outline,
    sourceMessageCount,
    updatedAt,
  }
}

export function normalizeConversationUpdate(input: ConversationUpdate): ConversationUpdate {
  const result: ConversationUpdate = {}
  if (typeof input.title === 'string') {
    result.title = input.title.slice(0, TITLE_MAX)
  }
  if (typeof input.modelId === 'string') {
    result.modelId = input.modelId
  }
  if (typeof input.systemPrompt === 'string') {
    result.systemPrompt = input.systemPrompt.slice(0, 10_000)
  }
  if (input.params !== undefined && typeof input.params === 'object' && input.params !== null) {
    result.params = input.params
  }
  if (Array.isArray(input.messages)) {
    result.messages = input.messages.slice(0, MESSAGE_MAX_AI)
  } else {
    result.messages = []
  }
  if (typeof input.pinned === 'boolean') {
    result.pinned = input.pinned
  }
  if (input.digest === null) {
    result.digest = null
  } else if (input.digest !== undefined) {
    result.digest = normalizeConversationDigest(input.digest)
  }
  if (typeof input.digestMessageCount === 'number') {
    result.digestMessageCount = Math.max(0, Math.floor(input.digestMessageCount))
  }
  return result
}

export function registerAiPlatformRoutes(app: Hono): void {
  app.get('/ai-platform/preferences', async (c) => {
    const row = await db
      .select()
      .from(aiPreferences)
      .where(eq(aiPreferences.userKey, USER_KEY))
      .get()
    return c.json(normalizeAiPreferences(row?.preferences))
  })

  app.put('/ai-platform/preferences', async (c) => {
    const normalized = normalizeAiPreferences(await c.req.json().catch(() => null))
    await db
      .insert(aiPreferences)
      .values({ userKey: USER_KEY, preferences: normalized, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: aiPreferences.userKey,
        set: { preferences: normalized, updatedAt: new Date() },
      })
    return c.json(normalized)
  })

  // 模型库 — 列出所有启用的模型，按 category 分组返回
  app.get('/ai-platform/models', async (c) => {
    await ensureSeeded()
    const rows = await db.select().from(aiModels).where(eq(aiModels.enabled, 1)).all()
    const grouped: Record<string, Array<typeof rows[number] & { status?: 'available' | 'unavailable'; statusReason?: string }>> = { chat: [], reasoning: [], image: [] }
    for (const row of rows) {
      const cat = row.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push({ ...row, status: 'available' })
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return c.json(grouped)
  })

  // 模型库 — 新增
  app.post('/ai-platform/models', async (c) => {
    const body = await c.req.json<{
      modelId: string
      displayName: string
      provider: string
      category: string
      vendor: string
      capabilities?: string[]
      contextWindow?: number | null
      sortOrder?: number
    }>()
    if (!body.modelId || !body.displayName || !body.provider || !body.category || !body.vendor) {
      return c.json({ error: 'modelId, displayName, provider, category, vendor are required' }, 400)
    }
    if (!isSupportedModelProvider(body.provider)) return c.json({ error: 'unsupported provider' }, 400)
    const now = new Date()
    const result = await db.insert(aiModels).values({
      modelId: body.modelId,
      displayName: body.displayName,
      provider: body.provider,
      category: body.category as 'chat' | 'reasoning' | 'image',
      vendor: body.vendor,
      capabilities: body.capabilities ?? [],
      contextWindow: body.contextWindow ?? null,
      sortOrder: body.sortOrder ?? 99,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return c.json(result[0], 201)
  })

  // 模型库 — 编辑
  app.put('/ai-platform/models/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const body = await c.req.json<Partial<{
      displayName: string
      provider: string
      category: string
      vendor: string
      capabilities: string[]
      contextWindow: number | null
      sortOrder: number
      enabled: number
    }>>()
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.provider !== undefined && !isSupportedModelProvider(body.provider)) {
      return c.json({ error: 'unsupported provider' }, 400)
    }
    if (body.displayName !== undefined) update.displayName = body.displayName
    if (body.provider !== undefined) update.provider = body.provider
    if (body.category !== undefined) update.category = body.category
    if (body.vendor !== undefined) update.vendor = body.vendor
    if (body.capabilities !== undefined) update.capabilities = body.capabilities
    if (body.contextWindow !== undefined) update.contextWindow = body.contextWindow
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder
    if (body.enabled !== undefined) update.enabled = body.enabled
    await db.update(aiModels).set(update).where(eq(aiModels.id, id))
    const updated = await db.select().from(aiModels).where(eq(aiModels.id, id)).get()
    return c.json(updated)
  })

  // 模型库 — 删除
  app.delete('/ai-platform/models/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    await db.delete(aiModels).where(eq(aiModels.id, id))
    return c.json({ ok: true })
  })

  // 会话管理 — 列出当前用户的所有会话（不含 messages 全文）
  app.get('/ai-platform/conversations', async (c) => {
    const rows = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        modelId: aiConversations.modelId,
        systemPrompt: aiConversations.systemPrompt,
        params: aiConversations.params,
        messages: aiConversations.messages,
        pinned: aiConversations.pinned,
        parentConversationId: aiConversations.parentConversationId,
        digest: aiConversations.digest,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .where(eq(aiConversations.userKey, USER_KEY))
      .orderBy(desc(aiConversations.updatedAt))
      .all()
    return c.json(rows.map(({ messages, digest, ...row }) => ({
      ...row,
      kind: conversationKind(messages),
      hasDigest: Boolean(normalizeConversationDigest(digest)?.summary),
      title: row.title === '新对话' ? summarizeConversation(messages) : row.title,
    })))
  })

  // 首页推荐 — 只从预生成池领取，不在页面请求中等待模型响应
  app.get('/ai-platform/recommendations', async (c) => {
    await ensureSeeded()
    const available = await claimRecommendationBatch()
    if (available.length === RECOMMENDATION_DELIVERY_SIZE) {
      const batch = await db.select().from(aiRecommendationBatches).orderBy(desc(aiRecommendationBatches.id)).get()
      const deliveredCount = batch?.deliveredCount ?? 0
      const items = (batch?.items ?? []) as Recommendation[]
      if (deliveredCount >= items.length) startRecommendationGeneration()
    } else {
      startRecommendationGeneration()
    }
    return c.json(available)
  })

  // 会话管理 — 新建空会话
  app.post('/ai-platform/conversations', async (c) => {
    const body = await c.req.json<{
      modelId?: string
      title?: string
      systemPrompt?: string
      params?: Record<string, unknown>
      messages?: unknown[]
      parentConversationId?: number
      branchFromMessageIndex?: number
    }>().catch(() => ({}) as {
      modelId?: string
      title?: string
      systemPrompt?: string
      params?: Record<string, unknown>
      messages?: unknown[]
      parentConversationId?: number
      branchFromMessageIndex?: number
    })
    const messages = Array.isArray(body.messages) ? body.messages.slice(0, MESSAGE_MAX_AI) : []
    if (messages.length === 0) {
      return c.json({ error: 'messages must contain at least one message' }, 400)
    }
    const parentConversationId: number | null = typeof body.parentConversationId === 'number' && Number.isInteger(body.parentConversationId)
      ? body.parentConversationId
      : null
    const branchFromMessageIndex = Number.isInteger(body.branchFromMessageIndex)
      ? Math.max(0, Math.min(body.branchFromMessageIndex!, messages.length - 1))
      : null
    if (parentConversationId !== null) {
      const parent = await db.select({ userKey: aiConversations.userKey })
        .from(aiConversations)
        .where(eq(aiConversations.id, parentConversationId))
        .get()
      if (!parent || parent.userKey !== USER_KEY) return c.json({ error: 'parent conversation not found' }, 404)
    }
    const now = new Date()
    const result = await db.insert(aiConversations).values({
      userKey: USER_KEY,
      title: body.title && body.title !== '新对话' ? body.title : summarizeConversation(messages),
      modelId: body.modelId ?? 'glm-5.2',
      systemPrompt: body.systemPrompt ?? '',
      params: body.params ?? {},
      messages,
      pinned: 0,
      parentConversationId,
      branchFromMessageIndex,
      digest: {},
      digestMessageCount: 0,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return c.json({ ...result[0], digest: normalizeConversationDigest(result[0].digest) }, 201)
  })

  // 会话管理 — 获取单个会话（含 messages）
  app.get('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const row = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!row || row.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    return c.json({ ...row, digest: normalizeConversationDigest(row.digest) })
  })

  // 会话管理 — 更新会话
  app.put('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const body = normalizeConversationUpdate(await c.req.json<ConversationUpdate>())
    const existing = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!existing || existing.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title
    if (body.modelId !== undefined) update.modelId = body.modelId
    if (body.systemPrompt !== undefined) update.systemPrompt = body.systemPrompt
    if (body.params !== undefined) update.params = body.params
    if (body.messages !== undefined) {
      update.messages = body.messages
      update.updatedAt = new Date()
      if (body.title === undefined) update.title = summarizeConversation(body.messages)
    }
    if (body.pinned !== undefined) update.pinned = body.pinned ? 1 : 0
    if (body.digest !== undefined) update.digest = body.digest ?? {}
    if (body.digestMessageCount !== undefined) update.digestMessageCount = body.digestMessageCount
    if (body.digest !== undefined || body.digestMessageCount !== undefined) update.updatedAt = new Date()
    if (Object.keys(update).length === 0) return c.json({ ...existing, digest: normalizeConversationDigest(existing.digest) })
    await db.update(aiConversations).set(update).where(eq(aiConversations.id, id))
    const updated = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    return c.json(updated ? { ...updated, digest: normalizeConversationDigest(updated.digest) } : null)
  })

  // 会话管理 — 删除会话
  app.delete('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const existing = await db.select({ userKey: aiConversations.userKey }).from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!existing || existing.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    await db.delete(aiConversations).where(eq(aiConversations.id, id))
    return c.json({ ok: true })
  })

  app.post('/ai-platform/images/generations', async (c) => {
    await ensureSeeded()
    const body = await c.req.json<ImageGenerationRequestBody>().catch(() => null)
    if (!body || body.modelId !== 'gpt-image-2') {
      return c.json({ error: '不支持的图片模型。' }, 400)
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > IMAGE_PROMPT_MAX) {
      return c.json({ error: '图片描述不能为空且不能超过 2000 个字符。' }, 400)
    }
    if (!IMAGE_ASPECT_RATIOS.has(body.aspectRatio)) {
      return c.json({ error: '不支持的图片比例。' }, 400)
    }
    if (hasInvalidReferenceImageId(body.referenceImageId)) {
      return c.json({ error: '参考图片不存在或不可用。' }, 404)
    }

    const model = await db.select().from(aiModels).where(eq(aiModels.modelId, body.modelId)).get()
    if (!model || model.enabled !== 1 || model.category !== 'image') {
      return c.json({ error: '图片模型当前不可用。' }, 400)
    }
    const reference = await resolvePrivateImageReference(body.referenceImageId)
    if (body.referenceImageId && !reference) {
      return c.json({ error: '参考图片不存在或不可用。' }, 404)
    }
    const config = readImageGenerationConfig()
    if (!config) return c.json({ error: '图片生成服务暂未配置。' }, 503)

    let upstream: Response
    try {
      const request = buildGptImageRequest({ ...body, prompt }, config, reference ?? undefined)
      upstream = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: c.req.raw.signal,
      })
    } catch {
      return c.json({ error: '图片生成服务暂时不可用，请稍后重试。' }, 502)
    }
    if (!upstream.ok) {
      return c.json({ error: '图片生成服务暂时不可用，请稍后重试。' }, 502)
    }

    const result = normalizeImageGenerationResponse(await upstream.json().catch(() => null))
    if (!result) {
      return c.json({ error: '图片生成服务返回了无效结果，请稍后重试。' }, 502)
    }
    if (result.kind === 'url') {
      return c.json({ modelId: body.modelId, imageUrl: result.imageUrl })
    }

    try {
      const asset = await storeImageAsset(USER_KEY, result.image)
      const imageUrl = imageAssetUrl(asset.id)
      if (!imageUrl) throw new Error('invalid image asset id')
      return c.json({ modelId: body.modelId, imageUrl })
    } catch {
      return c.json({ error: '图片生成结果保存失败，请稍后重试。' }, 502)
    }
  })

  app.post('/ai-platform/images/gemini', async (c) => {
    await ensureSeeded()
    const body = await c.req.json<GeminiMultimodalRequestBody>().catch(() => null)
    if (!body) {
      return c.json({ error: '图片创作描述不能为空且不能超过 2000 个字符。' }, 400)
    }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt || prompt.length > IMAGE_PROMPT_MAX) {
      return c.json({ error: '图片创作描述不能为空且不能超过 2000 个字符。' }, 400)
    }
    if (hasInvalidReferenceImageId(body.referenceImageId)) {
      return c.json({ error: '参考图片不存在或不可用。' }, 404)
    }

    const model = await db.select().from(aiModels).where(eq(aiModels.modelId, 'gemini-3-pro-image')).get()
    if (!model || model.enabled !== 1 || model.category !== 'image') {
      return c.json({ error: 'Gemini 创作模型当前不可用。' }, 400)
    }
    const reference = await resolvePrivateImageReference(body.referenceImageId)
    if (body.referenceImageId && !reference) {
      return c.json({ error: '参考图片不存在或不可用。' }, 404)
    }
    const config = readImageGenerationConfig()
    if (!config) return c.json({ error: '图片创作服务暂未配置。' }, 503)

    let upstream: Response
    try {
      const request = buildGeminiMultimodalRequest({ ...body, prompt }, config, reference ?? undefined)
      upstream = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal: c.req.raw.signal,
      })
    } catch {
      return c.json({ error: '图片创作服务暂时不可用，请稍后重试。' }, 502)
    }
    if (!upstream.ok) {
      return c.json({ error: '图片创作服务暂时不可用，请稍后重试。' }, 502)
    }

    const result = normalizeGeminiMultimodalResponse(await upstream.json().catch(() => null))
    if (!result) {
      return c.json({ error: '本次创作未返回可展示内容，请修改描述后重试。' }, 502)
    }
    if (!result.image || 'imageUrl' in result.image) {
      return c.json({
        content: result.content,
        ...(result.image ? { imageUrl: result.image.imageUrl } : {}),
      } satisfies GeminiMultimodalResponse)
    }

    try {
      const asset = await storeImageAsset(USER_KEY, result.image)
      const imageUrl = imageAssetUrl(asset.id)
      if (!imageUrl) throw new Error('invalid image asset id')
      return c.json({ content: result.content, imageUrl } satisfies GeminiMultimodalResponse)
    } catch {
      return c.json({ error: '图片生成结果保存失败，请稍后重试。' }, 502)
    }
  })

  app.get('/ai-platform/images/:id', async (c) => imageAssetResponse(USER_KEY, c.req.param('id')))

  // 对话代理 — 统一流式输出
  app.post('/ai-platform/chat', async (c) => {
    const body = await c.req.json<ChatRequestBody>()
    if (!body.modelId || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'modelId and messages[] are required' }, 400)
    }
    if (!body.messages.every((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
    ))) {
      return c.json({ error: 'messages must contain only user or assistant text' }, 400)
    }

    const modelRow = await db.select().from(aiModels).where(eq(aiModels.modelId, body.modelId)).get()
    if (!modelRow) return c.json({ error: 'model not found' }, 404)
    if (modelRow.enabled !== 1) return c.json({ error: 'model is disabled' }, 400)
    if (modelRow.category === 'image') return c.json({ error: 'image models must use the image generation API' }, 400)
    if (!isSupportedModelProvider(modelRow.provider)) return c.json({ error: 'unsupported provider' }, 400)

    // 上下文工程：分层系统提示 + 窗口化压缩 + 内容截断 + 上下文窗口预算。
    const engineered = engineerContext({
      messages: body.messages,
      system: body.system ?? '',
      summary: typeof body.summary === 'string' ? body.summary : '',
      contextWindow: modelRow.contextWindow ?? null,
      maxTokens: body.params?.maxTokens,
    })
    const webSearch = body.params?.webSearch ?? true
    const anthropicConfig = readAnthropicConfig()
    // openai-compatible 的检索执行依赖 Claude web_search（零新增 Key）；未配置则退化为纯直通。
    const useWebSearch = webSearch && (modelRow.provider === 'anthropic' || !!anthropicConfig)

    const engineeredBody: ChatRequestBody = {
      modelId: body.modelId,
      messages: engineered.messages,
      system: engineered.system,
      params: {
        ...body.params,
        maxTokens: engineered.maxTokens,
        webSearch: useWebSearch,
      },
    }

    // Agent 工具循环：统一注册表（单一事实源）+ 按 provider 生成的工具定义。
    const agentRegistry = buildAgentRegistry(anthropicConfig)
    const openAiTools = buildOpenAiTools(agentRegistry)
    const anthropicTools = buildAnthropicTools(agentRegistry)

    let upstreamConfig: UpstreamConfig | null = null
    let upstreamReq: UpstreamRequest
    let openAiMessagesWithSystem: AgentChatMessage[] | null = null
    switch (modelRow.provider) {
      case 'anthropic': {
        if (!anthropicConfig) return c.json({ error: 'AI credentials not configured' }, 503)
        upstreamReq = buildAnthropicPlatformRequest(
          engineeredBody,
          anthropicConfig,
          useWebSearch ? anthropicTools : undefined,
        )
        break
      }
      case 'openai-compatible': {
        const appId = process.env.TAL_MLOPS_APP_ID ?? ''
        const appKey = process.env.TAL_MLOPS_APP_KEY ?? ''
        if (!appId || !appKey) return c.json({ error: 'OpenAI-compatible credentials not configured' }, 503)
        upstreamConfig = {
          provider: modelRow.provider,
          modelId: modelRow.modelId,
          baseUrl: process.env.TAL_AI_BASE_URL ?? 'http://ai-service.tal.com',
          appId,
          appKey,
        }
        if (useWebSearch) {
          openAiMessagesWithSystem = engineeredBody.system
            ? [{ role: 'system', content: engineeredBody.system }, ...engineeredBody.messages]
            : [...engineeredBody.messages]
          upstreamReq = buildUpstreamRequest(
            { ...engineeredBody, messages: openAiMessagesWithSystem as { role: string; content: string }[], system: '' },
            upstreamConfig,
            openAiTools,
          )
        } else {
          upstreamReq = buildUpstreamRequest(engineeredBody, upstreamConfig)
        }
        break
      }
    }

    let upstream: Response
    try {
      upstream = await fetch(upstreamReq.url, {
        method: 'POST',
        headers: upstreamReq.headers,
        body: upstreamReq.body,
        signal: c.req.raw.signal,
      })
    } catch {
      return c.json({ error: 'upstream connection failed' }, 502)
    }

    // openai-compatible + 联网搜索：首轮带工具请求被拒绝时，回退为不带工具的纯直通，防止模型不支持
    // 函数调用导致整个会话报错（联网默认开启）。
    if (modelRow.provider === 'openai-compatible' && useWebSearch && (!upstream.ok || !upstream.body)) {
      const plainBody: ChatRequestBody = { ...engineeredBody, params: { ...engineeredBody.params, webSearch: false } }
      const plainReq = upstreamConfig ? buildUpstreamRequest(plainBody, upstreamConfig) : null
      if (plainReq) {
        upstream = await fetch(plainReq.url, {
          method: 'POST',
          headers: plainReq.headers,
          body: plainReq.body,
          signal: c.req.raw.signal,
        }).catch(() => null) as Response
      } else {
        upstream = null as unknown as Response
      }
      if (!upstream || !upstream.ok || !upstream.body) {
        const errText = await (upstream?.text()).catch(() => upstream?.statusText ?? 'upstream error')
        return c.json({ error: errText || 'upstream error' }, (upstream?.status ?? 502) as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503)
      }
      return new Response(upstream.body, { headers: SSE_RESPONSE_HEADERS })
    }

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => upstream.statusText)
      return c.json({ error: errText || 'upstream error' }, upstream.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503)
    }

    // openai-compatible + 联网搜索：走通用 Agent 工具循环（读首轮 → 分发注册表里的工具 →
    // 回填结果 → 继续），流式写回 OpenAI 格式 SSE。工具对用户在界面上不可见。
    if (modelRow.provider === 'openai-compatible' && useWebSearch && openAiMessagesWithSystem && upstreamConfig) {
      const stream = runAgentLoop({
        provider: 'openai-compatible',
        initialMessages: openAiMessagesWithSystem,
        modelId: modelRow.modelId,
        params: engineeredBody.params,
        registry: agentRegistry,
        buildRequest: (messages, modelId, params) =>
          buildUpstreamRequest(
            { modelId, messages: messages as { role: string; content: string }[], system: '', params: { ...params, webSearch: true } },
            upstreamConfig as UpstreamConfig,
            openAiTools,
          ),
        readTurn: readOpenAiTurn,
        initialResponse: upstream,
        maxRounds: MAX_AGENT_ROUNDS,
        signal: c.req.raw.signal,
      })
      return new Response(stream, { headers: SSE_RESPONSE_HEADERS })
    }

    // anthropic + 联网搜索：同样走通用 Agent 工具循环（客户端工具），统一成 OpenAI 格式 SSE。
    // 网关已验证接受任意客户端工具（见 tests 的 probe 记录），故不再走原生 web_search 直通。
    if (modelRow.provider === 'anthropic' && useWebSearch && anthropicConfig) {
      const stream = runAgentLoop({
        provider: 'anthropic',
        initialMessages: engineeredBody.messages as AgentChatMessage[],
        modelId: modelRow.modelId,
        params: engineeredBody.params,
        registry: agentRegistry,
        buildRequest: (messages, modelId, params) =>
          buildAnthropicPlatformRequest(
            { modelId, messages: messages as { role: string; content: string }[], system: engineeredBody.system, params: { ...params, webSearch: true } },
            anthropicConfig,
            anthropicTools,
          ),
        readTurn: readAnthropicTurn,
        initialResponse: upstream,
        maxRounds: MAX_AGENT_ROUNDS,
        signal: c.req.raw.signal,
      })
      return new Response(stream, { headers: SSE_RESPONSE_HEADERS })
    }

    return new Response(upstream.body, { headers: SSE_RESPONSE_HEADERS })
  })
}
