<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s02 — Tool Dispatch Map。dispatch(name) 路由到 handler，卡片高亮展示 tool 分发。

interface ToolDef {
  name: string
  desc: string
  activeFill: string
  activeBorder: string
  glow: string
}

const TOOLS: ToolDef[] = [
  { name: 'bash', desc: 'Execute shell commands', activeFill: '#f97316', activeBorder: '#ea580c', glow: '#f97316' },
  { name: 'read_file', desc: 'Read file contents', activeFill: '#0ea5e9', activeBorder: '#0284c7', glow: '#0ea5e9' },
  { name: 'write_file', desc: 'Create or overwrite a file', activeFill: '#10b981', activeBorder: '#059669', glow: '#10b981' },
  { name: 'edit_file', desc: 'Apply targeted edits', activeFill: '#8b5cf6', activeBorder: '#7c3aed', glow: '#8b5cf6' },
]

const ACTIVE_TOOL_PER_STEP: number[] = [-1, 0, 1, 2, 3, 4]
const REQUEST_PER_STEP: (string | null)[] = [
  null,
  '{ name: "bash", input: { cmd: "ls -la" } }',
  '{ name: "read_file", input: { path: "src/auth.ts" } }',
  '{ name: "write_file", input: { path: "config.json" } }',
  '{ name: "edit_file", input: { path: "index.ts" } }',
  null,
]

const STEP_INFO = [
  { title: 'The Dispatch Map', desc: 'A dictionary maps tool names to handler functions. The loop code never changes.' },
  { title: 'Route: bash', desc: "tool_call.name -> handlers['bash'](input). Name-based routing." },
  { title: 'Route: read_file', desc: 'Same pattern, different handler. Validate input, execute, return result.' },
  { title: 'Route: write_file', desc: 'Every tool returns a tool_result that goes back into messages[].' },
  { title: 'Route: edit_file', desc: 'Adding a new tool = adding one entry to the dispatch map.' },
  { title: 'The Key Insight', desc: 'The while loop stays the same. You only grow the dispatch map. That is it.' },
]

const SVG_WIDTH = 600
const SVG_HEIGHT = 320
const DISPATCHER_X = SVG_WIDTH / 2
const DISPATCHER_Y = 60
const DISPATCHER_W = 160
const DISPATCHER_H = 50
const CARD_Y = 230
const CARD_W = 110
const CARD_H = 65
const CARD_GAP = 20

function getCardX(index: number): number {
  const totalWidth = TOOLS.length * CARD_W + (TOOLS.length - 1) * CARD_GAP
  const startX = (SVG_WIDTH - totalWidth) / 2
  return startX + index * (CARD_W + CARD_GAP) + CARD_W / 2
}

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 6,
  autoPlayInterval: 2500,
})

const activeToolIdx = computed(() => ACTIVE_TOOL_PER_STEP[currentStep.value] ?? -1)
const request = computed(() => REQUEST_PER_STEP[currentStep.value] ?? null)
const stepInfo = computed(() => STEP_INFO[currentStep.value]!)
const isAllActive = computed(() => activeToolIdx.value === 4)
const isFirstStep = computed(() => currentStep.value === 0)
const dispatcherActive = computed(() => currentStep.value > 0)

function isToolActive(i: number): boolean {
  return isAllActive.value || i === activeToolIdx.value
}
</script>

