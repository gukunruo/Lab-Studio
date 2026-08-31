// 图片提示词起草 —— 在「需求 → 成图」之间加交互式起草层。
//
// 与 image-prompt-enricher 的异同：
// - enricher 做「歧义实体去歧义」，输出一段改写后的完整提示词（单块文本）。
// - drafter 做「把一句需求拆成可编辑的结构化要素（主题/风格/构图/细节/负面提示）」，
//   供前端渲染成提示词卡，用户确认/润色后再出图。要素由模型产出，最终 prompt
//   由 collapseDraftToPrompt 确定性地从要素拼出（单一来源，前后端对齐）。
// 两者共用：Claude 原生 web_search（零新增 Key）+ 网关连接 + Haiku 廉价档。
//
// 本模块以纯函数为主；唯一副作用是 draftImagePrompt 里的 fetch，放入以避免污染纯函数。

import { buildAnthropicWebSearchTools } from './web-search'

export const DEFAULT_IMAGE_DRAFT_MODEL = 'claude-haiku-4-5-20251001'

// 固定用最便宜的 Haiku（约 Sonnet 的 1/3 成本），可用 ANTHROPIC_DRAFT_MODEL 覆盖为 Sonnet 换更高质量。
export function readImageDraftModel(): string {
  return process.env.ANTHROPIC_DRAFT_MODEL?.trim() || DEFAULT_IMAGE_DRAFT_MODEL
}

export type ImageDraftConfig = { apiKey: string; baseUrl: string }

export interface ImageDraftFacets {
  subject: string
  style: string
  composition: string
  details: string
  negative: string
}

export interface ImageDraft {
  facets: ImageDraftFacets
  prompt: string
}

// 只复用网关连接（apiKey/baseUrl）；模型固定走上面最便宜档，与配置解耦。
const IMAGE_DRAFT_SYSTEM = `你是图片提示词起草助手。用户会给你一句「想生成的图片」的需求。
如果其中提到的人物、品牌、产品、角色、地点等实体有歧义，或你不确定它具体指什么，就用 web_search 联网检索该实体：
- 若它是知名品牌/公司/产品/应用/游戏/角色，把它还原成其官方拟人化形象或 IP 吉祥物来写进「主题」，例如「豆包」是字节跳动旗下 AI 助手，应写其可爱的拟人化助手形象，而不是按字面理解成吃的包子。
- 把确切含义与形象要点写进「主题」，确保图片模型不要按字面误解成食物、物品或无关事物。

然后把这句需求拆成下面几个要素，每个要素写一句具体的、可直接执行的描述（不要复述用户原文，要扩展、补足成图片模型能用的表述）：
- subject（主题）：画面核心主体，是什么、长什么样。
- style（风格）：艺术风格，如扁平/3D/拟物/插画/摄影/极简/赛博朋克等。
- composition（构图）：主体位置、视角、画面比例等。
- details（细节）：材质、光影、配色、装饰元素，画面想补充的附加信息。
- negative（负面提示）：明确要避免的元素，如杂乱背景、多余文字等。

最终只输出一个 JSON 对象，并包在 <facets> 与 </facets> 之间，例如：
<facets>{"subject":"...","style":"...","composition":"...","details":"...","negative":"..."}</facets>
除了 <facets>...</facets>，不要输出任何其他文字（不要解释、不要引号、不要前后缀）。`

export interface ImageDraftRequest {
  url: string
  headers: Headers
  body: string
}

export interface ImageDraftOptions {
  maxSearchUses?: number
  model?: string
  referenceHint?: string
  history?: { role: string; content: string }[]
}

// 与 buildAnthropicPlatformRequest 一致：网关要求这些头部，否则以 403 拒绝。
function imageDraftHeaders(config: ImageDraftConfig): Headers {
  return new Headers({
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
    'User-Agent': 'claude-cli/2.0.0 (external, cli)',
    'x-app': 'cli',
    'x-stainless-lang': 'js',
    'x-stainless-runtime': 'node',
  })
}

