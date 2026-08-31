import type { ModelsByCategory, AiConversation, AiConversationSummary, AiPreferences, AiRecommendation, ChatMessage, ChatParams, ConversationDigest, GeminiContextMessage, GeminiMultimodalAssistantMessage, ImageAspectRatio, ImageDraftFacets, ImageModelId, ImageResultMessage, TextMessage, ToolCallTrace } from './types'

export async function fetchModels(): Promise<ModelsByCategory> {
  const res = await fetch('/api/ai-platform/models', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}

export async function fetchAiPreferences(): Promise<AiPreferences> {
  const res = await fetch('/api/ai-platform/preferences', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch AI preferences')
  return res.json()
}

export async function updateAiPreferences(preferences: AiPreferences): Promise<AiPreferences> {
  const res = await fetch('/api/ai-platform/preferences', {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences),
  })
  if (!res.ok) throw new Error('Failed to update AI preferences')
  return res.json()
}

export async function fetchConversations(): Promise<AiConversationSummary[]> {
  const res = await fetch('/api/ai-platform/conversations', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch conversations')
  return res.json()
}

export async function fetchRecommendations(): Promise<AiRecommendation[]> {
  const res = await fetch(`/api/ai-platform/recommendations?batch=${Date.now()}`, {
    credentials: 'include',
    cache: 'no-store',
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || 'Failed to fetch recommendations')
  }
  return res.json()
}

export async function fetchConversation(id: number): Promise<AiConversation> {
  const res = await fetch(`/api/ai-platform/conversations/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch conversation')
  return res.json()
}

export interface CreateConversationInput {
  modelId: string
  title?: string
  messages: ChatMessage[]
  params?: ChatParams
  systemPrompt?: string
  parentConversationId?: number
  branchFromMessageIndex?: number
}

export async function createConversation(input: CreateConversationInput): Promise<AiConversation> {
  const res = await fetch('/api/ai-platform/conversations', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function updateConversation(
  id: number,
  data: { title?: string; modelId?: string; systemPrompt?: string; params?: ChatParams; messages?: ChatMessage[]; pinned?: boolean; digest?: ConversationDigest | null; digestMessageCount?: number },
): Promise<AiConversation> {
  const res = await fetch(`/api/ai-platform/conversations/${id}`, {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update conversation')
  return res.json()
}

export async function deleteConversation(id: number): Promise<void> {
  await fetch(`/api/ai-platform/conversations/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  })
}

export function parseConversationDigest(content: string, messageCount: number): ConversationDigest | null {
  const json = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const value = JSON.parse(json) as Record<string, unknown>
    if (typeof value.summary !== 'string' || !Array.isArray(value.outline)) return null
    const outline = value.outline.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const entry = item as Record<string, unknown>
      if (
        typeof entry.messageIndex !== 'number'
        || !Number.isInteger(entry.messageIndex)
        || entry.messageIndex < 0
        || entry.messageIndex >= messageCount
        || typeof entry.title !== 'string'
        || typeof entry.detail !== 'string'
        || !entry.title.trim()
      ) return []
      return [{
        messageIndex: entry.messageIndex,
        title: entry.title.trim().slice(0, 120),
        detail: entry.detail.trim().slice(0, 600),
      }]
    }).slice(0, 8)
    const summary = value.summary.trim().slice(0, 2000)
    if (!summary || !outline.length) return null
    return {
      summary,
      outline,
      sourceMessageCount: messageCount,
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export interface StreamChatOptions {
  modelId: string
  messages: ChatMessage[]
  system?: string
  summary?: string
  params?: ChatParams
  onToken: (token: string) => void
  onToolCall?: (tc: ToolCallTrace) => void
  onDone: (full: string) => void
  onError: (error: string) => void
  signal: AbortSignal
}

export function isTextMessage(message: ChatMessage): message is TextMessage {
  return message.type === undefined || message.type === 'text'
}

export function toUpstreamMessages(messages: ChatMessage[]): Array<Pick<TextMessage, 'role' | 'content'>> {
  return messages
    .filter(isTextMessage)
    .filter((message) => message.status !== 'error')
    .map(({ role, content }) => ({ role, content }))
}

const CONTROLLED_IMAGE_ASSET_PATH = /^\/api\/ai-platform\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export interface ImageGenerationInput {
  modelId: 'gpt-image-2'
  prompt: string
  aspectRatio: ImageAspectRatio
  referenceImageId?: string
  signal: AbortSignal
}

export interface ImageGenerationResponse {
  imageUrl: string
  modelId: 'gpt-image-2'
}

export interface GeminiMultimodalResponse {
  content: string
  imageUrl?: string
}

export function controlledImageAssetId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(CONTROLLED_IMAGE_ASSET_PATH)
  return match?.[1]?.toLowerCase() ?? null
}

