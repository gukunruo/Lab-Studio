import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { warmAiRecommendations } from './ai-platform'
import { closeMcpClients } from './mcp-client'

// 独立的 Node 进程同时提供 API 和构建后的 Vue 前端。
const port = Number(process.env.PORT ?? 8787)

await warmAiRecommendations()
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Lab Studio server listening on http://localhost:${info.port}`)
})

// 服务端退出时关闭所有 MCP 客户端，终止 stdio 子进程，避免成为孤儿。
async function shutdown(signal: string) {
  console.log(`[server] received ${signal}, shutting down…`)
  await closeMcpClients()
  process.exit(0)
}
process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
