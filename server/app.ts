import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { and, eq } from 'drizzle-orm'
import { db } from './db/client'
import { chatSessions, learningProgress } from './db/schema'
import { authenticate, login, logout, requireAuth } from './auth'

const USER_KEY = 'admin'
const NOTE_MAX = 20_000
const MESSAGE_MAX = 50

type ProgressInput = {
  completed?: unknown
  lastOpened?: unknown
  notes?: unknown
  stepIndex?: unknown
}

type ChatInput = { messages?: unknown }

function progressInput(body: ProgressInput) {
  if (!Array.isArray(body.completed) || typeof body.notes !== 'string' || body.notes.length > NOTE_MAX) {
    return null
  }
  if (body.lastOpened !== null && typeof body.lastOpened !== 'string') return null
  if (!body.stepIndex || typeof body.stepIndex !== 'object' || Array.isArray(body.stepIndex)) return null
  return {
    userKey: USER_KEY,
    completed: body.completed.filter((item): item is string => typeof item === 'string'),
    lastOpened: body.lastOpened as string | null,
    notes: body.notes,
    stepIndex: body.stepIndex as Record<string, number>,
  }
}

function chatInput(body: ChatInput) {
  return Array.isArray(body.messages) && body.messages.length <= MESSAGE_MAX
    ? { userKey: USER_KEY, messages: body.messages }
    : null
}

function maskUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}`
  } catch {
    return value
  }
}

export function createApp() {
  const app = new Hono()

  app.use('/api/*', cors({ origin: (origin) => origin ?? '', credentials: true }))
  app.use('/*', serveStatic({ root: './dist' }))

  app.get('/api/health', (c) => c.json({ ok: true, service: 'lab-studio' }))

  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return c.json({ error: 'username and password required' }, 400)
    }
    if (!(await login(c, body.username, body.password))) return c.json({ error: 'invalid credentials' }, 401)
    return c.json({ authenticated: true, username: process.env.ADMIN_USERNAME })
  })

  app.get('/api/auth/me', async (c) => {
    if (!(await authenticate(c))) return c.json({ authenticated: false }, 401)
    return c.json({ authenticated: true, username: process.env.ADMIN_USERNAME })
  })

  app.post('/api/auth/logout', async (c) => {
    await logout(c)
    return c.json({ authenticated: false })
  })

  // 下面挂载到 /api 的业务接口都必须携带管理员 Session Cookie。
  const protectedApi = new Hono()
  protectedApi.use('*', requireAuth)

  // 数据归属键由服务端决定，客户端不能自行选择其他数据。

  protectedApi.get('/progress', async (c) => {
    const row = await db.select().from(learningProgress).where(eq(learningProgress.userKey, USER_KEY)).get()
    return c.json(row ?? null)
  })

  protectedApi.put('/progress', async (c) => {
    const body = progressInput(await c.req.json<ProgressInput>())
    if (!body) return c.json({ error: 'invalid progress payload' }, 400)
    const updatedAt = new Date()
    await db.insert(learningProgress).values({ ...body, updatedAt }).onConflictDoUpdate({
      target: learningProgress.userKey,
      set: { ...body, updatedAt },
    })
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  protectedApi.get('/chat-sessions', async (c) => {
    const rows = await db.select({
      lessonId: chatSessions.lessonId,
      messages: chatSessions.messages,
      updatedAt: chatSessions.updatedAt,
    }).from(chatSessions).where(eq(chatSessions.userKey, USER_KEY))
    return c.json(rows)
  })

  protectedApi.get('/chat-sessions/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    if (!lessonId) return c.json({ error: 'lessonId required' }, 400)
    const row = await db.select().from(chatSessions).where(and(
      eq(chatSessions.userKey, USER_KEY),
      eq(chatSessions.lessonId, lessonId),
    )).get()
    return c.json(row ?? null)
  })

  protectedApi.put('/chat-sessions/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    const body = chatInput(await c.req.json<ChatInput>())
    if (!body || !lessonId || lessonId.length > 128) return c.json({ error: 'invalid chat payload' }, 400)
    const updatedAt = new Date()
    const existing = await db.select({ id: chatSessions.id }).from(chatSessions).where(and(
      eq(chatSessions.userKey, USER_KEY),
      eq(chatSessions.lessonId, lessonId),
    )).get()
    if (existing) {
      await db.update(chatSessions).set({ messages: body.messages, updatedAt }).where(eq(chatSessions.id, existing.id))
    } else {
      await db.insert(chatSessions).values({ userKey: USER_KEY, lessonId, messages: body.messages, updatedAt })
    }
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  protectedApi.get('/ai/config', (c) => {
    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
    return c.json({
      available: Boolean(process.env.ANTHROPIC_API_KEY && baseUrl),
      model: process.env.ANTHROPIC_MODEL ?? '',
      baseUrlMasked: baseUrl ? maskUrl(baseUrl) : '',
    })
  })

  // 上游服务的凭证和流式响应都留在 Node 服务端，不暴露给浏览器。
  protectedApi.post('/ai/chat', async (c) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const baseUrl = process.env.ANTHROPIC_BASE_URL
    if (!apiKey || !baseUrl) return c.json({ error: 'AI not configured' }, 503)
    const body = await c.req.json<{ messages?: unknown[]; system?: string; maxTokens?: number }>()
    if (!Array.isArray(body.messages)) return c.json({ error: 'messages[] required' }, 400)
    const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'user-agent': 'claude-cli/2.0.0 (external, cli)',
        'x-app': 'cli',
        'x-stainless-lang': 'js',
        'x-stainless-runtime': 'node',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        messages: body.messages,
        system: body.system ?? '',
        max_tokens: body.maxTokens ?? 2048,
        stream: true,
      }),
      signal: c.req.raw.signal,
    })
    if (!upstream.ok || !upstream.body) {
      return c.json({ error: (await upstream.text().catch(() => '')) || upstream.statusText }, upstream.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503)
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  })

  app.route('/api', protectedApi)
  app.notFound((c) => c.req.path.startsWith('/api/')
    ? c.json({ error: 'Not found' }, 404)
    : c.html('<!doctype html><html><body><script>location.replace("/")</script></body></html>'))
  return app
}
