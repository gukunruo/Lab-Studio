import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adaptMcpTool,
  capMcpTools,
  getMcpServerConfigs,
  isSafeMcpUrl,
  mergeMcpTools,
  namespaceMcpToolName,
  parseMcpServerConfig,
  serializeMcpResult,
  truncateMcpDescription,
  MCP_DESCRIPTION_MAX,
  MCP_MAX_TOOLS,
  type McpCallTool,
  type McpServerConfig,
  type McpTool,
} from '../server/mcp-client'
import type { AgentToolRegistry } from '../server/agent-engine'

test('namespaceMcpToolName prefixes server and tool, sanitizing unsafe chars', () => {
  const name = namespaceMcpToolName('demo server', 'get-weather')
  assert.equal(name, 'mcp__demo_server__get-weather')

  const spaced = namespaceMcpToolName('a b', 'c d')
  assert.equal(spaced, 'mcp__a_b__c_d')

  const exotic = namespaceMcpToolName('sé@ver', 'tool/with/slash')
  assert.equal(exotic, 'mcp__s_ver__tool_with_slash')

  const empties = namespaceMcpToolName('', '')
  assert.equal(empties, 'mcp__tool__tool')
})

test('adaptMcpTool maps inputSchema to parameters and truncates description', () => {
  const schema = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
  const tool: McpTool = { name: 'weather', description: 'x'.repeat(MCP_DESCRIPTION_MAX + 50), inputSchema: schema }
  const callTool: McpCallTool = async ({ name, arguments: args }) => ({ content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }] })

  const adapted = adaptMcpTool('demo', tool, callTool)
  assert.equal(adapted.name, 'mcp__demo__weather')
  assert.equal(adapted.description.length, MCP_DESCRIPTION_MAX + 1)
  assert.ok(adapted.description.endsWith('…'))
  assert.deepEqual(adapted.parameters, schema)
  assert.deepEqual(Object.keys(adapted.parameters), ['type', 'properties', 'required'])
})

test('adaptMcpTool defaults missing inputSchema to an object schema', () => {
  const adapted = adaptMcpTool('s', { name: 'no-schema' }, async () => ({ content: [] }))
  assert.deepEqual(adapted.parameters, { type: 'object' })
})

test('adaptMcpTool execute forwards args through the injected callTool', async () => {
  const received: unknown[] = []
  const callTool: McpCallTool = async (params) => {
    received.push(params)
    return { content: [{ type: 'text', text: 'ok' }] }
  }
  const adapted = adaptMcpTool('demo', { name: 'echo', inputSchema: {} }, callTool)
  const out = await adapted.execute({ a: 1 })
  assert.equal(out, 'ok')
  assert.deepEqual(received, [{ name: 'echo', arguments: { a: 1 } }])
})

test('serializeMcpResult joins text content and drops empty entries', () => {
  const out = serializeMcpResult({
    content: [
      { type: 'text', text: '第一行' },
      { type: 'text', text: '' },
      { type: 'text', text: '第二行' },
    ],
  })
  assert.equal(out, '第一行\n第二行')
})

test('serializeMcpResult renders image content as a placeholder', () => {
  const out = serializeMcpResult({
    content: [{ type: 'image', data: 'abc', mimeType: 'image/png' }],
  })
  assert.equal(out, '[图片 image/png，3 字节]')
})

test('serializeMcpResult falls back to structuredContent then to a message', () => {
  assert.equal(serializeMcpResult({ content: [], structuredContent: { k: 1 } }), '{"k":1}')
  assert.equal(serializeMcpResult({ content: [] }), '（MCP 工具未返回内容）')
})

test('serializeMcpResult marks isError and JSON-stringifies non-text items', () => {
  assert.equal(serializeMcpResult({ content: [], isError: true }), '（MCP 工具执行出错）')
  const out = serializeMcpResult({ content: [{ type: 'weird', n: 1 }] })
  assert.equal(out, '{"type":"weird","n":1}')
})

test('mergeMcpTools keeps built-ins and dedupes, never overriding the base registry', () => {
  const base: AgentToolRegistry = {
    web_search: { name: 'web_search', description: '内置', parameters: {}, execute: async () => '' },
  }
  const mcpTool = { name: 'mcp__demo__web_search', description: 'mcp', parameters: {}, execute: async () => '' }
  const conflicts = { name: 'web_search', description: 'mcp 撞名', parameters: {}, execute: async () => '' }

  const merged = mergeMcpTools(base, [mcpTool, conflicts])
  assert.equal(merged.web_search.description, '内置')
  assert.equal(merged.web_search.name, 'web_search')
  assert.equal(merged['mcp__demo__web_search'].description, 'mcp')
  assert.equal(Object.keys(merged).length, 2)
})

test('capMcpTools limits the number of tools', () => {
  const tools = Array.from({ length: MCP_MAX_TOOLS + 10 }, (_, i) => ({ name: `t${i}`, description: '' }))
  assert.equal(capMcpTools(tools).length, MCP_MAX_TOOLS)
})

test('truncateMcpDescription shortens long descriptions with an ellipsis', () => {
  assert.equal(truncateMcpDescription(undefined), '')
  assert.equal(truncateMcpDescription('short'), 'short')
  const long = 'a'.repeat(MCP_DESCRIPTION_MAX + 10)
  const out = truncateMcpDescription(long)
  assert.equal(out.length, MCP_DESCRIPTION_MAX + 1)
  assert.ok(out.endsWith('…'))
})

test('isSafeMcpUrl only allows http and https', () => {
  assert.equal(isSafeMcpUrl('http://127.0.0.1:8765/mcp'), true)
  assert.equal(isSafeMcpUrl('https://mcp.example.com'), true)
  assert.equal(isSafeMcpUrl('file:///etc/passwd'), false)
  assert.equal(isSafeMcpUrl('ws://example.com'), false)
  assert.equal(isSafeMcpUrl('not a url'), false)
})

test('parseMcpServerConfig parses a valid array and applies defaults', () => {
  const raw = JSON.stringify([
    { id: 'demo', name: 'Demo MCP', url: 'http://127.0.0.1:8765/mcp' },
    { id: 'sse-srv', url: 'https://mcp.example.com/sse', transport: 'sse' },
    { id: 'disabled', url: 'https://x.com', enabled: false },
    { id: 'bad-url', url: 'file:///etc' },
    { url: 'https://y.com' },
    'not-object',
  ])
  const configs = parseMcpServerConfig(raw)
  assert.equal(configs.length, 2)
  assert.deepEqual(configs[0], { id: 'demo', name: 'Demo MCP', url: 'http://127.0.0.1:8765/mcp', transport: 'streamable-http', enabled: true })
  assert.equal(configs[1]?.transport, 'sse')
})

test('parseMcpServerConfig tolerates empty, malformed, and non-array input', () => {
  assert.deepEqual(parseMcpServerConfig(undefined), [])
  assert.deepEqual(parseMcpServerConfig(''), [])
  assert.deepEqual(parseMcpServerConfig('not json'), [])
  assert.deepEqual(parseMcpServerConfig('{"a":1}'), [])
  assert.deepEqual(parseMcpServerConfig('[]'), [])
})

test('getMcpServerConfigs reads MCP_SERVERS from the passed environment', () => {
  const configs = getMcpServerConfigs({ MCP_SERVERS: JSON.stringify([{ id: 'a', url: 'https://a.example.com' }]) } as Record<string, string | undefined>)
  assert.equal(configs.length, 1)
  assert.equal(configs[0]?.id, 'a')
})
