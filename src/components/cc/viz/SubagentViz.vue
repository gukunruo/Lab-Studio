<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s06 — Subagent Context Isolation。父代理循环与孙子代理循环被 MESSAGE BOUNDARY 隔开，
// task prompt 下传、summary 上收，演示 subagent 的上下文隔离。

interface MessageBlock {
  id: string
  label: string
  color: string
}

const PARENT_BASE_MESSAGES: MessageBlock[] = [
  { id: 'p1', label: 'user: Build login + tests', color: '#3b82f6' },
  { id: 'p2', label: 'assistant: Planning approach...', color: '#52525b' },
  { id: 'p3', label: 'tool_result: project structure', color: '#10b981' },
]

const TASK_PROMPT: MessageBlock = {
  id: 'task',
  label: 'task: Write unit tests for auth',
  color: '#a855f7',
}

const CHILD_WORK_MESSAGES: MessageBlock[] = [
  { id: 'c1', label: 'tool_use: read auth.ts', color: '#f59e0b' },
  { id: 'c2', label: 'tool_use: write test.ts', color: '#f59e0b' },
]

const SUMMARY_BLOCK: MessageBlock = {
  id: 'summary',
  label: 'final: 3 tests written, all passing',
  color: '#14b8a6',
}

const STEP_INFO = [
  { title: 'Parent Context', desc: 'The parent agent has accumulated messages from the conversation.' },
  { title: 'Run Subagent', desc: 'Task runs a nested agent loop with fresh messages[]. Only the task prompt is passed.' },
  { title: 'Independent Work', desc: "The child has its own context. It doesn't see the parent's history." },
  { title: 'Final Response', desc: 'The subagent finishes with a text response.' },
  { title: 'Return Final Text', desc: 'The final text becomes the task tool result in the parent conversation.' },
  { title: 'Parent Continues', desc: "The parent continues without copying the subagent's intermediate messages." },
]

const SVG_W = 640
const SVG_H = 400
const PARENT_X = 16
const PARENT_Y = 16
const PARENT_W = 272
const PARENT_H = 368
const CHILD_X = 352
const CHILD_Y = 16
const CHILD_W = 272
const CHILD_H = 368
const WALL_X = 320
const BLOCK_W = 224
const BLOCK_H = 34
const BLOCK_GAP = 10
const P_BLOCK_X = 40
const C_BLOCK_X = 376
const BLOCK_Y0 = 96
const TASK_PILL_X = 252
const TASK_PILL_Y = 44
const TASK_PILL_W = 96
const TASK_PILL_H = 28
const SUMMARY_PILL_X = 290
const SUMMARY_PILL_Y = 288
const SUMMARY_PILL_W = 92
const SUMMARY_PILL_H = 28

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 6,
  autoPlayInterval: 2500,
})

const parentMessages = computed<MessageBlock[]>(() => {
  const base = [...PARENT_BASE_MESSAGES]
  if (currentStep.value >= 5) base.push(SUMMARY_BLOCK)
  return base
})

const childMessages = computed<MessageBlock[]>(() => {
  const s = currentStep.value
  if (s < 1) return []
  if (s === 1) return [TASK_PROMPT]
  if (s === 2) return [TASK_PROMPT, ...CHILD_WORK_MESSAGES]
  if (s === 3) return [SUMMARY_BLOCK]
  return s >= 4 ? [TASK_PROMPT, ...CHILD_WORK_MESSAGES] : []
})

const showChildEmpty = computed(() => currentStep.value === 0)
const showArcToChild = computed(() => currentStep.value === 1)
const showCompression = computed(() => currentStep.value === 3)
const showArcToParent = computed(() => currentStep.value === 4)
const childDiscarded = computed(() => currentStep.value >= 4)
const childFaded = computed(() => currentStep.value >= 4)
const showParentNote = computed(() => currentStep.value >= 5)
const stepInfo = computed(() => STEP_INFO[currentStep.value]!)

const childPanelClass = computed(() => ({
  'cc-sub__panel--child-empty': showChildEmpty.value,
  'cc-sub__panel--child-discarded': childDiscarded.value,
  'cc-sub__panel--child-active': !showChildEmpty.value && !childDiscarded.value,
}))

const childDotFill = computed(() => {
  if (showChildEmpty.value) return '#a1a1aa'
  if (childDiscarded.value) return '#71717a'
  return '#a855f7'
})

function blockTop(i: number): number {
  return BLOCK_Y0 + i * (BLOCK_H + BLOCK_GAP)
}
</script>

