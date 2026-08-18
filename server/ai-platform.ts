import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { aiModels, aiConversations } from './db/schema'
import { seedAiModels } from './ai-platform-seed'

const USER_KEY = 'admin'

let seeded = false
async function ensureSeeded(): Promise<void> {
  if (seeded) return
  seeded = true
  try {
    await seedAiModels()
  } catch (e) {
    console.error('AI platform seed failed:', e)
  }
}

export interface ChatRequestBody {
  modelId: string
  messages: { role: string; content: string }[]
  system?: string
  params?: { reasoningEffort?: string; maxTokens?: number }
}

interface UpstreamConfig {
  provider: string
  modelId: string
  baseUrl: string
  appId: string
  appKey: string
}

export interface UpstreamRequest {
  url: string
  headers: Headers
  body: string
}

export function buildUpstreamRequest(body: ChatRequestBody, config: UpstreamConfig): UpstreamRequest {
  const { provider, modelId, baseUrl, appId, appKey } = config
  const authHeader = `Bearer ${appId}:${appKey}`

  if (provider === 'anthropic') {
    const payload: Record<string, unknown> = {
      model: modelId,
      messages: body.messages,
      max_tokens: body.params?.maxTokens ?? 4096,
      stream: true,
    }
    if (body.system) payload.system = body.system
    return {
      url: `${baseUrl.replace(/\/$/, '')}/v1/messages`,
      headers: new Headers({
        Authorization: authHeader,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }
  }

  // openai-compatible
  const messages = [...body.messages]
  if (body.system) {
    messages.unshift({ role: 'system', content: body.system })
  }
  const payload: Record<string, unknown> = {
    model: modelId,
    messages,
    stream: true,
  }
  if (body.params?.reasoningEffort) {
    payload.reasoning_effort = body.params.reasoningEffort
  }
  return {
    url: `${baseUrl.replace(/\/$/, '')}/openai-compatible/v1/chat/completions`,
    headers: new Headers({
      Authorization: authHeader,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  }
}

export interface ConversationUpdate {
  title?: string
  modelId?: string
  systemPrompt?: string
  params?: Record<string, unknown>
  messages?: unknown[]
}

const TITLE_MAX = 200
const MESSAGE_MAX_AI = 500

export function normalizeConversationUpdate(input: ConversationUpdate): ConversationUpdate {
  const result: ConversationUpdate = {}
  if (typeof input.title === 'string') {
    result.title = input.title.slice(0, TITLE_MAX)
  }
  if (typeof input.modelId === 'string') {
    result.modelId = input.modelId
  }
  if (typeof input.systemPrompt === 'string') {
    result.systemPrompt = input.systemPrompt.slice(0, 10_000)
  }
  if (input.params !== undefined && typeof input.params === 'object' && input.params !== null) {
    result.params = input.params
  }
  if (Array.isArray(input.messages)) {
    result.messages = input.messages.slice(0, MESSAGE_MAX_AI)
  } else {
    result.messages = []
  }
  return result
}

export function registerAiPlatformRoutes(app: Hono): void {
  // 模型库 — 列出所有启用的模型，按 category 分组返回
  app.get('/ai-platform/models', async (c) => {
    await ensureSeeded()
    const rows = await db.select().from(aiModels).where(eq(aiModels.enabled, 1)).all()
    const grouped: Record<string, typeof rows> = { chat: [], reasoning: [], image: [] }
    for (const row of rows) {
      const cat = row.category
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(row)
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return c.json(grouped)
  })

  // 模型库 — 新增
  app.post('/ai-platform/models', async (c) => {
    const body = await c.req.json<{
      modelId: string
      displayName: string
      provider: string
      category: string
      vendor: string
      capabilities?: string[]
      contextWindow?: number | null
      sortOrder?: number
    }>()
    if (!body.modelId || !body.displayName || !body.provider || !body.category || !body.vendor) {
      return c.json({ error: 'modelId, displayName, provider, category, vendor are required' }, 400)
    }
    const now = new Date()
    const result = await db.insert(aiModels).values({
      modelId: body.modelId,
      displayName: body.displayName,
      provider: body.provider as 'openai-compatible' | 'anthropic',
      category: body.category as 'chat' | 'reasoning' | 'image',
      vendor: body.vendor,
      capabilities: body.capabilities ?? [],
      contextWindow: body.contextWindow ?? null,
      sortOrder: body.sortOrder ?? 99,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    }).returning()
    return c.json(result[0], 201)
  })

  // 模型库 — 编辑
  app.put('/ai-platform/models/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const body = await c.req.json<Partial<{
      displayName: string
      provider: string
      category: string
      vendor: string
      capabilities: string[]
      contextWindow: number | null
      sortOrder: number
      enabled: number
    }>>()
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.displayName !== undefined) update.displayName = body.displayName
    if (body.provider !== undefined) update.provider = body.provider
    if (body.category !== undefined) update.category = body.category
    if (body.vendor !== undefined) update.vendor = body.vendor
    if (body.capabilities !== undefined) update.capabilities = body.capabilities
    if (body.contextWindow !== undefined) update.contextWindow = body.contextWindow
    if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder
    if (body.enabled !== undefined) update.enabled = body.enabled
    await db.update(aiModels).set(update).where(eq(aiModels.id, id))
    const updated = await db.select().from(aiModels).where(eq(aiModels.id, id)).get()
    return c.json(updated)
  })

  // 模型库 — 删除
  app.delete('/ai-platform/models/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    await db.delete(aiModels).where(eq(aiModels.id, id))
    return c.json({ ok: true })
  })

  // 会话管理 — 列出当前用户的所有会话（不含 messages 全文）
  app.get('/ai-platform/conversations', async (c) => {
    const rows = await db
      .select({
        id: aiConversations.id,
        title: aiConversations.title,
        modelId: aiConversations.modelId,
        systemPrompt: aiConversations.systemPrompt,
        params: aiConversations.params,
        createdAt: aiConversations.createdAt,
        updatedAt: aiConversations.updatedAt,
      })
      .from(aiConversations)
      .where(eq(aiConversations.userKey, USER_KEY))
      .orderBy(aiConversations.updatedAt)
      .all()
    // Drizzle orderBy is ascending by default; reverse for descending
    return c.json(rows.reverse())
  })

  // 会话管理 — 新建空会话
  app.post('/ai-platform/conversations', async (c) => {
    const body = await c.req.json<{ modelId?: string; title?: string }>().catch(() => ({}) as { modelId?: string; title?: string })
    const now = new Date()
    const result = await db.insert(aiConversations).values({
      userKey: USER_KEY,
      title: body.title ?? '新对话',
      modelId: body.modelId ?? 'claude-opus-5',
      systemPrompt: '',
      params: {},
      messages: [],
      createdAt: now,
      updatedAt: now,
    }).returning()
    return c.json(result[0], 201)
  })

  // 会话管理 — 获取单个会话（含 messages）
  app.get('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const row = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!row || row.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    return c.json(row)
  })

  // 会话管理 — 更新会话
  app.put('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const body = normalizeConversationUpdate(await c.req.json<ConversationUpdate>())
    const existing = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!existing || existing.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.title !== undefined) update.title = body.title
    if (body.modelId !== undefined) update.modelId = body.modelId
    if (body.systemPrompt !== undefined) update.systemPrompt = body.systemPrompt
    if (body.params !== undefined) update.params = body.params
    if (body.messages !== undefined) update.messages = body.messages
    await db.update(aiConversations).set(update).where(eq(aiConversations.id, id))
    const updated = await db.select().from(aiConversations).where(eq(aiConversations.id, id)).get()
    return c.json(updated)
  })

  // 会话管理 — 删除会话
  app.delete('/ai-platform/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    if (!Number.isFinite(id)) return c.json({ error: 'invalid id' }, 400)
    const existing = await db.select({ userKey: aiConversations.userKey }).from(aiConversations).where(eq(aiConversations.id, id)).get()
    if (!existing || existing.userKey !== USER_KEY) return c.json({ error: 'not found' }, 404)
    await db.delete(aiConversations).where(eq(aiConversations.id, id))
    return c.json({ ok: true })
  })

  // 对话代理 — 统一流式输出
  app.post('/ai-platform/chat', async (c) => {
    const body = await c.req.json<ChatRequestBody>()
    if (!body.modelId || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'modelId and messages[] are required' }, 400)
    }

    const modelRow = await db.select().from(aiModels).where(eq(aiModels.modelId, body.modelId)).get()
    if (!modelRow) return c.json({ error: 'model not found' }, 404)

    const appId = process.env.TAL_MLOPS_APP_ID ?? ''
    const appKey = process.env.TAL_MLOPS_APP_KEY ?? ''
    const baseUrl = process.env.TAL_AI_BASE_URL ?? 'http://ai-service.tal.com'
    if (!appId || !appKey) return c.json({ error: 'AI credentials not configured' }, 503)

    const upstreamReq = buildUpstreamRequest(body, {
      provider: modelRow.provider,
      modelId: modelRow.modelId,
      baseUrl,
      appId,
      appKey,
    })

    const upstream = await fetch(upstreamReq.url, {
      method: 'POST',
      headers: upstreamReq.headers,
      body: upstreamReq.body,
      signal: c.req.raw.signal,
    })

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => upstream.statusText)
      return c.json({ error: errText || 'upstream error' }, upstream.status as 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503)
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
}
