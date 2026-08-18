import type { AiModel, ModelsByCategory, AiConversation, AiConversationSummary, ChatMessage, ChatParams } from './types'

export async function fetchModels(): Promise<ModelsByCategory> {
  const res = await fetch('/api/ai-platform/models', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}

export async function fetchConversations(): Promise<AiConversationSummary[]> {
  const res = await fetch('/api/ai-platform/conversations', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch conversations')
  return res.json()
}

export async function fetchConversation(id: number): Promise<AiConversation> {
  const res = await fetch(`/api/ai-platform/conversations/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch conversation')
  return res.json()
}

export async function createConversation(modelId: string, title?: string): Promise<AiConversation> {
  const res = await fetch('/api/ai-platform/conversations', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId, title }),
  })
  if (!res.ok) throw new Error('Failed to create conversation')
  return res.json()
}

export async function updateConversation(
  id: number,
  data: { title?: string; modelId?: string; systemPrompt?: string; params?: ChatParams; messages?: ChatMessage[] },
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

export async function streamChat(opts: StreamChatOptions): Promise<void> {
  const res = await fetch('/api/ai-platform/chat', {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      modelId: opts.modelId,
      messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      system: opts.system ?? '',
      params: opts.params ?? {},
    }),
    signal: opts.signal,
  })

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

  const processBlock = (block: string): void => {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
    if (!dataLines.length) return
    const dataStr = dataLines.join('')

    if (dataStr === '[DONE]') {
      finish()
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
        finish()
      }
    } catch {
      // partial JSON across chunk boundary — wait for more
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      processBlock(block)
      if (finished) return
    }
  }
  if (buffer.trim()) processBlock(buffer)
  finish()
}