<template>
  <section class="cc-viz cc-viz--subagent">
    <div class="cc-viz__panel">
      <div class="cc-viz__panel-head">Subagent Context Isolation</div>

      <svg
        :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
        class="cc-viz__svg"
        role="img"
        aria-label="Subagent Context Isolation"
      >
        <!-- Parent agent loop -->
        <rect
          class="cc-sub__panel cc-sub__panel--parent"
          :x="PARENT_X"
          :y="PARENT_Y"
          :width="PARENT_W"
          :height="PARENT_H"
          rx="14"
          stroke-width="2"
        />
        <circle :cx="PARENT_X + 24" :cy="46" r="7" fill="#3b82f6" />
        <text :x="PARENT_X + 36" :y="50" text-anchor="start" class="cc-sub__header">Parent agent loop</text>
        <text :x="PARENT_X + 24" :y="76" class="cc-sub__sub">messages[]</text>

        <g v-for="(msg, i) in parentMessages" :key="msg.id" class="cc-sub__msg cc-sub__msg--in">
          <rect :x="P_BLOCK_X" :y="blockTop(i)" :width="BLOCK_W" :height="BLOCK_H" rx="8" :fill="msg.color" />
          <text :x="P_BLOCK_X + BLOCK_W / 2" :y="blockTop(i) + BLOCK_H / 2 + 4" text-anchor="middle" class="cc-sub__msg-text">{{ msg.label }}</text>
        </g>

        <g v-if="showParentNote" class="cc-sub__note cc-sub__note--blue cc-sub__msg--in">
          <rect :x="P_BLOCK_X" :y="286" :width="BLOCK_W" :height="30" rx="8" />
          <text :x="P_BLOCK_X + BLOCK_W / 2" :y="305" text-anchor="middle" class="cc-sub__note-text">parent receives one task result</text>
        </g>

        <!-- Isolation wall -->
        <line :x1="WALL_X" :y1="PARENT_Y" :x2="WALL_X" :y2="PARENT_Y + PARENT_H" class="cc-sub__wall" />
        <g transform="rotate(90 320 168)">
          <text x="320" y="168" text-anchor="middle" class="cc-sub__wall-label">MESSAGE BOUNDARY</text>
        </g>

        <!-- Nested subagent loop -->
        <rect
          class="cc-sub__panel"
          :class="childPanelClass"
          :x="CHILD_X"
          :y="CHILD_Y"
          :width="CHILD_W"
          :height="CHILD_H"
          rx="14"
          stroke-width="2"
        />
        <circle :cx="CHILD_X + 24" :cy="46" r="7" :fill="childDotFill" />
        <text
          :x="CHILD_X + 36"
          :y="50"
          text-anchor="start"
          class="cc-sub__header"
          :class="{ 'cc-sub__header--muted': showChildEmpty || childDiscarded }"
        >Subagent loop</text>
        <text :x="CHILD_X + 24" :y="76" class="cc-sub__sub">messages[] (fresh)</text>

        <g v-if="showChildEmpty" class="cc-sub__msg--in">
          <rect :x="C_BLOCK_X" :y="BLOCK_Y0" :width="BLOCK_W" :height="150" rx="8" fill="none" stroke="var(--cc-edge)" stroke-dasharray="5 5" />
          <text :x="C_BLOCK_X + BLOCK_W / 2" :y="175" text-anchor="middle" class="cc-sub__empty-text">not yet started</text>
        </g>

        <g
          v-for="(msg, i) in childMessages"
          :key="`${msg.id}-child`"
          class="cc-sub__msg cc-sub__msg--in-r"
          :class="{ 'cc-sub__msg--faded': childFaded }"
        >
          <rect :x="C_BLOCK_X" :y="blockTop(i)" :width="BLOCK_W" :height="BLOCK_H" rx="8" :fill="msg.color" />
          <text :x="C_BLOCK_X + BLOCK_W / 2" :y="blockTop(i) + BLOCK_H / 2 + 4" text-anchor="middle" class="cc-sub__msg-text">{{ msg.label }}</text>
        </g>

        <g v-if="showCompression" class="cc-sub__note cc-sub__note--amber cc-sub__msg--in">
          <rect :x="C_BLOCK_X" :y="250" :width="BLOCK_W" :height="30" rx="8" />
          <text :x="C_BLOCK_X + BLOCK_W / 2" :y="269" text-anchor="middle" class="cc-sub__note-text">Preparing final response...</text>
        </g>

        <g v-if="childDiscarded" class="cc-sub__note cc-sub__note--red cc-sub__msg--in">
          <rect :x="C_BLOCK_X" :y="250" :width="BLOCK_W" :height="30" rx="8" />
          <text :x="C_BLOCK_X + BLOCK_W / 2" :y="269" text-anchor="middle" class="cc-sub__note-text">local messages released</text>
        </g>

        <!-- Animated arcs: task prompt (parent -> child), summary (child -> parent) -->
        <g v-if="showArcToChild" class="cc-sub__arc cc-sub__arc--to-child">
          <rect :x="TASK_PILL_X" :y="TASK_PILL_Y" :width="TASK_PILL_W" :height="TASK_PILL_H" rx="8" fill="#a855f7" />
          <text :x="TASK_PILL_X + TASK_PILL_W / 2" :y="TASK_PILL_Y + TASK_PILL_H / 2 + 4" text-anchor="middle" class="cc-sub__pill-text">task prompt</text>
        </g>

        <g v-if="showArcToParent" class="cc-sub__arc cc-sub__arc--to-parent">
          <rect :x="SUMMARY_PILL_X" :y="SUMMARY_PILL_Y" :width="SUMMARY_PILL_W" :height="SUMMARY_PILL_H" rx="8" fill="#14b8a6" />
          <text :x="SUMMARY_PILL_X + SUMMARY_PILL_W / 2" :y="SUMMARY_PILL_Y + SUMMARY_PILL_H / 2 + 4" text-anchor="middle" class="cc-sub__pill-text">summary</text>
        </g>
      </svg>
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
.cc-viz--subagent {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-viz__panel {
  padding: 16px;
}

.cc-viz__svg {
  width: 100%;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
}

.cc-sub__panel {
  transition: fill 0.3s, stroke 0.3s;
}

.cc-sub__panel--parent {
  fill: rgba(59, 130, 246, 0.06);
  stroke: #93c5fd;
}

[data-theme='dark'] .cc-sub__panel--parent {
  fill: rgba(59, 130, 246, 0.12);
  stroke: #1d4ed8;
}

.cc-sub__panel--child-active {
  fill: rgba(168, 85, 247, 0.06);
  stroke: #c084fc;
}

[data-theme='dark'] .cc-sub__panel--child-active {
  fill: rgba(168, 85, 247, 0.12);
  stroke: #7e22ce;
}

.cc-sub__panel--child-empty {
  fill: rgba(113, 113, 122, 0.06);
  stroke: #a1a1aa;
  stroke-dasharray: 6 4;
}

[data-theme='dark'] .cc-sub__panel--child-empty {
  fill: rgba(113, 113, 122, 0.10);
  stroke: #52525b;
}

.cc-sub__panel--child-discarded {
  fill: rgba(113, 113, 122, 0.05);
  stroke: #a1a1aa;
}

[data-theme='dark'] .cc-sub__panel--child-discarded {
  fill: rgba(113, 113, 122, 0.08);
  stroke: #52525b;
}

.cc-sub__header {
  font-size: 13px;
  font-weight: 700;
  fill: var(--cc-node-text);
}

.cc-sub__header--muted {
  fill: var(--cc-label);
}

.cc-sub__sub {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: var(--cc-label);
}

.cc-sub__wall {
  stroke: var(--cc-edge);
}

.cc-sub__wall-label {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--cc-label);
  letter-spacing: 1px;
}

