import { serveStatic } from '@hono/node-server/serve-static'
import { createRequire } from 'node:module'
import QRCode from 'qrcode'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { and, eq } from 'drizzle-orm'
import { db } from './db/client'
import {
  adminProfile,
  chatSessions,
  learningProgress,
  lessonAnnotations,
  lessonDocuments,
} from './db/schema'
import { authenticate, login, logout, requireAuth } from './auth'

// 单管理员模式下，所有学习数据都归属于这个固定的数据键；客户端不能提交自己的归属键。
const USER_KEY = 'admin'
// 限制笔记和聊天请求体的规模，避免浏览器误操作或异常请求持续膨胀 SQLite 文件。
const NOTE_MAX = 20_000
const MESSAGE_MAX = 50

// 网易云登录态仅保存在当前 Node 进程内存中；服务重启或主动断开后自动失效。
let neteaseCookie: string | null = null
type NeteaseQrSession = {
  key: string
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'failed'
  expiresAt: number
}

const neteaseQrSessions = new Map<string, NeteaseQrSession>()
const require = createRequire(import.meta.url)
const neteaseApi = require('NeteaseCloudMusicApi') as {
  login_qr_key: (query: { crypto: 'api' }) => Promise<{ body?: { data?: { unikey?: string } } }>
  login_qr_check: (query: { key: string; crypto: 'api' }) => Promise<{
    body?: { code?: number; message?: string; cookie?: string }
    cookie?: string[]
  }>
}

function clearExpiredQrSessions() {
  const now = Date.now()
  for (const [key, session] of neteaseQrSessions) {
    if (session.expiresAt <= now) neteaseQrSessions.delete(key)
  }
}

async function verifyNeteaseCookie(cookie: string) {
  const response = await fetch('https://music.163.com/api/nuser/account/get', {
    headers: { Cookie: cookie, Referer: 'https://music.163.com' },
  })
  const account = await response.json().catch(() => null) as { account?: { id?: number } } | null
  return response.ok && Boolean(account?.account?.id)
}

const neteaseAudioUrls = new Map<string, string>()

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

