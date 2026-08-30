// 图片提示词联网增强 —— 给生图（gpt-image-2）与 Gemini 创作（gemini-3-pro-image）的链路
// 加一步「歧义实体检索」：图片模型本身不接受工具，所以先让 Claude 用原生 web_search 判断
// 提示词里的人物/品牌/角色/地点是否有歧义，必要时联网检索，再产出改写后的完整提示词，
// 供图片模型生成。检索执行复用 Claude web_search（零新增 Key），与 chat 的联网同源。
//
// 本模块以纯函数为主（请求构建、响应解析），唯一的副作用调用是 enrichImagePrompt 里的
// fetch，此处放入以避免污染纯函数，便于测试。

import { buildAnthropicWebSearchTools } from './web-search'

export const IMAGE_ENRICH_SYSTEM = `你是图片提示词优化器。用户会给你一句「要在图片模型里生成」的描述。
如果其中提到的人物、品牌、产品、角色、地点等实体有歧义，或你不确定它具体指什么，就用 web_search 联网检索该实体，把它的确切含义与形象要点写进提示词里。
如果描述本身清晰、无需检索，就直接把提示词说清楚。
无论是否检索，最终都只输出一份完整的图片提示词正文，并把它包在 <prompt> 与 </prompt> 之间。
除了 <prompt>...</prompt>，不要输出任何其他文字（不要解释、不要引号、不要前后缀）。`

// 联网增强只在生成前做一次实体去歧义，属于廉价的短任务，固定用最便宜的 Haiku（约 Sonnet 的 1/3 成本），
// 无需为它付出聊天同款旗舰模型的价格。可用 ANTHROPIC_ENRICH_MODEL 覆盖。
export const DEFAULT_IMAGE_ENRICH_MODEL = 'claude-haiku-4-5-20251001'

export function readImageEnrichModel(): string {
  return process.env.ANTHROPIC_ENRICH_MODEL?.trim() || DEFAULT_IMAGE_ENRICH_MODEL
}

// 只复用网关连接（apiKey/baseUrl）；模型固定走上面最便宜档，与聊天的 config.model 解耦。
export type ImageEnrichConfig = {
  apiKey: string
  baseUrl: string
}

// 与 buildAnthropicPlatformRequest 一致：网关要求这些头部，否则以 403 拒绝。
function imageEnrichHeaders(config: ImageEnrichConfig): Headers {
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

export interface ImageEnrichmentRequest {
  url: string
  headers: Headers
  body: string
}

export function buildImageEnrichmentRequest(
  prompt: string,
  config: ImageEnrichConfig,
  maxSearchUses = 2,
  model = readImageEnrichModel(),
): ImageEnrichmentRequest {
  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/v1/messages`,
    headers: imageEnrichHeaders(config),
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: IMAGE_ENRICH_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      tools: buildAnthropicWebSearchTools(maxSearchUses),
    }),
  }
}

// 从上游返回的 content 块里提取改写后的提示词：
// - 优先取 <prompt>...</prompt> 标记内的正文（模型可能先输出「我来检索…」这类旁白）；
// - 标记缺失时退回最后一段文本块（清晰提示词不触发检索，通常就是单块原样）。
// 没有任何可用文本时返回 null，调用方回退到原提示词。
export function extractEnrichedPrompt(payload: unknown): string | null {
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
    const match = /<prompt>([\s\S]*?)<\/prompt>/i.exec(text)
    if (match && match[1].trim()) return match[1].trim()
  }

  return texts[texts.length - 1].trim() || null
}

// 编排入口：构建请求 → 发送 → 解析。任何失败（网络、非 2xx、解析不出正文）都退化为
// 返回原提示词，绝不让联网增强阻塞图片生成主链路。
export async function enrichImagePrompt(
  prompt: string,
  config: ImageEnrichConfig,
  maxSearchUses = 2,
  model = readImageEnrichModel(),
): Promise<string> {
  let response: Response
  try {
    const request = buildImageEnrichmentRequest(prompt, config, maxSearchUses, model)
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
  } catch {
    return prompt
  }
  if (!response.ok) return prompt

  const payload = await response.json().catch(() => null)
  const enriched = extractEnrichedPrompt(payload)
  if (!enriched) return prompt
  return enriched
}
