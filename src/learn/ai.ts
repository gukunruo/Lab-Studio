import { guideSources, lessonSource, type LessonMeta } from '@/learn/curriculum'
import type { Step } from '@/learn/walkthrough'

export interface AiConfig {
  available: boolean
  model: string
  baseUrlMasked: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export async function getAiConfig(): Promise<AiConfig> {
  try {
    const res = await fetch('/api/ai/config', { credentials: 'include' })
    if (!res.ok) return { available: false, model: '', baseUrlMasked: '' }
    return (await res.json()) as AiConfig
  } catch {
    return { available: false, model: '', baseUrlMasked: '' }
  }
}

interface SSEEvent {
  type: string
  delta?: { type: string; text?: string }
}

export async function streamChat(opts: {
  messages: ChatMessage[]
  system: string
  maxTokens?: number
  onToken: (t: string) => void
  onDone: (full: string) => void
  signal: AbortSignal
}): Promise<void> {
  const { messages, system, maxTokens = 2048, onToken, onDone, signal } = opts

  const res = await fetch('/api/ai/chat', {
    credentials: 'include',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      system,
      maxTokens,
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => 'request failed')
    throw new Error(errText)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    onDone(full)
  }

  const flushBlock = (block: string): boolean => {
    const dataLines = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
    if (!dataLines.length) return false
    const dataStr = dataLines.join('')
    if (dataStr === '[DONE]') {
      finish()
      return true
    }
    try {
      const evt = JSON.parse(dataStr) as SSEEvent
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) {
        full += evt.delta.text
        onToken(evt.delta.text)
      } else if (evt.type === 'message_stop') {
        finish()
        return true
      }
    } catch {
      /* partial JSON across a chunk boundary — wait for more */
    }
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      if (flushBlock(block)) return
    }
  }
  if (buffer.trim()) flushBlock(buffer)
  finish()
}

export function buildSystemPrompt(lesson: LessonMeta, step: Step | null): string {
  const parts: string[] = [
    '你是我的 AI 应用开发教练（不主攻模型训练）。',
    '',
    '学员人设与约束：',
    guideSources.profile,
    '',
    '教学方法（HOW-TO-RESUME）：',
    guideSources.resume,
    '',
    `今日课程：Day ${String(lesson.day).padStart(2, '0')} · ${lesson.title.zh}`,
    `课程文件：docs/ai-learning/days/${lesson.file}`,
  ]
  if (step) {
    parts.push('', `当前步骤：${step.title}`, '当前步骤正文：', step.body)
  } else {
    parts.push('', '今日课程全文：', lessonSource(lesson))
  }
  parts.push(
    '',
    '规则：',
    '- 用前端工程师能懂的类比讲概念',
    '- 概念够用就停，不追论文',
    '- 不提前讲后面的课',
    '- 先给心智模型，再给 API/代码细节',
    '- 中文回答；代码注释用中文',
  )
  return parts.join('\n')
}