function validAnnotation(value: unknown): value is {
  id: string
  quote: string
  prefix?: string
  suffix?: string
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
  createdAt: string
  updatedAt?: string
  stale?: boolean
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string'
    && item.id.length <= 100
    && typeof item.quote === 'string'
    && item.quote.length >= 2
    && item.quote.length <= 2000
    && ['yellow', 'green', 'blue', 'pink', 'purple'].includes(item.color as string)
    && typeof item.createdAt === 'string'
    && (item.prefix === undefined || typeof item.prefix === 'string')
    && (item.suffix === undefined || typeof item.suffix === 'string')
    && (item.updatedAt === undefined || typeof item.updatedAt === 'string')
    && (item.stale === undefined || typeof item.stale === 'boolean')
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

  // 开发环境由 Vite 代理 /api；生产环境由这里统一处理跨域和静态资源。
  // credentials 必须开启，否则浏览器不会携带 HttpOnly Session Cookie。
  app.use('/api/*', cors({ origin: (origin) => origin ?? '', credentials: true }))
  // API 之外的请求交给构建产物，Node 服务因此可以独立托管整个 Vue 应用。
  app.use('/*', serveStatic({ root: './dist' }))

  // 健康检查不要求登录，供本地启动检查和部署探针使用。
  app.get('/api/health', (c) => c.json({ ok: true, service: 'lab-studio' }))

  // 登录成功只创建服务端 Session；密码和 Session 原文永远不返回浏览器。
  // 返回资料是为了让登录后的 Header 无需再发起一次恢复请求。
  app.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return c.json({ error: 'username and password required' }, 400)
    }
    if (!(await login(c, body.username, body.password))) return c.json({ error: 'invalid credentials' }, 401)
    const profile = await db.select().from(adminProfile).where(eq(adminProfile.id, 1)).get()
    return c.json({
      authenticated: true,
      username: profile?.displayName ?? process.env.ADMIN_USERNAME,
      avatarUrl: profile?.avatarUrl ?? '',
    })
  })

  app.get('/api/auth/me', async (c) => {
    if (!(await authenticate(c))) return c.json({ authenticated: false }, 401)
    const profile = await db.select().from(adminProfile).where(eq(adminProfile.id, 1)).get()
    return c.json({
      authenticated: true,
      username: profile?.displayName ?? process.env.ADMIN_USERNAME,
      avatarUrl: profile?.avatarUrl ?? '',
    })
  })

  // 资料属于管理员账号本身，不和课程进度混在一起；没有记录时返回环境变量中的默认名称。
  app.get('/api/profile', requireAuth, async (c) => {
    const profile = await db.select().from(adminProfile).where(eq(adminProfile.id, 1)).get()
    return c.json({
      displayName: profile?.displayName ?? process.env.ADMIN_USERNAME ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
    })
  })

  // 只允许更新显示资料，不允许客户端通过资料接口改变认证账号或 Session。
  app.put('/api/profile', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null) as { displayName?: unknown; avatarUrl?: unknown } | null
    if (!body || typeof body.displayName !== 'string' || body.displayName.length < 1 || body.displayName.length > 40 || typeof body.avatarUrl !== 'string' || body.avatarUrl.length > 500) {
      return c.json({ error: 'invalid profile payload' }, 400)
    }
    const updatedAt = new Date()
    await db.insert(adminProfile).values({ id: 1, displayName: body.displayName, avatarUrl: body.avatarUrl, updatedAt }).onConflictDoUpdate({
      target: adminProfile.id,
      set: { displayName: body.displayName, avatarUrl: body.avatarUrl, updatedAt },
    })
    return c.json({ displayName: body.displayName, avatarUrl: body.avatarUrl })
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

  // 文档覆盖和标注都按课程隔离，并由服务端固定管理员身份归属。
  protectedApi.get('/lesson-documents/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    if (!lessonId || lessonId.length > 128) return c.json({ error: 'invalid lesson id' }, 400)
    const row = await db.select({ content: lessonDocuments.content, updatedAt: lessonDocuments.updatedAt })
      .from(lessonDocuments)
      .where(eq(lessonDocuments.lessonId, lessonId))
      .get()
    return c.json(row ?? null)
  })

  protectedApi.put('/lesson-documents/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    const body = await c.req.json<{ content?: unknown }>().catch(() => null)
    if (!lessonId || lessonId.length > 128 || !body || typeof body.content !== 'string' || body.content.length > 200_000) {
      return c.json({ error: 'invalid lesson document' }, 400)
    }
    const updatedAt = new Date()
    await db.insert(lessonDocuments).values({ lessonId, content: body.content, updatedAt }).onConflictDoUpdate({
      target: lessonDocuments.lessonId,
      set: { content: body.content, updatedAt },
    })
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  protectedApi.delete('/lesson-documents/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    if (!lessonId || lessonId.length > 128) return c.json({ error: 'invalid lesson id' }, 400)
    await db.delete(lessonDocuments).where(eq(lessonDocuments.lessonId, lessonId))
    return c.json({ ok: true })
  })

  protectedApi.get('/lesson-annotations/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    if (!lessonId || lessonId.length > 128) return c.json({ error: 'invalid lesson id' }, 400)
    const row = await db.select({ annotations: lessonAnnotations.annotations, updatedAt: lessonAnnotations.updatedAt })
      .from(lessonAnnotations)
      .where(eq(lessonAnnotations.lessonId, lessonId))
      .get()
    return c.json(row ?? { annotations: [] })
  })

  protectedApi.put('/lesson-annotations/:lessonId', async (c) => {
    const lessonId = c.req.param('lessonId')
    const body = await c.req.json<{ annotations?: unknown }>().catch(() => null)
    if (!lessonId || lessonId.length > 128 || !body || !Array.isArray(body.annotations)
      || body.annotations.length > 300 || !body.annotations.every(validAnnotation)) {
      return c.json({ error: 'invalid lesson annotations' }, 400)
    }
    const updatedAt = new Date()
    await db.insert(lessonAnnotations).values({ lessonId, annotations: body.annotations, updatedAt }).onConflictDoUpdate({
      target: lessonAnnotations.lessonId,
      set: { annotations: body.annotations, updatedAt },
    })
    return c.json({ ok: true, updatedAt: updatedAt.toISOString() })
  })

  protectedApi.post('/netease/qr/start', async (c) => {
    clearExpiredQrSessions()
    const result = await neteaseApi.login_qr_key({ crypto: 'api' }).catch(() => null)
    const key = result?.body?.data?.unikey
    if (!key) return c.json({ error: '二维码生成失败' }, 502)

    const expiresAt = Date.now() + 3 * 60 * 1000
    neteaseQrSessions.set(key, { key, status: 'waiting', expiresAt })
    const loginUrl = `https://music.163.com/login?codekey=${encodeURIComponent(key)}`
    const qrimg = await QRCode.toDataURL(loginUrl, { margin: 1, width: 220 })
    return c.json({ key, qrimg, expiresAt })
  })

  protectedApi.get('/netease/qr/status/:key', async (c) => {
    const key = c.req.param('key')
    const session = neteaseQrSessions.get(key)
    if (!session || session.expiresAt <= Date.now()) {
      if (session) neteaseQrSessions.delete(key)
      return c.json({ status: 'expired' as const })
    }

    const result = await neteaseApi.login_qr_check({ key, crypto: 'api' }).catch(() => null)
    const body = result?.body
    const code = body?.code
    if (code === 803 || result?.cookie?.length) {
      const cookie = result?.cookie?.join(';') ?? body?.cookie ?? ''
      if (cookie && await verifyNeteaseCookie(cookie)) {
        neteaseCookie = cookie
        session.status = 'confirmed'
        neteaseQrSessions.delete(key)
        return c.json({ status: 'confirmed' as const })
      }
      session.status = 'failed'
      return c.json({ status: 'failed' as const, error: '网易云登录态校验失败' }, 502)
    }

    if (code === 802) session.status = 'scanned'
    else if (code === 801 || !code) session.status = 'waiting'
    else if (code === 800) {
      session.status = 'expired'
      neteaseQrSessions.delete(key)
    } else session.status = 'failed'

    return c.json({ status: session.status, message: body?.message ?? '' })
  })

  protectedApi.post('/netease/qr/cancel', async (c) => {
    const body = await c.req.json<{ key?: unknown }>().catch(() => null)
    if (body && typeof body.key === 'string') neteaseQrSessions.delete(body.key)
    return c.json({ ok: true })
  })

  protectedApi.post('/netease/connect', async (c) => {
    const body = await c.req.json<{ musicU?: unknown }>().catch(() => null)
    if (!body || typeof body.musicU !== 'string' || body.musicU.length < 20 || body.musicU.length > 2000) {
      return c.json({ error: 'invalid MUSIC_U' }, 400)
    }
    const cookie = `MUSIC_U=${body.musicU}; os=pc;`
    const response = await fetch('https://music.163.com/api/nuser/account/get', {
      headers: { Cookie: cookie, Referer: 'https://music.163.com' },
    })
    const account = await response.json().catch(() => null) as { code?: number; account?: { id?: number } } | null
    if (!response.ok || !account?.account?.id) return c.json({ error: '网易云登录态无效' }, 401)
    neteaseCookie = cookie
    return c.json({ connected: true })
  })

  protectedApi.post('/netease/disconnect', (c) => {
    neteaseCookie = null
    return c.json({ connected: false })
  })

  protectedApi.get('/netease/playlists', async (c) => {
    if (!neteaseCookie) return c.json({ error: '网易云未连接' }, 401)
    const accountResponse = await fetch('https://music.163.com/api/nuser/account/get', {
      headers: { Cookie: neteaseCookie, Referer: 'https://music.163.com' },
    })
    const account = await accountResponse.json().catch(() => null) as { account?: { id?: number } } | null
    const uid = account?.account?.id
    if (!uid) return c.json({ error: '网易云登录态已失效' }, 401)
    const response = await fetch(`https://music.163.com/api/user/playlist?uid=${uid}&limit=100`, {
      headers: { Cookie: neteaseCookie, Referer: 'https://music.163.com' },
    })
    const data = await response.json().catch(() => null) as { playlist?: Array<{ id: number; name: string; trackCount: number; coverImgUrl: string }> } | null
    if (!response.ok || !data?.playlist) return c.json({ error: '读取歌单失败' }, 502)
    return c.json({ playlists: data.playlist.map((item) => ({ id: item.id, name: item.name, trackCount: item.trackCount, cover: item.coverImgUrl })) })
  })

  protectedApi.get('/netease/playlists/:id/tracks', async (c) => {
    if (!neteaseCookie) return c.json({ error: '网易云未连接' }, 401)
    const id = c.req.param('id')
    if (!/^\d+$/.test(id)) return c.json({ error: 'invalid playlist id' }, 400)
    const headers = { Cookie: neteaseCookie, Referer: 'https://music.163.com' }
    const response = await fetch(`https://music.163.com/api/v6/playlist/detail?id=${id}&n=1000`, { headers })
    const data = await response.json().catch(() => null) as {
      playlist?: {
        tracks?: Array<{ id: number; name: string; ar?: Array<{ name: string }>; al?: { name?: string; picUrl?: string } }>
        trackIds?: Array<{ id: number }>
      }
    } | null
    if (!response.ok || !data?.playlist) return c.json({ error: '读取歌单详情失败' }, 502)

    let tracks = data.playlist.tracks ?? []
    const trackIds = data.playlist.trackIds?.map((track) => track.id).filter(Number.isInteger) ?? []

    // “我喜欢的音乐”等歌单常只返回 trackIds，需要再请求歌曲详情补齐名称、艺人和封面。
    if (!tracks.length && trackIds.length) {
      const detailResponse = await fetch('https://music.163.com/api/v3/song/detail', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ c: JSON.stringify(trackIds.map((trackId) => ({ id: trackId }))) }),
      })
      const detailData = await detailResponse.json().catch(() => null) as {
        songs?: Array<{ id: number; name: string; ar?: Array<{ name: string }>; al?: { name?: string; picUrl?: string } }>
      } | null
      tracks = detailData?.songs ?? []
    }

    if (!tracks.length) return c.json({ error: '歌单没有可读取的歌曲' }, 404)

    const playableIds = new Set<number>()
    for (let offset = 0; offset < tracks.length; offset += 50) {
      const batch = tracks.slice(offset, offset + 50)
      const ids = batch.map((track) => track.id)
      const urlResponse = await fetch(`https://music.163.com/api/song/enhance/player/url?ids=[${ids.join(',')}]&br=320000`, { headers })
      const urlData = await urlResponse.json().catch(() => null) as { data?: Array<{ id: number; url?: string | null }> } | null
      for (const item of urlData?.data ?? []) {
        if (!item.url) continue
        neteaseAudioUrls.set(String(item.id), item.url)
        playableIds.add(item.id)
      }
    }

    return c.json({ tracks: tracks.flatMap((track) => {
      if (!playableIds.has(track.id)) return []
      return [{
        id: `netease-${track.id}`,
        title: track.name,
        artist: track.ar?.map((artist) => artist.name).join(' / ') ?? '未知歌手',
        album: track.al?.name ?? '网易云音乐',
        cover: track.al?.picUrl ?? '',
        src: `/api/netease/audio/${track.id}`,
        lyrics: [],
      }]
    }) })
  })

  protectedApi.get('/netease/audio/:id', async (c) => {
    const src = neteaseAudioUrls.get(c.req.param('id'))
    if (!src) return c.json({ error: 'audio url expired' }, 404)
    const response = await fetch(src, { headers: { Referer: 'https://music.163.com' } })
    if (!response.ok || !response.body) return c.json({ error: 'audio unavailable' }, 502)
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
        'Content-Length': response.headers.get('content-length') ?? '',
        'Cache-Control': 'private, max-age=300',
      },
    })
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
