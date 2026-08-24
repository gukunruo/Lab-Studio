import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConversationDigest, streamChat, toUpstreamMessages } from '../src/ai-platform/api'
import type { ChatMessage } from '../src/ai-platform/types'

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }))
}

function createOptions(overrides: Partial<Parameters<typeof streamChat>[0]> = {}) {
  const tokens: string[] = []
  const completed: string[] = []
  const errors: string[] = []

  return {
    options: {
      modelId: 'glm-5.2',
      messages: [{ role: 'user', content: '你好' }] as ChatMessage[],
      onToken: (token: string) => tokens.push(token),
      onDone: (content: string) => completed.push(content),
      onError: (error: string) => errors.push(error),
      signal: new AbortController().signal,
      ...overrides,
    },
    tokens,
    completed,
    errors,
  }
}

test('toUpstreamMessages excludes failed assistant placeholders but retains interrupted content', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: '第一个问题' },
    { role: 'assistant', content: '正常回答' },
    { role: 'assistant', content: '无法完成本次回复，请检查网络或稍后重试。', status: 'error' },
    { role: 'user', content: '继续' },
    { role: 'assistant', content: '已生成一半', status: 'interrupted' },
  ]

  assert.deepEqual(toUpstreamMessages(messages), [
    { role: 'user', content: '第一个问题' },
    { role: 'assistant', content: '正常回答' },
    { role: 'user', content: '继续' },
    { role: 'assistant', content: '已生成一半' },
  ])
})

test('toUpstreamMessages excludes structured image messages', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: '请总结这段话' },
    {
      type: 'image-request',
      role: 'user',
      requestId: 'image-1',
      prompt: '橘猫',
      modelId: 'gpt-image-2',
      aspectRatio: '1:1',
      createdAt: '2026-08-24T00:00:00.000Z',
    },
    {
      type: 'image-result',
      role: 'assistant',
      requestId: 'image-1',
      prompt: '橘猫',
      modelId: 'gemini-3-pro-image',
      aspectRatio: '1:1',
      status: 'completed',
      imageUrl: 'https://cdn.example.test/cat.png',
      createdAt: '2026-08-24T00:00:01.000Z',
    },
  ]

  assert.deepEqual(toUpstreamMessages(messages), [{ role: 'user', content: '请总结这段话' }])
})

test('streamChat sends only usable message history to the chat endpoint', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: { messages?: unknown } | undefined
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body))
    return sseResponse(['data: {"choices":[{"delta":{"content":"好的"}}]}\n\n', 'data: [DONE]\n\n'])
  }

  try {
    const { options, tokens, completed, errors } = createOptions({
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '失败提示', status: 'error' },
        { role: 'assistant', content: '保留内容', status: 'interrupted' },
      ],
    })
    await streamChat(options)

    assert.deepEqual(requestBody?.messages, [
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '保留内容' },
    ])
    assert.deepEqual(tokens, ['好的'])
    assert.deepEqual(completed, ['好的'])
    assert.deepEqual(errors, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamChat reports an empty completed SSE response as an error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => sseResponse(['data: [DONE]\n\n'])

  try {
    const { options, completed, errors } = createOptions()
    await streamChat(options)

    assert.deepEqual(completed, [])
    assert.deepEqual(errors, ['上游未返回有效回复'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamChat parses CRLF SSE events split across chunks', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => sseResponse([
    'data: {"choices":[{"delta":{"content":"跨"}}]}\r\n\r',
    '\ndata: {"choices":[{"delta":{"content":"块"}}]}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ])

  try {
    const { options, tokens, completed, errors } = createOptions()
    await streamChat(options)

    assert.deepEqual(tokens, ['跨', '块'])
    assert.deepEqual(completed, ['跨块'])
    assert.deepEqual(errors, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamChat completes streamed content when the upstream closes without a completion event', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => sseResponse(['data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'])

  try {
    const { options, completed, errors } = createOptions()
    await streamChat(options)

    assert.deepEqual(completed, ['部分'])
    assert.deepEqual(errors, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parseConversationDigest accepts a JSON code block and constrains entries to current messages', () => {
  const digest = parseConversationDigest('```json\n{"summary":"关键结论","outline":[{"messageIndex":0,"title":"问题","detail":"提出目标"},{"messageIndex":2,"title":"越界","detail":"应忽略"}]}\n```', 2)

  assert.deepEqual(digest && {
    summary: digest.summary,
    sourceMessageCount: digest.sourceMessageCount,
    outline: digest.outline,
  }, {
    summary: '关键结论',
    sourceMessageCount: 2,
    outline: [{ messageIndex: 0, title: '问题', detail: '提出目标' }],
  })
})

test('parseConversationDigest rejects malformed or empty digest content', () => {
  assert.equal(parseConversationDigest('not json', 2), null)
  assert.equal(parseConversationDigest('{"summary":"","outline":[]}', 2), null)
})