export function isSafeImageUrl(value: unknown): value is string {
  if (controlledImageAssetId(value)) return true
  if (typeof value !== 'string' || !value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function latestControlledImageAssetId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    if (message.type === 'image-result' && message.status === 'completed') {
      const image = message as ImageResultMessage
      const assetId = controlledImageAssetId(image.imageUrl)
      if (assetId) return assetId
    }
    if (message.type === 'gemini-multimodal-assistant' && message.status === 'completed') {
      const image = message as GeminiMultimodalAssistantMessage
      const assetId = controlledImageAssetId(image.imageUrl)
      if (assetId) return assetId
    }
  }
  return null
}

export function buildGeminiSubThreadHistory(messages: ChatMessage[]): GeminiContextMessage[] {
  const history: GeminiContextMessage[] = []
  // 从尾部向前收集「连续」的 Gemini 创作回合，遇到非 Gemini 消息就停，
  // 这样只带本会话的 Gemini 子线程，不混入无关的 GLM 文本对话。
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    if (message.type === 'gemini-multimodal-user') {
      history.unshift({ role: 'user', content: message.content })
    } else if (message.type === 'gemini-multimodal-assistant') {
      if (message.content) history.unshift({ role: 'assistant', content: message.content })
    } else {
      break
    }
  }
  return history
}

async function responsePayload(res: Response): Promise<{ error?: unknown; content?: unknown; imageUrl?: unknown; modelId?: unknown; prompt?: unknown; facets?: unknown } | null> {
  return res.json().catch(() => null) as Promise<{ error?: unknown; content?: unknown; imageUrl?: unknown; modelId?: unknown; prompt?: unknown; facets?: unknown } | null>
}

export async function generateImage(input: ImageGenerationInput): Promise<ImageGenerationResponse> {
  const referenceImageId = input.referenceImageId?.toLowerCase()
  const res = await fetch('/api/ai-platform/images/generations', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: input.modelId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      ...(referenceImageId && CONTROLLED_IMAGE_ASSET_PATH.test(`/api/ai-platform/images/${referenceImageId}`)
        ? { referenceImageId }
        : {}),
    }),
    signal: input.signal,
  })

  const payload = await responsePayload(res)
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '图片生成失败，请稍后重试。')
  }
  if (!payload || !isSafeImageUrl(payload.imageUrl) || payload.modelId !== 'gpt-image-2') {
    throw new Error('图片生成服务返回了无效结果，请稍后重试。')
  }
  return { imageUrl: payload.imageUrl, modelId: payload.modelId }
}

export async function generateGeminiMultimodal(input: {
  prompt: string
  referenceImageId?: string
  history?: GeminiContextMessage[]
  signal: AbortSignal
}): Promise<GeminiMultimodalResponse> {
  const referenceImageId = input.referenceImageId?.toLowerCase()
  const history = input.history?.length ? input.history.slice(0, 20) : undefined
  const res = await fetch('/api/ai-platform/images/gemini', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      ...(referenceImageId && CONTROLLED_IMAGE_ASSET_PATH.test(`/api/ai-platform/images/${referenceImageId}`)
        ? { referenceImageId }
        : {}),
      ...(history ? { history } : {}),
    }),
    signal: input.signal,
  })

  const payload = await responsePayload(res)
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '图片创作失败，请稍后重试。')
  }
  const content = typeof payload?.content === 'string' ? payload.content.trim() : ''
  const imageUrl = isSafeImageUrl(payload?.imageUrl) ? payload.imageUrl : undefined
  if (!content && !imageUrl) {
    throw new Error('图片创作服务返回了无效结果，请稍后重试。')
  }
  return imageUrl ? { content, imageUrl } : { content }
}

