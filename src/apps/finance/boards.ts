import type { BoardResponseMeta } from './types'

export type BoardKind = 'industry' | 'concept'
export type BoardOrder = 'up' | 'down'
export type BoardView = 'list' | 'heatmap'

export interface BoardPageState {
  kind: BoardKind
  order: BoardOrder
  view: BoardView
}

export interface BoardWeight {
  weight?: number
  weightProvider?: 'eastmoney' | 'wenyuan' | '10jqka'
  weightSource?: string
  weightTradeDate?: string
  memberCount?: number
  coveredMemberCount?: number
  weightCoverage?: 'board-total' | 'provider-value'
  weightCoverageLabel?: string
}

export type BoardWeightMeta = Pick<BoardResponseMeta['weight'], 'status' | 'provider' | 'source' | 'tradeDate' | 'reason'>

export const HEATMAP_UNAVAILABLE_REASON = '暂无真实权重数据，热力图暂不可用'

export function createBoardPageState(query: Record<string, unknown>): BoardPageState {
  const kind: BoardKind = query.kind === 'concept' ? 'concept' : 'industry'
  const order: BoardOrder = query.order === 'down' ? 'down' : 'up'
  const view: BoardView = 'heatmap'
  return { kind, order, view }
}

export function heatmapAvailability(
  rows: BoardWeight[],
  meta?: BoardWeightMeta,
): { available: boolean; reason: string } {
  const unavailable = meta?.status !== 'available'
  const referenceProvider = meta?.provider
  const referenceSource = meta?.source
  const referenceDate = meta?.tradeDate
  const complete = !unavailable && rows.length > 0 && Boolean(referenceDate) && rows.every((row) => (
    Number.isFinite(row.weight)
    && (row.weight ?? 0) > 0
    && row.weightProvider === referenceProvider
    && row.weightSource === referenceSource
    && row.weightTradeDate === referenceDate
    && (
      row.weightCoverage === 'board-total'
        ? row.weightCoverageLabel === '板块总市值'
        : row.weightCoverage === 'provider-value'
          ? row.weightCoverageLabel === '公开热力图面积值' || row.weightCoverageLabel === '等权展示'
          : Number.isInteger(row.memberCount)
          && (row.memberCount ?? 0) > 0
          && row.coveredMemberCount === row.memberCount
    )
  ))
  return complete
    ? { available: true, reason: '' }
    : { available: false, reason: HEATMAP_UNAVAILABLE_REASON }
}

export function heatmapFlexWeights(rows: BoardWeight[], meta?: BoardWeightMeta): number[] {
  if (!heatmapAvailability(rows, meta).available) return []
  const total = rows.reduce((sum, row) => sum + (row.weight ?? 0), 0)
  if (!Number.isFinite(total) || total <= 0) return []
  return rows.map((row) => (row.weight ?? 0) / total)
}

export function boardPageQuery(state: BoardPageState): Record<string, string> {
  return { kind: state.kind, order: state.order }
}

export interface TreemapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TreemapItem extends TreemapRect {
  index: number
  weight: number
}

export function squarify(
  items: Array<{ weight: number }>,
  container: TreemapRect,
): TreemapItem[] {
  if (!items.length) return []
  const total = items.reduce((s, it) => s + it.weight, 0)
  if (total <= 0) return items.map((_, i) => ({ index: i, weight: items[i]!.weight, x: 0, y: 0, w: 0, h: 0 }))

  const normalized = items.map((it, i) => ({ index: i, weight: it.weight / total }))
  const result: TreemapItem[] = []
  let remaining = [...normalized]
  let rect: TreemapRect = { ...container }

  while (remaining.length > 0) {
    const { shortSide } = shortestSide(rect)
    const totalRemaining = remaining.reduce((s, it) => s + it.weight, 0)
    if (totalRemaining <= 0) break

    const scale = (shortSide * rect.w * rect.h) / (totalRemaining * Math.min(rect.w, rect.h) * Math.min(rect.w, rect.h))
    const area = (val: number) => val * scale * Math.min(rect.w, rect.h)

    let row: typeof remaining = []
    let bestRatio = Infinity

    for (let i = 0; i < remaining.length; i++) {
      const candidate = [...remaining.slice(0, i + 1)]
      const ratio = worstRatio(candidate, area, shortSide)
      if (ratio < bestRatio) {
        bestRatio = ratio
        row = candidate
      } else {
        break
      }
    }

    if (!row.length) row = [remaining[0]!]

    const rowWeight = row.reduce((s, it) => s + it.weight, 0)
    const isHorizontal = rect.w >= rect.h
    const stripLen = isHorizontal ? rect.h : rect.w
    const rowArea = (rowWeight / totalRemaining) * (rect.w * rect.h)
    const stripThickness = rowArea / stripLen

    let offset = 0
    for (const item of row) {
      const itemFrac = item.weight / rowWeight
      const itemLen = itemFrac * stripLen
      if (isHorizontal) {
        result.push({ index: item.index, weight: item.weight, x: rect.x, y: rect.y + offset, w: stripThickness, h: itemLen })
      } else {
        result.push({ index: item.index, weight: item.weight, x: rect.x + offset, y: rect.y, w: itemLen, h: stripThickness })
      }
      offset += itemLen
    }

    if (isHorizontal) {
      rect = { x: rect.x + stripThickness, y: rect.y, w: rect.w - stripThickness, h: rect.h }
    } else {
      rect = { x: rect.x, y: rect.y + stripThickness, w: rect.w, h: rect.h - stripThickness }
    }

    remaining = remaining.slice(row.length)
  }

  return result
}

function shortestSide(rect: TreemapRect): { shortSide: number; isHorizontal: boolean } {
  const isHorizontal = rect.w >= rect.h
  return { shortSide: isHorizontal ? rect.h : rect.w, isHorizontal }
}

function worstRatio(row: Array<{ weight: number }>, area: (v: number) => number, side: number): number {
  if (!row.length) return Infinity
  const total = row.reduce((s, it) => s + it.weight, 0)
  if (total <= 0) return Infinity
  const rowThickness = area(total) / side
  if (rowThickness <= 0) return Infinity
  let worst = 0
  for (const item of row) {
    const itemLen = area(item.weight) / rowThickness
    const ratio = Math.max(itemLen / rowThickness, rowThickness / itemLen)
    worst = Math.max(worst, ratio)
  }
  return worst
}
