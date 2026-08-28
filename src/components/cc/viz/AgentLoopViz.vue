<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s01 — The Agent While-Loop。流程图 + messages[] 累积面板。

interface FlowNode {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  type: 'rect' | 'diamond'
}

const NODES: FlowNode[] = [
  { id: 'start', label: 'Start', x: 160, y: 30, w: 120, h: 40, type: 'rect' },
  { id: 'api_call', label: 'API Call', x: 160, y: 110, w: 120, h: 40, type: 'rect' },
  { id: 'check', label: 'stop_reason?', x: 160, y: 200, w: 140, h: 50, type: 'diamond' },
  { id: 'execute', label: 'Execute Tool', x: 160, y: 300, w: 120, h: 40, type: 'rect' },
  { id: 'append', label: 'Append Result', x: 160, y: 380, w: 120, h: 40, type: 'rect' },
  { id: 'end', label: 'Break / Done', x: 380, y: 200, w: 120, h: 40, type: 'rect' },
]

interface FlowEdge {
  from: string
  to: string
  label?: string
}

const EDGES: FlowEdge[] = [
  { from: 'start', to: 'api_call' },
  { from: 'api_call', to: 'check' },
  { from: 'check', to: 'execute', label: 'tool_use' },
  { from: 'execute', to: 'append' },
  { from: 'append', to: 'api_call' },
  { from: 'check', to: 'end', label: 'end_turn' },
]

const ACTIVE_NODES_PER_STEP: string[][] = [
  [],
  ['start'],
  ['api_call'],
  ['check', 'execute'],
  ['execute', 'append'],
  ['api_call', 'check', 'execute', 'append'],
  ['check', 'end'],
]

const ACTIVE_EDGES_PER_STEP: string[][] = [
  [],
  [],
  ['start->api_call'],
  ['api_call->check', 'check->execute'],
  ['execute->append'],
  ['append->api_call', 'api_call->check', 'check->execute', 'execute->append'],
  ['api_call->check', 'check->end'],
]

interface MessageBlock {
  role: string
  detail: string
  bg: string
}

const MESSAGES_PER_STEP: (MessageBlock | null)[][] = [
  [],
  [{ role: 'user', detail: 'Fix the login bug', bg: '#3b82f6' }],
  [],
  [{ role: 'assistant', detail: 'tool_use: read_file', bg: '#52525b' }],
  [{ role: 'tool_result', detail: 'auth.ts contents...', bg: '#10b981' }],
  [
    { role: 'assistant', detail: 'tool_use: edit_file', bg: '#52525b' },
    { role: 'tool_result', detail: 'file updated', bg: '#10b981' },
  ],
  [{ role: 'assistant', detail: 'end_turn: Done!', bg: '#a855f7' }],
]

const STEP_INFO = [
  { title: 'The While Loop', desc: "Every agent is a while loop that keeps calling the model until it says 'stop'." },
  { title: 'User Input', desc: 'The loop starts when the user sends a message.' },
  { title: 'Call the Model', desc: 'Send all messages to the LLM. It sees everything and decides what to do.' },
  { title: 'stop_reason: tool_use', desc: 'The model wants to use a tool. The loop continues.' },
  { title: 'Execute & Append', desc: 'Run the tool, append the result to messages[]. Feed it back.' },
  { title: 'Loop Again', desc: 'Same code path, second iteration. The model decides to edit a file.' },
  { title: 'stop_reason: end_turn', desc: "The model is done. Loop exits. That's the entire agent." },
]

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 7,
  autoPlayInterval: 2500,
})

function node(id: string): FlowNode {
  return NODES.find((n) => n.id === id)!
}

function edgePath(fromId: string, toId: string): string {
  const from = node(fromId)
  const to = node(toId)

  if (fromId === 'append' && toId === 'api_call') {
    const startX = from.x - from.w / 2
    const startY = from.y
    const endX = to.x - to.w / 2
    const endY = to.y
    return `M ${startX} ${startY} L ${startX - 50} ${startY} L ${endX - 50} ${endY} L ${endX} ${endY}`
  }

  if (fromId === 'check' && toId === 'end') {
    const startX = from.x + from.w / 2
    const startY = from.y
    const endX = to.x - to.w / 2
    const endY = to.y
    return `M ${startX} ${startY} L ${endX} ${endY}`
  }

  const startX = from.x
  const startY = from.y + from.h / 2
  const endX = to.x
  const endY = to.y - to.h / 2
  return `M ${startX} ${startY} L ${endX} ${endY}`
}

function edgeLabelPos(fromId: string, toId: string): { x: number; y: number } {
  if (fromId === 'check' && toId === 'end') {
    return { x: (node('check').x + node('end').x) / 2, y: node('check').y - 10 }
  }
  const from = node(fromId)
  const to = node(toId)
  return { x: from.x + 75, y: (from.y + to.y) / 2 }
}

const activeNodes = computed(() => ACTIVE_NODES_PER_STEP[currentStep.value] ?? [])
const activeEdges = computed(() => ACTIVE_EDGES_PER_STEP[currentStep.value] ?? [])

const visibleMessages = computed(() => {
  const out: MessageBlock[] = []
  for (let s = 0; s <= currentStep.value; s++) {
    for (const msg of MESSAGES_PER_STEP[s] ?? []) {
      if (msg) out.push(msg)
    }
  }
  return out
})

const stepInfo = computed(() => STEP_INFO[currentStep.value]!)
const showIter = computed(() => currentStep.value >= 5)

