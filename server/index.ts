import 'dotenv/config'
import { serve } from '@hono/node-server'
import { createApp } from './app'

// 独立的 Node 进程同时提供 API 和构建后的 Vue 前端。
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`Lab Studio server listening on http://localhost:${info.port}`)
})