export function buildImageDraftRequest(
  desire: string,
  config: ImageDraftConfig,
  maxSearchUses = 2,
  options: ImageDraftOptions = {},
): ImageDraftRequest {
  const referenceHint = options.referenceHint?.trim()
  const userContent = referenceHint ? `【参考】${referenceHint}\n${desire}` : desire
  const messages = [
    ...(options.history ?? []),
    { role: 'user' as const, content: userContent },
  ]
  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/v1/messages`,
    headers: imageDraftHeaders(config),
    body: JSON.stringify({
      model: options.model ?? readImageDraftModel(),
      max_tokens: 1024,
      system: IMAGE_DRAFT_SYSTEM,
      messages,
      tools: buildAnthropicWebSearchTools(maxSearchUses),
    }),
  }
}

// 要素 → 最终 prompt 的确定性拼装（单一来源；前端确认生成的镜像逻辑须与此对齐）。
const FACET_LABELS: Array<[keyof ImageDraftFacets, string]> = [
  ['subject', '主题'],
  ['style', '风格'],
  ['composition', '构图'],
  ['details', '细节'],
  ['negative', '避免'],
]

export function collapseDraftToPrompt(facets: ImageDraftFacets): string {
  return FACET_LABELS
    .map(([key, label]) => {
      const value = facets[key]?.trim()
      return value ? `${label}：${value}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

const EMPTY_FACETS: ImageDraftFacets = { subject: '', style: '', composition: '', details: '', negative: '' }

function normalizeFacets(value: unknown): ImageDraftFacets | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const facets: ImageDraftFacets = { ...EMPTY_FACETS }
  for (const key of Object.keys(EMPTY_FACETS) as Array<keyof ImageDraftFacets>) {
    const field = record[key]
    if (typeof field !== 'string') return null
    facets[key] = field.trim()
  }
  return facets
}

// 从上游返回的 content 块里提取要素：
// - 优先取 <facets>{json}</facets> 标记内的 JSON（模型可能先输出「我来检索…」这类旁白）；
// - 解析失败或形状不对返回 null，调用方退化为把需求原样当 prompt。
export function parseImageDraftResponse(payload: unknown): ImageDraft | null {
  if (!payload || typeof payload !== 'object') return null
  const content = (payload as { content?: unknown }).content
  if (!Array.isArray(content)) return null

  const texts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if ((block as { type?: unknown }).type !== 'text') continue
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) texts.push(text)
  }
  if (texts.length === 0) return null

  for (const text of texts) {
    const match = /<facets>([\s\S]*?)<\/facets>/i.exec(text)
    if (!match) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1])
    } catch {
      continue
    }
    const facets = normalizeFacets(parsed)
    if (!facets) continue
    return { facets, prompt: collapseDraftToPrompt(facets) }
  }

  return null
}

function fallbackDraft(desire: string): ImageDraft {
  // 需求原样当 prompt，主题归到「主题」要素，其余留空；既提示图片模型，也让卡片可显示。
  return { facets: { subject: desire, style: '', composition: '', details: '', negative: '' }, prompt: desire }
}

// 编排入口：构建请求 → 发送 → 解析。任何失败（网络、非 2xx、解析不出）都退化为
// 返回「需求原样 + 空要素」，绝不让起草阻塞出图主链路。
export async function draftImagePrompt(
  desire: string,
  config: ImageDraftConfig,
  maxSearchUses = 2,
  options: ImageDraftOptions = {},
): Promise<ImageDraft> {
  let response: Response
  try {
    const request = buildImageDraftRequest(desire, config, maxSearchUses, options)
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
  } catch {
    return fallbackDraft(desire)
  }
  if (!response.ok) return fallbackDraft(desire)

  const payload = await response.json().catch(() => null)
  const draft = parseImageDraftResponse(payload)
  if (!draft) return fallbackDraft(desire)
  return draft
}
