<script setup lang="ts">
import { computed } from 'vue'
import { getFlowForVersion, type LabFlowNode } from '@/learn/cc-execution-flows'

const props = defineProps<{ labId: string }>()

const flow = computed(() => getFlowForVersion(props.labId))

const NODE_WIDTH = 140
const NODE_HEIGHT = 44
const DIAMOND_WIDTH = 92
const DIAMOND_HEIGHT = 64

const LAYER_COLORS: Record<string, string> = {
  start: '#3B82F6',
  process: '#10B981',
  decision: '#F59E0B',
  subprocess: '#8B5CF6',
  end: '#EF4444',
}

type Bounds = { cx: number; cy: number; left: number; right: number; top: number; bottom: number }

function getNodeLines(node: LabFlowNode): string[] {
  const maxChars = node.type === 'decision' ? 12 : 18
  return node.label.split('\n').flatMap((line) => {
    if (line.length <= maxChars) return [line]
    const parts = line.split(/(\s+\/\s+|\s+|_)/).filter(Boolean)
    const chunks: string[] = []
    let current = ''
    for (const part of parts) {
      const next = `${current}${part}`
      if (current && next.trim().length > maxChars) {
        chunks.push(current.trim())
        current = part.trimStart()
      } else {
        current = next
      }
    }
    if (current.trim()) chunks.push(current.trim())
    return chunks.length ? chunks : [line]
  })
}

function estimateTextWidth(line: string, fontSize: number): number {
  return line.length * fontSize * 0.62
}

interface Metrics {
  lines: string[]
  width: number
  height: number
}

function getNodeMetrics(node: LabFlowNode): Metrics {
  const lines = getNodeLines(node)
  const longest = Math.max(...lines.map((line) => estimateTextWidth(line, 11)), 0)
  if (node.type === 'decision') {
    return { lines, width: Math.max(DIAMOND_WIDTH, longest + 54), height: Math.max(DIAMOND_HEIGHT, lines.length * 15 + 42) }
  }
  if (node.type === 'start' || node.type === 'end') {
    return { lines, width: Math.max(NODE_WIDTH, longest + 34), height: Math.max(NODE_HEIGHT, lines.length * 15 + 24) }
  }
  return { lines, width: Math.max(NODE_WIDTH, longest + 30), height: Math.max(NODE_HEIGHT, lines.length * 15 + 24) }
}

function getNodeBounds(node: LabFlowNode): Bounds {
  const { width, height } = getNodeMetrics(node)
  const halfW = width / 2
  const halfH = height / 2
  return { cx: node.x, cy: node.y, left: node.x - halfW, right: node.x + halfW, top: node.y - halfH, bottom: node.y + halfH }
}

const LOOP_RAIL_X = -48
const RIGHT_LOOP_RAIL_X = 576
const FLOW_CENTER_X = 300
const LOOP_PAD = 28
const LOOP_BACK_DX_LIMIT = 360
const LOOP_BACK_DY_LIMIT = 70

type LoopSide = 'left' | 'right'

function getLoopSide(start: Bounds, end: Bounds): LoopSide {
  return (start.cx + end.cx) / 2 > FLOW_CENTER_X ? 'right' : 'left'
}

function getLoopRailX(start: Bounds, end: Bounds, side = getLoopSide(start, end)): number {
  if (side === 'right') return Math.max(RIGHT_LOOP_RAIL_X, start.right + LOOP_PAD, end.right + LOOP_PAD)
  return Math.min(LOOP_RAIL_X, start.left - LOOP_PAD, end.left - LOOP_PAD)
}

function isLoopBack(start: Bounds, end: Bounds): boolean {
  const dx = end.cx - start.cx
  const dy = end.cy - start.cy
  return dy < -LOOP_BACK_DY_LIMIT && Math.abs(dx) <= LOOP_BACK_DX_LIMIT
}

function shouldUseStepRoute(start: Bounds, end: Bounds): boolean {
  const dx = end.cx - start.cx
  const dy = end.cy - start.cy
  return dy > 28 && Math.abs(dx) > 44 && end.top > start.bottom
}