<template>
  <section class="cc-viz cc-viz--tool">
    <div class="cc-viz__panel">
      <div class="cc-viz__incoming">
        <span class="cc-viz__incoming-label">Incoming:</span>
        <span v-if="request" class="cc-viz__req">{{ request }}</span>
        <span v-else-if="isFirstStep" class="cc-viz__waiting">waiting for tool_call...</span>
        <span v-if="isAllActive" class="cc-viz__all">All routes active</span>
      </div>

      <svg
        :viewBox="`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`"
        class="cc-viz__svg"
        role="img"
        aria-label="Tool Dispatch Map"
      >
        <defs>
          <filter id="cc-tool-glow">
            <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#3b82f6" flood-opacity="0.6" />
          </filter>
          <marker id="cc-tool-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--cc-active)" />
          </marker>
          <marker id="cc-tool-arrow-dim" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="var(--cc-arrow)" />
          </marker>
        </defs>

        <rect
          :x="DISPATCHER_X - DISPATCHER_W / 2"
          :y="DISPATCHER_Y - DISPATCHER_H / 2"
          :width="DISPATCHER_W"
          :height="DISPATCHER_H"
          rx="10"
          :fill="dispatcherActive ? 'var(--cc-active)' : 'var(--cc-node-fill)'"
          :stroke="dispatcherActive ? 'var(--cc-active-stroke)' : 'var(--cc-node-stroke)'"
          :stroke-width="2"
          :filter="dispatcherActive ? 'url(#cc-tool-glow)' : 'none'"
          class="cc-viz__shape"
        />
        <text
          :x="DISPATCHER_X"
          :y="DISPATCHER_Y + 1"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="13"
          font-weight="700"
          font-family="var(--font-mono)"
          :fill="dispatcherActive ? 'var(--cc-active-text)' : 'var(--cc-node-text)'"
        >dispatch(name)</text>

        <template v-for="(tool, i) in TOOLS" :key="tool.name">
          <line
            :x1="DISPATCHER_X"
            :y1="DISPATCHER_Y + DISPATCHER_H / 2"
            :x2="getCardX(i)"
            :y2="CARD_Y - CARD_H / 2"
            :stroke-width="isToolActive(i) ? 2.5 : 1.5"
            :stroke="isToolActive(i) ? 'var(--cc-active)' : 'var(--cc-edge)'"
            :marker-end="`url(#${isToolActive(i) ? 'cc-tool-arrow' : 'cc-tool-arrow-dim'})`"
            class="cc-viz__edge"
          />
          <g
            :class="{ 'cc-viz__node--active': isToolActive(i) }"
            :style="isToolActive(i) ? { filter: `drop-shadow(0 0 5px ${tool.glow})` } : undefined"
          >
            <rect
              :x="getCardX(i) - CARD_W / 2"
              :y="CARD_Y - CARD_H / 2"
              :width="CARD_W"
              :height="CARD_H"
              rx="8"
              :fill="isToolActive(i) ? tool.activeFill : 'var(--cc-node-fill)'"
              :stroke="isToolActive(i) ? tool.activeBorder : 'var(--cc-node-stroke)'"
              :stroke-width="2"
              class="cc-viz__shape"
            />
            <text
              :x="getCardX(i)"
              :y="CARD_Y - 8"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="11"
              font-weight="700"
              font-family="var(--font-mono)"
              :fill="isToolActive(i) ? '#ffffff' : 'var(--cc-node-text)'"
            >
              {{ tool.name }}
            </text>
            <text
              :x="getCardX(i)"
              :y="CARD_Y + 12"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="8"
              font-family="var(--font-sans)"
              :fill="isToolActive(i) ? 'rgba(255,255,255,0.8)' : 'var(--cc-label)'"
            >
              {{ tool.desc }}
            </text>
          </g>
        </template>

        <g v-if="isAllActive" class="cc-viz__plus">
          <circle
            :cx="getCardX(3) + CARD_W / 2 + 30"
            :cy="CARD_Y"
            r="16"
            fill="none"
            stroke="#3b82f6"
            stroke-width="2"
            stroke-dasharray="4 3"
          />
          <text
            :x="getCardX(3) + CARD_W / 2 + 30"
            :y="CARD_Y + 1"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="18"
            font-weight="700"
            fill="#3b82f6"
          >+</text>
        </g>
      </svg>

      <div class="cc-viz__snippet">
        <code class="cc-viz__snippet-code">
          <span class="cc-viz__kw">const</span> handlers =
          <span v-for="(tool, i) in TOOLS" :key="tool.name" class="cc-viz__snippet-tool" :class="{ 'cc-viz__snippet-tool--on': isToolActive(i) }">
            {{ tool.name }},
          </span>
        </code>
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="6"
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
.cc-viz--tool {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-viz__panel {
  padding: 16px;
}

.cc-viz__incoming {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cc-viz__incoming-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.cc-viz__req {
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
}

.cc-viz__waiting {
  font-size: 12px;
  opacity: 0.6;
  color: var(--color-text-muted);
}

.cc-viz__all {
  font-size: 12px;
  font-weight: 600;
  color: var(--cc-emerald-text);
}

.cc-viz__svg {
  width: 100%;
  min-height: 240px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
}

.cc-viz__shape {
  transition: fill 0.4s, stroke 0.4s;
}

.cc-viz__plus {
  animation: cc-tool-plus 0.4s ease both;
}

@keyframes cc-tool-plus {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

.cc-viz__snippet {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.cc-viz__snippet-code {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

.cc-viz__kw {
  color: var(--cc-blue-text);
}

.cc-viz__snippet-tool {
  color: var(--color-text);
  transition: color 0.3s, font-weight 0.3s;
}

.cc-viz__snippet-tool--on {
  color: var(--cc-blue-text);
  font-weight: 700;
}
</style>
