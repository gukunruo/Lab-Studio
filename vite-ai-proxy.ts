import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

interface AiEnv {
  apiKey?: string
  baseUrl?: string
  model?: string
}

function readConfig(): AiEnv {
  const env: AiEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL,
  }
  if (env.apiKey && env.baseUrl) return env

  try {
    const path = join(homedir(), '.claude', 'settings.json')
    const raw = readFileSync(path, 'utf8')
    const settings = JSON.parse(raw) as { env?: Record<string, string> }
    const e = settings.env ?? {}
    return {
      apiKey: env.apiKey ?? e.ANTHROPIC_API_KEY,
      baseUrl: env.baseUrl ?? e.ANTHROPIC_BASE_URL,
      model: env.model ?? e.ANTHROPIC_MODEL,
    }
  } catch {
    return env
  }
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return url
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

function send(res: ServerResponse, status: number, json: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(json))
}

export default function aiProxy(): Plugin {
  let cached: AiEnv | null = null
  const cfg = (): AiEnv => (cached ??= readConfig())

  return {
    name: 'ai-proxy',
    configureServer(server: ViteDevServer) {
      const handler: Handler = async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/api/ai/')) return next()
        const c = cfg()

        if (req.method === 'GET' && url.startsWith('/api/ai/config')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              available: Boolean(c.apiKey && c.baseUrl),
              model: c.model ?? '',
              baseUrlMasked: c.baseUrl ? maskUrl(c.baseUrl) : '',
            }),
          )
          return
        }

        if (req.method === 'POST' && url.startsWith('/api/ai/chat')) {
          if (!c.apiKey || !c.baseUrl) {
            send(res, 503, { error: 'AI not configured' })
            return
          }
          const bodyStr = await readBody(req)
          let body: { messages?: unknown[]; system?: string; maxTokens?: number }
          try {
            body = JSON.parse(bodyStr)
          } catch {
            send(res, 400, { error: 'invalid JSON body' })
            return
          }
          if (!Array.isArray(body.messages)) {
            send(res, 400, { error: 'messages[] required' })
            return
          }

          const endpoint = `${c.baseUrl.replace(/\/$/, '')}/v1/messages`
          const upstreamBody = JSON.stringify({
            model: c.model ?? 'claude-sonnet-4-6',
            messages: body.messages,
            system: body.system ?? '',
            max_tokens: body.maxTokens ?? 2048,
            stream: true,
          })

          const controller = new AbortController()
          let aborted = false
          req.on('close', () => {
            if (!aborted) {
              aborted = true
              controller.abort()
            }
          })

          try {
            const upstream = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'x-api-key': c.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
                'user-agent': 'claude-cli/2.0.0 (external, cli)',
                'x-app': 'cli',
                'x-stainless-lang': 'js',
                'x-stainless-runtime': 'node',
              },
              body: upstreamBody,
              signal: controller.signal,
            })

            if (!upstream.ok || !upstream.body) {
              const errText = await upstream.text().catch(() => '')
              send(res, upstream.status || 502, { error: errText || upstream.statusText })
              return
            }

            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no')

            const reader = upstream.body.getReader()
            while (!aborted) {
              const { done, value } = await reader.read()
              if (done) break
              res.write(value)
            }
            res.end()
          } catch (err) {
            if (!res.headersSent) {
              send(res, 502, { error: String(err) })
            } else {
              try {
                res.end()
              } catch {
                /* already gone */
              }
            }
          }
          return
        }

        next()
      }
      server.middlewares.use(handler)
    },
  }
}