function getStepBusY(start: Bounds, end: Bounds): number {
  const room = end.top - start.bottom
  return Math.min(end.top - 16, start.bottom + Math.max(18, room * 0.35))
}

function getEdgePath(from: LabFlowNode, to: LabFlowNode): string {
  const start = getNodeBounds(from)
  const end = getNodeBounds(to)
  const dx = end.cx - start.cx
  const dy = end.cy - start.cy

  if (isLoopBack(start, end)) {
    const side = getLoopSide(start, end)
    const railX = getLoopRailX(start, end, side)
    const startX = side === 'right' ? start.right : start.left
    const endX = side === 'right' ? end.right : end.left
    const midY = (start.cy + end.cy) / 2
    return `M ${startX} ${start.cy} C ${railX} ${start.cy}, ${railX} ${midY}, ${railX} ${midY} C ${railX} ${end.cy}, ${endX} ${end.cy}, ${endX} ${end.cy}`
  }

  if (Math.abs(dx) < 10) {
    if (dy >= 0) return `M ${start.cx} ${start.bottom} L ${end.cx} ${end.top}`
    return `M ${start.cx} ${start.top} L ${end.cx} ${end.bottom}`
  }

  if (Math.abs(dy) < 10) {
    const startX = dx > 0 ? start.right : start.left
    const endX = dx > 0 ? end.left : end.right
    const midX = (startX + endX) / 2
    return `M ${startX} ${start.cy} C ${midX} ${start.cy}, ${midX} ${end.cy}, ${endX} ${end.cy}`
  }

  if (shouldUseStepRoute(start, end)) {
    const busY = getStepBusY(start, end)
    return `M ${start.cx} ${start.bottom} L ${start.cx} ${busY} L ${end.cx} ${busY} L ${end.cx} ${end.top}`
  }

  if (Math.abs(dx) > 70) {
    const startX = dx > 0 ? start.right : start.left
    const endX = dx > 0 ? end.left : end.right
    const control = Math.max(56, Math.abs(dx) * 0.45)
    return `M ${startX} ${start.cy} C ${startX + (dx > 0 ? control : -control)} ${start.cy}, ${endX - (dx > 0 ? control : -control)} ${end.cy}, ${endX} ${end.cy}`
  }

  const startY = dy > 0 ? start.bottom : start.top
  const endY = dy > 0 ? end.top : end.bottom
  const controlDistance = Math.max(44, Math.abs(endY - startY) * 0.42)
  const controlY1 = startY + (endY > startY ? controlDistance : -controlDistance)
  const controlY2 = endY - (endY > startY ? controlDistance : -controlDistance)
  return `M ${start.cx} ${startY} C ${start.cx} ${controlY1}, ${end.cx} ${controlY2}, ${end.cx} ${endY}`
}

function getEdgeLabelPosition(from: LabFlowNode, to: LabFlowNode): { x: number; y: number } {
  const start = getNodeBounds(from)
  const end = getNodeBounds(to)
  const dx = end.cx - start.cx
  const dy = end.cy - start.cy

  if (isLoopBack(start, end)) {
    const side = getLoopSide(start, end)
    return { x: getLoopRailX(start, end, side) + (side === 'right' ? -24 : 24), y: (start.cy + end.cy) / 2 - 6 }
  }
  if (Math.abs(dy) < 10) return { x: (start.cx + end.cx) / 2, y: start.cy - 12 }
  if (shouldUseStepRoute(start, end)) return { x: (start.cx + end.cx) / 2, y: getStepBusY(start, end) - 8 }
  return { x: (start.cx + end.cx) / 2 + (dx > 0 ? 18 : -18), y: (start.bottom + end.top) / 2 - 8 }
}

function edgeFromNode(id: string): LabFlowNode | undefined {
  return flow.value?.nodes.find((n) => n.id === id)
}

