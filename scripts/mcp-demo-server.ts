// 演示用 MCP server：以独立 tsx 进程跑一个本地 streamable-http 端点，
// 暴露几个只读/回显工具，用来验证 mcp-client → runAgentLoop 的整条链路。
//
// 启动：pnpm mcp:demo（见 package.json scripts）
// 之后在 .env 里配：
//   MCP_SERVERS='[{"id":"demo","name":"Demo MCP","url":"http://127.0.0.1:8765/mcp"}]'
//
// 工具命名空间会由 server/mcp-client.ts 处理，产出 mcp__demo__echo 等。

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

const PORT = Number(process.env.MCP_DEMO_PORT ?? 8765)

// 高层的 McpServer：registerTool 用 Zod 声明 inputSchema，SDK 会转成 JSON Schema
// 下发给客户端。这里故意做成"无状态"（sessionIdGenerator: undefined），
// 因为演示只有一个客户端会话，每次请求都自包含，最省事。
const server = new McpServer({ name: 'lab-studio-demo', version: '1.0.0' })

server.registerTool(
  'echo',
  { description: '原样回显给定的一段文本，用于测试工具调用链路。', inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: 'text', text }] }),
)

server.registerTool(
  'add',
  { description: '把两个整数相加并返回结果。', inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }),
)

server.registerTool(
  'greet',
  { description: '根据名字生成一句问候语。', inputSchema: { name: z.string() } },
  async ({ name }) => ({ content: [{ type: 'text', text: `你好，${name}！` }] }),
)

// 有状态会话：每个 MCP 会话一个 transport，按 mcp-session-id 复用，
// 关闭时清理。stateless 模式不允许复用同一个 transport 处理多次请求，
// 所以这里显式维护会话表。
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>()

async function handleMcp(req: Request): Promise<Response> {
  const sessionId = req.headers.get('mcp-session-id')
  let transport = sessionId ? transports.get(sessionId) : undefined
  if (!transport) {
    let created!: WebStandardStreamableHTTPServerTransport
    created = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => { transports.set(id, created) },
      onsessionclosed: (id) => { transports.delete(id) },
    })
    await server.connect(created)
    transport = created
  }
  return transport.handleRequest(req)
}

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true, name: 'lab-studio-demo' }))
app.all('/mcp', (c) => handleMcp(c.req.raw))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`MCP demo server on http://127.0.0.1:${info.port}/mcp`)
})