function nodeProps(n: FlowNode) {
  const isActive = activeNodes.value.includes(n.id)
  const isEnd = n.id === 'end'
  return {
    isActive,
    isEnd,
    fill: isActive ? (isEnd ? 'var(--cc-end)' : 'var(--cc-active)') : 'var(--cc-node-fill)',
    stroke: isActive ? (isEnd ? 'var(--cc-end-stroke)' : 'var(--cc-active-stroke)') : 'var(--cc-node-stroke)',
    width: isActive ? 2.5 : 1.5,
    text: isActive ? 'var(--cc-active-text)' : 'var(--cc-node-text)',
    glow: isActive,
  }
}
</script>

<template>
  <section class="cc-viz cc-viz--agent">
    <div class="cc-viz__panel">
      <div class="cc-viz__grid">
        <div class="cc-viz__left">
          <div class="cc-viz__panel-head">while (stop_reason === "tool_use")</div>
          <svg
            viewBox="0 0 500 440"
            class="cc-viz__svg"
            role="img"
            aria-label="The Agent While-Loop"
          >
            <defs>
              <marker id="cc-agent-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--cc-arrow)" />
              </marker>
              <marker id="cc-agent-arrow-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--cc-active)" />
              </marker>
            </defs>

            <template v-for="edge in EDGES" :key="`${edge.from}->${edge.to}`">
              <path
                :d="edgePath(edge.from, edge.to)"
                fill="none"
                :stroke="activeEdges.includes(`${edge.from}->${edge.to}`) ? 'var(--cc-active)' : 'var(--cc-edge)'"
                :stroke-width="activeEdges.includes(`${edge.from}->${edge.to}`) ? 2.5 : 1.5"
                class="cc-viz__edge"
                :marker-end="`url(#${activeEdges.includes(`${edge.from}->${edge.to}`) ? 'cc-agent-arrow-active' : 'cc-agent-arrow'})`"
              />
              <text
                v-if="edge.label"
                :x="edgeLabelPos(edge.from, edge.to).x"
                :y="edgeLabelPos(edge.from, edge.to).y"
                text-anchor="middle"
                font-size="10"
                font-family="var(--font-mono)"
                :fill="activeEdges.includes(`${edge.from}->${edge.to}`) ? 'var(--cc-active)' : 'var(--cc-label)'"
              >
                {{ edge.label }}
              </text>
            </template>

            <template v-for="n in NODES" :key="n.id">
              <g
                class="cc-viz__node"
                :class="[
                  nodeProps(n).isActive ? 'cc-viz__node--active' : '',
                  nodeProps(n).isActive ? (n.id === 'end' ? 'cc-viz__glow--end' : 'cc-viz__glow') : '',
                ]"
              >
                <polygon
                  v-if="n.type === 'diamond'"
                  :points="`${n.x},${n.y - n.h / 2} ${n.x + n.w / 2},${n.y} ${n.x},${n.y + n.h / 2} ${n.x - n.w / 2},${n.y}`"
                  :fill="nodeProps(n).fill"
                  :stroke="nodeProps(n).stroke"
                  :stroke-width="nodeProps(n).width"
                />
                <rect
                  v-else
                  :x="n.x - n.w / 2"
                  :y="n.y - n.h / 2"
                  :width="n.w"
                  :height="n.h"
                  rx="8"
                  :fill="nodeProps(n).fill"
                  :stroke="nodeProps(n).stroke"
                  :stroke-width="nodeProps(n).width"
                />
                <text
                  :x="n.x"
                  :y="n.y + 4"
                  text-anchor="middle"
                  font-size="12"
                  font-weight="600"
                  font-family="var(--font-mono)"
                  :fill="nodeProps(n).text"
                >
                  {{ n.label }}
                </text>
              </g>
            </template>

            <text
              v-if="showIter"
              x="60"
              y="130"
              text-anchor="middle"
              font-size="10"
              font-family="var(--font-mono)"
              fill="var(--cc-active)"
            >
              iter #2
            </text>
          </svg>
        </div>

        <div class="cc-viz__right">
          <div class="cc-viz__panel-head">messages[]</div>
          <div class="cc-viz__messages">
            <div v-if="visibleMessages.length === 0" class="cc-viz__empty">[ empty ]</div>
            <div
              v-for="(msg, i) in visibleMessages"
              :key="`${msg.role}-${msg.detail}-${i}`"
              class="cc-viz__msg"
              :style="{ background: msg.bg }"
            >
              <div class="cc-viz__msg-role">{{ msg.role }}</div>
              <div class="cc-viz__msg-detail">{{ msg.detail }}</div>
            </div>
            <div v-if="visibleMessages.length > 0" class="cc-viz__length">
              length: {{ visibleMessages.length }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="7"
      :is-playing="isPlaying"
      :step-title="stepInfo.title"
      :step-description="stepInfo.desc"
      @prev="prev"
      @next="next"
      @reset="reset"
      @toggle="toggleAutoPlay"
    />
  </section>
</template>

<style scoped lang="scss">
.cc-viz__grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-viz__svg {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
  min-height: 300px;
}

.cc-viz__messages {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
}

.cc-viz__empty {
  padding: 32px 0;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
}

.cc-viz__msg {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
}

.cc-viz__msg-role {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}

.cc-viz__msg-detail {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
}

.cc-viz__length {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

@media (min-width: 720px) {
  .cc-viz__grid {
    flex-direction: row;
  }

  .cc-viz__left {
    width: 60%;
  }

  .cc-viz__right {
    width: 40%;
  }
}
</style>