.cc-sub__msg {
  transform-box: fill-box;
}

.cc-sub__msg--in {
  animation: cc-sub-in 0.4s ease both;
}

.cc-sub__msg--in-r {
  animation: cc-sub-in-r 0.4s ease both;
}

.cc-sub__msg--faded {
  opacity: 0.3;
  animation: none;
}

.cc-sub__msg-text {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  fill: #fff;
}

.cc-sub__empty-text {
  font-size: 11px;
  fill: var(--color-text-muted);
}

.cc-sub__note {
  transform-box: fill-box;
}

.cc-sub__note--blue rect {
  fill: rgba(59, 130, 246, 0.10);
  stroke: #bfdbfe;
}

[data-theme='dark'] .cc-sub__note--blue rect {
  fill: rgba(59, 130, 246, 0.15);
  stroke: #1d4ed8;
}

.cc-sub__note--blue .cc-sub__note-text {
  fill: #1d4ed8;
}

[data-theme='dark'] .cc-sub__note--blue .cc-sub__note-text {
  fill: #93c5fd;
}

.cc-sub__note--amber rect {
  fill: rgba(245, 158, 11, 0.12);
  stroke: #fcd34d;
}

[data-theme='dark'] .cc-sub__note--amber rect {
  fill: rgba(245, 158, 11, 0.15);
  stroke: #b45309;
}

.cc-sub__note--amber .cc-sub__note-text {
  fill: #b45309;
}

[data-theme='dark'] .cc-sub__note--amber .cc-sub__note-text {
  fill: #fcd34d;
}

.cc-sub__note--red rect {
  fill: rgba(239, 68, 68, 0.08);
  stroke: #fca5a5;
}

[data-theme='dark'] .cc-sub__note--red rect {
  fill: rgba(239, 68, 68, 0.12);
  stroke: #b91c1c;
}

.cc-sub__note--red .cc-sub__note-text {
  fill: #dc2626;
}

[data-theme='dark'] .cc-sub__note--red .cc-sub__note-text {
  fill: #fca5a5;
}

.cc-sub__note-text {
  font-size: 10px;
  font-weight: 600;
}

.cc-sub__arc {
  transform-box: fill-box;
}

.cc-sub__arc--to-child {
  animation: cc-sub-to-child 1s ease-in-out both;
}

.cc-sub__arc--to-parent {
  animation: cc-sub-to-parent 1s ease-in-out both;
}

.cc-sub__pill-text {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  fill: #fff;
}

@keyframes cc-sub-in {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes cc-sub-in-r {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes cc-sub-to-child {
  from { opacity: 0; transform: translateX(-110px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes cc-sub-to-parent {
  from { opacity: 0; transform: translateX(110px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
