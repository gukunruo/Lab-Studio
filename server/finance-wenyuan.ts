export const WENYUAN_TREEMAP_URL = 'https://map.wenyuanw.me/api/heatmap/treemap?market=all&period=day'
const MAX_CLOCK_SKEW_MS = 5 * 60_000
const VALUE_TOLERANCE = 1e-9

export interface WenyuanStockNode {
  code: string
  name: string
  boardName: string
  subBoardName: string
  exchange: string
  value: number
  price: number
  changePct: number
  turnoverAmount: number
}

export interface WenyuanIndustryNode {
  code: string
  name: string
  value: number
  stockCount: number
  children: WenyuanStockNode[]
  pct: number
  leaderName: string
  leaderPct: number
  upCount: number
  downCount: number
  memberCount: number
}

export interface WenyuanTreemapSnapshot {
  market: 'all'
  period: 'day'
  updatedAt: string
  source: string
  stockCount: number
  boardCount: number
  nodes: WenyuanIndustryNode[]
}

export class WenyuanUnavailableError extends Error {
  constructor() {
    super('Wenyuan public heatmap is unavailable')
    this.name = 'WenyuanUnavailableError'
  }
}

export class WenyuanSchemaError extends Error {
  constructor() {
    super('Wenyuan public heatmap schema is invalid')
    this.name = 'WenyuanSchemaError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) throw new WenyuanSchemaError()
  return value.trim()
}

function finiteField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new WenyuanSchemaError()
  return value
}

function positiveField(record: Record<string, unknown>, key: string): number {
  const value = finiteField(record, key)
  if (value <= 0) throw new WenyuanSchemaError()
  return value
}

function integerField(record: Record<string, unknown>, key: string): number {
  const value = finiteField(record, key)
  if (!Number.isInteger(value) || value <= 0) throw new WenyuanSchemaError()
  return value
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * VALUE_TOLERANCE
}

export function parseWenyuanTreemap(input: unknown, now = new Date()): WenyuanTreemapSnapshot {
  if (!isRecord(input) || input.market !== 'all' || input.period !== 'day') throw new WenyuanSchemaError()
  const updatedAt = stringField(input, 'updatedAt')
  const updatedTime = Date.parse(updatedAt)
  const nowTime = now.getTime()
  if (!Number.isFinite(updatedTime) || !Number.isFinite(nowTime) || updatedTime > nowTime + MAX_CLOCK_SKEW_MS) {
    throw new WenyuanSchemaError()
  }
  const source = stringField(input, 'source')
  const stockCount = integerField(input, 'stockCount')
  const boardCount = integerField(input, 'boardCount')
  if (!Array.isArray(input.nodes) || input.nodes.length === 0 || input.nodes.length !== boardCount) {
    throw new WenyuanSchemaError()
  }

  const nodeCodes = new Set<string>()
  const childCodes = new Set<string>()
  let childCount = 0
  let totalValue = 0
  const nodes = input.nodes.map((rawNode) => {
    if (!isRecord(rawNode)) throw new WenyuanSchemaError()
    const code = stringField(rawNode, 'code')
    const name = stringField(rawNode, 'name')
    if (nodeCodes.has(code) || !Array.isArray(rawNode.children) || rawNode.children.length === 0) {
      throw new WenyuanSchemaError()
    }
    nodeCodes.add(code)
    const value = positiveField(rawNode, 'value')
    const memberCount = integerField(rawNode, 'stockCount')
    if (rawNode.children.length !== memberCount) throw new WenyuanSchemaError()
    const children = rawNode.children.map((rawChild) => {
      if (!isRecord(rawChild)) throw new WenyuanSchemaError()
      const childCode = stringField(rawChild, 'code')
      if (childCodes.has(childCode)) throw new WenyuanSchemaError()
      childCodes.add(childCode)
      const childValue = positiveField(rawChild, 'value')
      const changePct = finiteField(rawChild, 'changePct')
      const turnoverAmount = finiteField(rawChild, 'turnoverAmount')
      if (turnoverAmount < 0) throw new WenyuanSchemaError()
      return {
        code: childCode,
        name: stringField(rawChild, 'name'),
        boardName: stringField(rawChild, 'boardName'),
        subBoardName: stringField(rawChild, 'subBoardName'),
        exchange: stringField(rawChild, 'exchange'),
        value: childValue,
        price: finiteField(rawChild, 'price'),
        changePct,
        turnoverAmount,
      }
    })
    const childValueTotal = children.reduce((sum, child) => sum + child.value, 0)
    if (!sameValue(value, childValueTotal)) throw new WenyuanSchemaError()
    const leader = children.reduce((best, child) => child.value > best.value ? child : best)
    totalValue += value
    childCount += children.length
    return {
      code,
      name,
      value,
      stockCount: memberCount,
      children,
      pct: children.reduce((sum, child) => sum + child.value * child.changePct, 0) / value,
      leaderName: leader.name,
      leaderPct: leader.changePct,
      upCount: children.filter((child) => child.changePct > 0).length,
      downCount: children.filter((child) => child.changePct < 0).length,
      memberCount,
    }
  })
  if (childCount !== stockCount || !Number.isFinite(totalValue) || totalValue <= 0) throw new WenyuanSchemaError()
  return { market: 'all', period: 'day', updatedAt, source, stockCount, boardCount, nodes }
}

export async function fetchWenyuanTreemap(input: {
  fetchImpl?: typeof fetch
  now?: Date
} = {}): Promise<WenyuanTreemapSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch
  try {
    const response = await fetchImpl(WENYUAN_TREEMAP_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new WenyuanUnavailableError()
    const payload = await response.json()
    return parseWenyuanTreemap(payload, input.now ?? new Date())
  } catch (error) {
    if (error instanceof WenyuanSchemaError) throw error
    throw new WenyuanUnavailableError()
  }
}
