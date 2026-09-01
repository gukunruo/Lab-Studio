// 图片模板 prompt 归纳 —— 把「某次生成的图片 + 当时用于生成的描述」交给 Claude（带视觉），
// 归纳出一条规范、可复用的模板提示词，供「生成图添为模板」链路使用。
//
// 与 image-prompt-enricher 同构：以纯函数为主（请求构建、响应解析），唯一的副作用是
// summarizeTemplatePrompt 里的 fetch，放入此处避免污染纯函数，便于测试。

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface TemplateSummaryConfig {
  apiKey: string
  baseUrl: string
  model?: string
}

export interface TemplateSummaryInput {
  imageBase64: string
  mediaType: ImageMediaType
  prompt: string
  aspectRatio?: string
  style?: string
}

export interface TemplateSummaryResult {
  name: string
  prompt: string
}

// 归纳质量优先，固定用 Sonnet（视觉 + 提示词重构都稳）；可用 ANTHROPIC_TEMPLATE_MODEL 覆盖。
export const DEFAULT_TEMPLATE_MODEL = 'claude-sonnet-4-6'

export function readTemplateModel(): string {
  return process.env.ANTHROPIC_TEMPLATE_MODEL?.trim() || DEFAULT_TEMPLATE_MODEL
}

export const TEMPLATE_SUMMARIZE_SYSTEM = `你会看到「一张已经生成好的图片」以及「当初用来生成它的一句描述」。
请结合这张图的效果与那条描述，归纳出一条规范、可复用的模板提示词，要求：
- 提示词能脱离参考图独立使用，被别人复制后仍能生成风格、构图接近的新图；
- 把画面的主体、风格、配色、排版/构图、氛围、文字（若有）讲清楚，保留原图的「模板价值」；
- 不要依赖"参考这张图片"这类只能在当前语境成立的表述；
- 名称取一个不超过 12 字的简洁中文名，能概括这一模板。

只输出以下两行（不要有任何解释、引号或前后缀）：
<name>模板名称</name>
<prompt>完整提示词</prompt>`

// 与 buildAnthropicPlatformRequest 一致：网关要求这些头部，否则以 403 拒绝。
function templateHeaders(config: TemplateSummaryConfig): Headers {
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

export interface TemplateSummaryRequest {
  url: string
  headers: Headers
  body: string
}

export function buildTemplateSummaryRequest(
  input: TemplateSummaryInput,
  config: TemplateSummaryConfig,
  model = readTemplateModel(),
): TemplateSummaryRequest {
  const contextParts = [`原描述：\n${input.prompt}`]
  if (input.aspectRatio) contextParts.push(`原比例：${input.aspectRatio}`)
  if (input.style) contextParts.push(`原风格 id：${input.style}`)

  return {
    url: `${config.baseUrl.replace(/\/$/, '')}/v1/messages`,
    headers: templateHeaders(config),
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: TEMPLATE_SUMMARIZE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 } },
            { type: 'text', text: contextParts.join('\n') },
          ],
        },
      ],
    }),
  }
}

// 从上游 content 块里提取 <name> 与 <prompt>。两者都缺失时返回 null，由调用方决定回退。
export function extractTemplateSummary(payload: unknown): TemplateSummaryResult | null {
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
    const name = /<name>([\s\S]*?)<\/name>/i.exec(text)?.[1]?.trim()
    const prompt = /<prompt>([\s\S]*?)<\/prompt>/i.exec(text)?.[1]?.trim()
    if (name && prompt) return { name, prompt }
  }
  return null
}

// 回退用的名称：取首段（按句号/换行切分）去标点，最多 12 字；空则用占位。
export function deriveTemplateName(prompt: string): string {
  const first = prompt.split(/[\n。，,]/)[0]?.trim() ?? ''
  const cleaned = first.replace(/[^\p{L}\p{N}·\s]/gu, '').trim()
  if (!cleaned) return '新模板'
  return cleaned.length > 12 ? cleaned.slice(0, 12) : cleaned
}

// 编排入口：构建请求 → 发送 → 解析。任何失败（网络、非 2xx、解析不出）都返回 null，
// 由调用方回退到原描述，绝不让归纳失败阻塞「添为模板」主流程。
export async function summarizeTemplatePrompt(
  input: TemplateSummaryInput,
  config: TemplateSummaryConfig,
  model = readTemplateModel(),
): Promise<TemplateSummaryResult | null> {
  let response: Response
  try {
    const request = buildTemplateSummaryRequest(input, config, model)
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  return extractTemplateSummary(payload)
}