const bounds = computed(() => (flow.value ? flow.value.nodes.map(getNodeBounds) : []))
const viewBox = computed(() => {
  if (!flow.value || bounds.value.length === 0) return '0 0 600 320'
  const minX = Math.min(-40, ...bounds.value.map((b) => b.left)) - 24
  const maxX = Math.max(700, ...bounds.value.map((b) => b.right)) + 24
  const maxY = Math.max(...bounds.value.map((b) => b.bottom), 0) + 50
  return `${minX} 0 ${maxX - minX} ${maxY}`
})
</script>

<template>
  <div class="cc-flow">
    <template v-if="!flow">
      <div class="cc-flow__na">该章节暂无执行流程。</div>
    </template>
    <template v-else>
      <div class="cc-flow__box">
        <svg :viewBox="viewBox" class="cc-flow__svg" role="img" aria-label="Execution flow">
          <defs>
            <marker id="cc-flow-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="var(--color-text-muted)" />
            </marker>
          </defs>

          <g v-for="(edge, i) in flow.edges" :key="`${edge.from}-${edge.to}-${i}`">
            <template v-if="edgeFromNode(edge.from) && edgeFromNode(edge.to)">
              <path
                :d="getEdgePath(edgeFromNode(edge.from)!, edgeFromNode(edge.to)!)"
                fill="none"
                stroke="var(--color-text-muted)"
                stroke-width="1.5"
                marker-end="url(#cc-flow-arrow)"
              />
              <text
                v-if="edge.label"
                :x="getEdgeLabelPosition(edgeFromNode(edge.from)!, edgeFromNode(edge.to)!).x"
                :y="getEdgeLabelPosition(edgeFromNode(edge.from)!, edgeFromNode(edge.to)!).y"
                text-anchor="middle"
                font-size="10"
                font-family="var(--font-mono)"
                fill="var(--color-text-muted)"
                stroke="var(--color-bg)"
                stroke-width="5"
                stroke-linejoin="round"
                paint-order="stroke"
              >
                {{ edge.label }}
              </text>
            </template>
          </g>

          <g v-for="node in flow.nodes" :key="node.id">
            <polygon
              v-if="node.type === 'decision'"
              :points="`${node.x},${node.y - getNodeMetrics(node).height / 2} ${node.x + getNodeMetrics(node).width / 2},${node.y} ${node.x},${node.y + getNodeMetrics(node).height / 2} ${node.x - getNodeMetrics(node).width / 2},${node.y}`"
              fill="none"
              :stroke="LAYER_COLORS[node.type]"
              stroke-width="2"
            />
            <rect
              v-else-if="node.type === 'start' || node.type === 'end'"
              :x="node.x - getNodeMetrics(node).width / 2"
              :y="node.y - getNodeMetrics(node).height / 2"
              :width="getNodeMetrics(node).width"
              :height="getNodeMetrics(node).height"
              rx="22"
              fill="none"
              :stroke="LAYER_COLORS[node.type]"
              stroke-width="2"
            />
            <rect
              v-else
              :x="node.x - getNodeMetrics(node).width / 2"
              :y="node.y - getNodeMetrics(node).height / 2"
              :width="getNodeMetrics(node).width"
              :height="getNodeMetrics(node).height"
              rx="4"
              fill="none"
              :stroke="LAYER_COLORS[node.type]"
              stroke-width="2"
              :stroke-dasharray="node.type === 'subprocess' ? '6 3' : undefined"
            />

            <text
              v-for="(line, li) in getNodeMetrics(node).lines"
              :key="li"
              :x="node.x"
              :y="node.y + (li - (getNodeMetrics(node).lines.length - 1) / 2) * 13"
              text-anchor="middle"
              dominant-baseline="central"
              :font-size="getNodeMetrics(node).lines.length > 2 ? 9 : node.type === 'start' || node.type === 'end' ? 12 : 11"
              :font-weight="node.type === 'start' || node.type === 'end' ? 600 : 400"
              font-family="var(--font-mono)"
              fill="var(--color-text)"
            >
              {{ line }}
            </text>
          </g>
        </svg>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cc-flow__na {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-flow__box {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  padding: 16px;
}

.cc-flow__svg {
  display: block;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  min-height: 300px;
  height: auto;
}
</style>
