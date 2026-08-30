// MCP（Model Context Protocol）客户端 —— 把外接 MCP server 暴露的工具，适配成本平台
// `AgentTool`（见 agent-engine.ts）合入工具注册表，让模型能通过现有的 `runAgentLoop` 调用。
//
// 设计（见 docs/superpowers/specs/2026-08-30-mcp-integration-design.md）：
// - 纯函数为主：命名空间化、工具适配、注册表合并、数量裁剪、描述截断、config 解析、结果序列化
//   都不依赖网络，便于单测；网络 IO（连接、listTools、callTool）集中在连接层，带进程级缓存。
// - 只接远端 HTTP/SSE（streamable-http / sse），不做本地 stdio 子进程。
// - 失败降级：连不上 / listTools 失败时返回空并记日志，不影响主流程。
// - 安全：只连服务端 allowlist（env MCP_SERVERS）里的 http/https URL，前端不可任意填（防 SSRF）。

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { AgentTool, AgentToolRegistry } from './agent-engine'

// ---- 常量与类型 ----

export const MCP_TOOL_PREFIX = 'mcp__'
export const MCP_MAX_TOOLS = 25
export const MCP_DESCRIPTION_MAX = 800
// 单个 MCP server 的加载超时：连接或 listTools 卡死时降级为空，避免挂起 /chat 请求。
export const MCP_LOAD_TIMEOUT_MS = 8000

export interface McpServerConfig {
  id: string
  name: string
  url: string
  transport: 'streamable-http' | 'sse'
  enabled: boolean
}

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

// 只取工具调用结果里我们真正关心的字段。
export interface McpCallToolResult {
  content: unknown[]
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

export type McpCallTool = (params: { name: string; arguments?: Record<string, unknown> }) => Promise<McpCallToolResult>

// ---- 纯函数：命名空间化 ----

// 把任意字符串压成适合做 function 名的片段（字母/数字/下划线/连字符），空则回退 toole。
export function sanitizeMcpSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'tool'
}

