import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { loadConfig } from './config.ts'
import { supportsMultimodal } from './models.ts'
import { hasMultimodalContent } from './detect.ts'

const config = loadConfig()
const app = new Hono()

app.all('/v1/messages', async (c) => {
  const reqHeaders = c.req.raw.headers
  const method = c.req.method

  let upstreamBody: string
  if (method === 'POST') {
    const rawBody = await c.req.text()
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      upstreamBody = rawBody
      parsed = {}
    }

    if (parsed && !Array.isArray(parsed)) {
      const model = typeof parsed.model === 'string' ? parsed.model : ''
      if (!supportsMultimodal(model) && hasMultimodalContent(parsed)) {
        parsed.model = config.multimodalModel
      }
    }
    upstreamBody = JSON.stringify(parsed)
  } else {
    upstreamBody = ''
  }

  const upstreamUrl = `${config.upstreamBaseUrl.replace(/\/$/, '')}/v1/messages`
  const upstream = await fetch(upstreamUrl, {
    method,
    headers: reqHeaders,
    body: method === 'POST' ? upstreamBody : undefined,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
})

app.all('*', async (c) => {
  const reqHeaders = c.req.raw.headers
  const method = c.req.method
  const upstreamUrl = `${config.upstreamBaseUrl.replace(/\/$/, '')}${c.req.path}`

  const upstream = await fetch(upstreamUrl, {
    method,
    headers: reqHeaders,
    body: method !== 'GET' && method !== 'HEAD' ? await c.req.text() : undefined,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
})

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`cc-router 监听 http://localhost:${info.port}`)
  console.log(`  上游: ${config.upstreamBaseUrl}`)
  console.log(`  多模态模型: ${config.multimodalModel}`)
})
