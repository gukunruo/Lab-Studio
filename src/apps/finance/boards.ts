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
  weightProvider?: string
  weightSource?: string
  weightTradeDate?: string
  memberCount?: number
  coveredMemberCount?: number
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
    && Number.isInteger(row.memberCount)
    && (row.memberCount ?? 0) > 0
    && row.coveredMemberCount === row.memberCount
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
