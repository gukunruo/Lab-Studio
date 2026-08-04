import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { eq, and } from 'drizzle-orm'
import { db } from './db/client'
import { chatSessions, learningProgress } from './db/schema'

const USER_KEY_MAX = 128
const NOTE_MAX = 20_000
const MESSAGE_MAX = 50

type ProgressInput = {
  userKey?: unknown
  completed?: unknown
  lastOpened?: unknown
  notes?: unknown
  stepIndex?: unknown
}

type ChatInput = {
  userKey?: unknown
  messages?: unknown
}

function userKeyOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= USER_KEY_MAX ? value : null
}

function progressInput(body: ProgressInput) {
  const userKey = userKeyOf(body.userKey)
  if (!userKey || !Array.isArray(body.completed) || typeof body.notes !== 'string' || body.notes.length > NOTE_MAX) {
    return null
  }
  if (body.lastOpened !== null && typeof body.lastOpened !== 'string') return null
  if (!body.stepIndex || typeof body.stepIndex !== 'object' || Array.isArray(body.stepIndex)) return null
  return {
    userKey,
    completed: body.completed.filter((item): item is string => typeof item === 'string'),
    lastOpened: body.lastOpened as string | null,
    notes: body.notes,
    stepIndex: body.stepIndex as Record<string, number>,
  }
}

function chatInput(body: ChatInput) {
  const userKey = userKeyOf(body.userKey)
  if (!userKey || !Array.isArray(body.messages) || body.messages.length > MESSAGE_MAX) return null
  return { userKey, messages: body.messages }
}

function queryUserKey(value: string | undefined) {
  return userKeyOf(value)
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

  app.use('/api/*', cors())
  app.use('/*', serveStatic({ root: './dist' }))

  app.get('/api/health', (c) => c.json({ ok: true, service: 'lab-studio' }))

  app.get('/api/progress', async (c) => {
    const userKey = queryUserKey(c.req.query('userKey'))
    if (!userKey) return c.json({ error: 'valid userKey required' }, 400)
    const row = await db.select().from(learningProgress).where(eq(learningProgress.userKey, userKey)).get()
    return c.json(row ?? null)
  })

  app.put('/api/progress', async (c) => {
    const body = progressInput(await c.req.json<ProgressInput>())
    if (!body) return c.json({ error: 'invalid progress payload' }, 400)
    const updatedAt = new Date()
    await db
      .insert(learningProgress)
      .values({ ...body, updatedAt })
      .onConflictDoUpdate({
        target: learningProgress.userKey,
        set: { ...body, updatedAt },
      })
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  app.get('/api/chat-sessions', async (c) => {
    const userKey = queryUserKey(c.req.query('userKey'))
    if (!userKey) return c.json({ error: 'valid userKey required' }, 400)
    const rows = await db
      .select({ lessonId: chatSessions.lessonId, messages: chatSessions.messages, updatedAt: chatSessions.updatedAt })
      .from(chatSessions)
      .where(eq(chatSessions.userKey, userKey))
    return c.json(rows)
  })

  app.get('/api/chat-sessions/:lessonId', async (c) => {
    const userKey = queryUserKey(c.req.query('userKey'))
    const lessonId = c.req.param('lessonId')
    if (!userKey || !lessonId) return c.json({ error: 'valid userKey and lessonId required' }, 400)
    const row = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userKey, userKey), eq(chatSessions.lessonId, lessonId)))
      .get()
    return c.json(row ?? null)
  })

  app.put('/api/chat-sessions/:lessonId', async (c) => {
    const body = chatInput(await c.req.json<ChatInput>())
    const lessonId = c.req.param('lessonId')
    if (!body || !lessonId || lessonId.length > 128) return c.json({ error: 'invalid chat payload' }, 400)
    const updatedAt = new Date()
    const existing = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.userKey, body.userKey), eq(chatSessions.lessonId, lessonId)))
      .get()
    if (existing) {
      await db.update(chatSessions).set({ messages: body.messages, updatedAt }).where(eq(chatSessions.id, existing.id))
    } else {
      await db.insert(chatSessions).values({ userKey: body.userKey, lessonId, messages: body.messages, updatedAt })
    }
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  app.get('/api/ai/config', (c) => {
    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
    return c.json({
      available: Boolean(process.env.ANTHROPIC_API_KEY && baseUrl),
      model: process.env.ANTHROPIC_MODEL ?? '',
      baseUrlMasked: baseUrl ? maskUrl(baseUrl) : '',
    })
  })

  app.post('/api/ai/chat', async (c) => {
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

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404)
    return c.html('<!doctype html><html><body><script>location.replace("/")</script></body></html>')
  })

  return app
}