const EMPTY_DRAFT_FACETS: ImageDraftFacets = { subject: '', style: '', composition: '', details: '', negative: '' }

// 服务端可能返回缺字段或非法形状的要素，这里做一次归一化兜底（与 server 端对齐）。
export function normalizeImageDraftFacets(value: unknown): ImageDraftFacets {
  if (!value || typeof value !== 'object') return { ...EMPTY_DRAFT_FACETS }
  const record = value as Record<string, unknown>
  const facets = { ...EMPTY_DRAFT_FACETS }
  for (const key of Object.keys(EMPTY_DRAFT_FACETS) as Array<keyof ImageDraftFacets>) {
    const field = record[key]
    if (typeof field === 'string' && field.trim()) facets[key] = field.trim()
  }
  return facets
}

export interface ImageDraftInput {
  modelId: ImageModelId
  desire: string
  history?: GeminiContextMessage[]
  referenceText?: string
  signal: AbortSignal
}

export interface ImageDraftResult {
  modelId: ImageModelId
  facets: ImageDraftFacets
  prompt: string
}

export async function draftImagePrompt(input: ImageDraftInput): Promise<ImageDraftResult> {
  const res = await fetch('/api/ai-platform/images/draft', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: input.modelId,
      desire: input.desire,
      ...(input.history?.length ? { history: input.history.slice(0, 20) } : {}),
      ...(input.referenceText?.trim() ? { referenceText: input.referenceText.trim() } : {}),
    }),
    signal: input.signal,
  })
  const payload = await responsePayload(res)
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '提示词起草失败，请稍后重试。')
  }
  if (!payload || typeof payload.prompt !== 'string') {
    throw new Error('提示词起草服务返回了无效结果，请稍后重试。')
  }
  return {
    modelId: input.modelId,
    facets: normalizeImageDraftFacets(payload.facets),
    prompt: payload.prompt,
  }
}

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/ai-platform/chat', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: opts.modelId,
      messages: toUpstreamMessages(opts.messages),
      system: opts.system ?? '',
      summary: opts.summary ?? '',
      params: opts.params ?? {},
    }),
    signal: opts.signal,
  })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => 'request failed')
    opts.onError(errText)
    return
  }
  if (!res.body) {
    opts.onError('No response body')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    opts.onDone(full)
  }

  const failEmptyResponse = () => {
    if (finished) return
    finished = true
    opts.onError('上游未返回有效回复')
  }

  const processBlock = (block: string): void => {
    const dataLines = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
    if (!dataLines.length) return
    const dataStr = dataLines.join('')

    if (dataStr === '[DONE]') {
      if (full) finish()
      else failEmptyResponse()
      return
    }

    try {
      const evt = JSON.parse(dataStr) as {
        // OpenAI format
        choices?: { delta?: { content?: string } }[]
        // Anthropic format
        type?: string
        delta?: { type?: string; text?: string }
        // tool-call visibility
        tool_call?: ToolCallTrace
      }

      // tool-call visibility
      if (evt.tool_call) {
        opts.onToolCall?.(evt.tool_call)
        return
      }

      // OpenAI format
      if (evt.choices?.[0]?.delta?.content) {
        const text = evt.choices[0].delta.content
        full += text
        opts.onToken(text)
        return
      }

      // Anthropic format
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
        full += evt.delta.text
        opts.onToken(evt.delta.text)
      } else if (evt.type === 'message_stop') {
        if (full) finish()
        else failEmptyResponse()
      }
    } catch {
      // partial JSON across chunk boundary — wait for more
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const separator = /\r?\n\r?\n/
      let match: RegExpExecArray | null
      while ((match = separator.exec(buffer))) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        processBlock(block)
        if (finished) return
      }
    }
    if (buffer.trim()) processBlock(buffer)
    if (!finished && full) finish()
    else if (!finished) failEmptyResponse()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      finish()
      return
    }
    throw e
  }
}
