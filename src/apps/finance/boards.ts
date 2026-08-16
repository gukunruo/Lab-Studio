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
}

export function createBoardPageState(query: Record<string, unknown>): BoardPageState {
  const validKind = query.kind === 'industry' || query.kind === 'concept'
  const validOrder = query.order === 'up' || query.order === 'down'
  const kind: BoardKind = query.kind === 'concept' ? 'concept' : 'industry'
  const order: BoardOrder = query.order === 'down' ? 'down' : 'up'
  const view: BoardView = validKind && validOrder && query.view === 'heatmap' ? 'heatmap' : 'list'
  return { kind, order, view }
}

export function heatmapAvailability(rows: BoardWeight[]): { available: boolean; reason: string } {
  const complete = rows.length > 0 && rows.every((row) => (
    Number.isFinite(row.weight)
    && (row.weight ?? 0) > 0
    && Boolean(row.weightProvider)
    && Boolean(row.weightSource)
  ))
  return complete
    ? { available: true, reason: '' }
    : { available: false, reason: '暂无真实权重数据，热力图不可用' }
}

export function heatmapFlexWeights(rows: BoardWeight[]): number[] {
  if (!heatmapAvailability(rows).available) return []
  const total = rows.reduce((sum, row) => sum + (row.weight ?? 0), 0)
  if (!Number.isFinite(total) || total <= 0) return []
  return rows.map((row) => (row.weight ?? 0) / total)
}

export function boardPageQuery(state: BoardPageState): Record<string, string> {
  return { kind: state.kind, order: state.order, view: state.view }
}
