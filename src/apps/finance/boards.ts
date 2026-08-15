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
  const kind: BoardKind = query.kind === 'concept' ? 'concept' : 'industry'
  const order: BoardOrder = query.order === 'down' ? 'down' : 'up'
  return { kind, order, view: 'list' }
}

export function heatmapAvailability(rows: BoardWeight[]): { available: boolean; reason: string } {
  const complete = rows.length > 0 && rows.every((row) => (
    Number.isFinite(row.weight)
    && Boolean(row.weightProvider)
    && Boolean(row.weightSource)
  ))
  return complete
    ? { available: true, reason: '' }
    : { available: false, reason: '暂无真实权重数据，热力图不可用' }
}
