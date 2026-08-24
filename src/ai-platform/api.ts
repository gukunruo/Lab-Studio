import type { ModelsByCategory, AiConversation, AiConversationSummary, AiPreferences, AiRecommendation, ChatMessage, ChatParams, ConversationDigest, ImageAspectRatio, ImageModelId, TextMessage } from './types'

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
  params?: ChatParams
  onToken: (token: string) => void
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

export interface ImageGenerationInput {
  modelId: ImageModelId
  prompt: string
  aspectRatio: ImageAspectRatio
  signal: AbortSignal
}

export interface ImageGenerationResponse {
  imageUrl: string
  modelId: ImageModelId
}

export function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  if (/^\/api\/ai-platform\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return true
  }
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export async function generateImage(input: ImageGenerationInput): Promise<ImageGenerationResponse> {
  const res = await fetch('/api/ai-platform/images/generations', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: input.modelId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
    }),
    signal: input.signal,
  })

  const payload = await res.json().catch(() => null) as { error?: unknown; imageUrl?: unknown; modelId?: unknown } | null
  if (!res.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '图片生成失败，请稍后重试。')
  }
  if (!payload || !isSafeImageUrl(payload.imageUrl) || (payload.modelId !== 'gpt-image-2' && payload.modelId !== 'gemini-3-pro-image')) {
    throw new Error('图片生成服务返回了无效结果，请稍后重试。')
  }
  return { imageUrl: payload.imageUrl, modelId: payload.modelId }
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