export function namespaceMcpToolName(serverId: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${sanitizeMcpSegment(serverId)}__${sanitizeMcpSegment(toolName)}`
}

// ---- 纯函数：描述截断 / 数量裁剪 ----

export function truncateMcpDescription(description: string | undefined, max = MCP_DESCRIPTION_MAX): string {
  if (!description) return ''
  return description.length > max ? `${description.slice(0, max)}…` : description
}

export function capMcpTools<T extends { description?: string }>(tools: T[], max = MCP_MAX_TOOLS): T[] {
  return tools.slice(0, max)
}

// ---- 纯函数：结果序列化 ----

function isTextContent(item: unknown): item is { type: 'text'; text: string } {
  return !!item && typeof item === 'object' && (item as { type?: unknown }).type === 'text'
    && typeof (item as { text?: unknown }).text === 'string'
}

function isImageContent(item: unknown): item is { type: 'image'; data: string; mimeType: string } {
  return !!item && typeof item === 'object' && (item as { type?: unknown }).type === 'image'
    && typeof (item as { data?: unknown }).data === 'string'
}

export function serializeMcpResult(result: McpCallToolResult): string {
  if (result.isError) return '（MCP 工具执行出错）'
  const parts: string[] = []
  for (const item of result.content ?? []) {
    if (isTextContent(item)) parts.push(item.text)
    else if (isImageContent(item)) parts.push(`[图片 ${item.mimeType}，${item.data.length} 字节]`)
    else parts.push(JSON.stringify(item))
  }
  const body = parts.filter(Boolean).join('\n')
  if (body) return body
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent)
  return '（MCP 工具未返回内容）'
}

// ---- 纯函数：工具适配 ----

// 把单个 MCP 工具适配成 AgentTool。execute 通过注入的 callTool 调 MCP server 的 tools/call，
// 结果经 serializeMcpResult 回填成模型可读的字符串。callTool 注入是为了让单测不依赖真实 server。
export function adaptMcpTool(serverId: string, mcpTool: McpTool, callTool: McpCallTool): AgentTool {
  return {
    name: namespaceMcpToolName(serverId, mcpTool.name),
    description: truncateMcpDescription(mcpTool.description),
    parameters: (mcpTool.inputSchema && typeof mcpTool.inputSchema === 'object')
      ? mcpTool.inputSchema
      : { type: 'object' },
    execute: async (args) => {
      const result = await callTool({ name: mcpTool.name, arguments: args })
      return serializeMcpResult(result)
    },
  }
}

// ---- 纯函数：注册表合并 ----

// 静态内置工具优先：MCP 工具与内置工具撞名时保留内置，MCP 之间按 name 去重（后者覆盖前者，
// 因为工具名已含 serverId 前缀，理论上不会冲突）。
export function mergeMcpTools(base: AgentToolRegistry, mcpTools: AgentTool[]): AgentToolRegistry {
  const merged: AgentToolRegistry = { ...base }
  for (const tool of mcpTools) {
    if (tool.name in merged) continue
    merged[tool.name] = tool
  }
  return merged
}

// ---- 纯函数：config 解析与 URL 校验 ----

export function isSafeMcpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseMcpServerConfig(raw: string | null | undefined): McpServerConfig[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item): McpServerConfig[] => {
    if (!item || typeof item !== 'object') return []
    const obj = item as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id.trim() : ''
    const url = typeof obj.url === 'string' ? obj.url.trim() : ''
    if (!id || !isSafeMcpUrl(url)) return []
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : id
    const transport = obj.transport === 'sse' ? 'sse' : 'streamable-http'
    const enabled = obj.enabled !== false
    if (!enabled) return []
    return [{ id, name, url, transport, enabled }]
  })
}

export function getMcpServerConfigs(env: Record<string, string | undefined> = process.env): McpServerConfig[] {
  return parseMcpServerConfig(env.MCP_SERVERS ?? '')
}

// ---- 网络层：transport 创建 + 连接缓存 + 工具加载 ----

function createMcpTransport(config: McpServerConfig): Transport {
  const url = new URL(config.url)
  if (config.transport === 'sse') return new SSEClientTransport(url)
  return new StreamableHTTPClientTransport(url)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP 加载超时（${ms}ms）`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

// 进程级缓存：同一 serverId 复用客户端连接（避免每个 /chat 请求都重连）。
const mcpClients = new Map<string, Client>()
// 已加载成功的工具列表；失败不缓存，下次调用重试。
const mcpToolLists = new Map<string, AgentTool[]>()
// 并发去重：同一次加载中的请求共享同一个 Promise，避免连接风暴。
const mcpConnecting = new Map<string, Promise<AgentTool[]>>()

async function loadMcpToolsForServer(config: McpServerConfig): Promise<AgentTool[]> {
  const cached = mcpToolLists.get(config.id)
  if (cached) return cached

  const inflight = mcpConnecting.get(config.id)
  if (inflight) return inflight

  const promise = withTimeout(
    (async (): Promise<AgentTool[]> => {
      let client = mcpClients.get(config.id)
      if (!client) {
        client = new Client({ name: 'lab-studio', version: '0.0.0' })
        await client.connect(createMcpTransport(config))
        mcpClients.set(config.id, client)
      }
      const { tools } = await client.listTools()
      const callTool: McpCallTool = (params) =>
        client.callTool({ name: params.name, ...(params.arguments !== undefined ? { arguments: params.arguments } : {}) }) as Promise<McpCallToolResult>
      const adapted = tools.map((tool) => adaptMcpTool(config.id, tool, callTool))
      const capped = capMcpTools(adapted)
      mcpToolLists.set(config.id, capped)
      return capped
    })(),
    MCP_LOAD_TIMEOUT_MS,
  ).catch((error) => {
    console.warn(`[mcp] 加载 ${config.id} 工具失败，本轮降级为空：`, error instanceof Error ? error.message : error)
    return [] as AgentTool[]
  })

  mcpConnecting.set(config.id, promise)
  try {
    return await promise
  } finally {
    mcpConnecting.delete(config.id)
  }
}

export async function loadAllMcpTools(configs: McpServerConfig[]): Promise<AgentTool[]> {
  const results = await Promise.all(configs.map((config) => loadMcpToolsForServer(config)))
  return results.flat()
}
