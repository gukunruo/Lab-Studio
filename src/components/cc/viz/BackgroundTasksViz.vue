<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s11 — Background Task Lanes。主线程 + 守护后台线程并行，结果经 notification queue 注入工具结果。

type Lane = 'main' | 'bg1' | 'bg2'

interface StepInfo {
  title: string
  description: string
}

const STEP_INFO: StepInfo[] = [
  {
    title: 'Three Lanes',
    description:
      'The agent has a main thread and can spawn daemon background threads for parallel work.',
  },
  {
    title: 'Main Thread Working',
    description:
      'The main agent loop runs as usual, processing user requests.',
  },
  {
    title: 'Spawn Background',
    description:
      'Background tasks run as daemon threads. The main loop doesn\'t wait for them.',
  },
  {
    title: 'Multiple Backgrounds',
    description: 'Multiple background tasks can run concurrently.',
  },
  {
    title: 'Task Completes',
    description:
      'Background task finishes. Its result goes to the notification queue.',
  },
  {
    title: 'Queue Fills',
    description:
      'Results accumulate in the queue, invisible to the model during this turn.',
  },
  {
    title: 'Drain Queue',
    description:
      'Just before the next LLM call, all queued notifications are injected as tool_results. Non-blocking, async.',
  },
]

const LANE_Y: Record<Lane, number> = {
  main: 60,
  bg1: 140,
  bg2: 220,
}

const LANE_HEIGHT = 44
const TIMELINE_LEFT = 160
const TIMELINE_RIGHT = 720
const TIMELINE_WIDTH = TIMELINE_RIGHT - TIMELINE_LEFT

const QUEUE_Y = 300

interface WorkBlock {
  lane: Lane
  startFraction: number
  endFraction: number
  color: string
  label?: string
  appearsAtStep: number
  completesAtStep?: number
}

const WORK_BLOCKS: WorkBlock[] = [
  {
    lane: 'main',
    startFraction: 0,
    endFraction: 1,
    color: '#8b5cf6',
    label: 'Main agent loop',
    appearsAtStep: 1,
  },
  {
    lane: 'bg1',
    startFraction: 0.18,
    endFraction: 0.75,
    color: '#10b981',
    label: 'Run tests',
    appearsAtStep: 2,
    completesAtStep: 5,
  },
  {
    lane: 'bg2',
    startFraction: 0.35,
    endFraction: 0.58,
    color: '#3b82f6',
    label: 'Lint code',
    appearsAtStep: 3,
    completesAtStep: 4,
  },
]

interface ForkArrow {
  fromFraction: number
  toLane: Lane
  appearsAtStep: number
}

const FORK_ARROWS: ForkArrow[] = [
  { fromFraction: 0.18, toLane: 'bg1', appearsAtStep: 2 },
  { fromFraction: 0.35, toLane: 'bg2', appearsAtStep: 3 },
]

interface QueueCard {
  id: string
  label: string
  appearsAtStep: number
  drainsAtStep: number
}

const QUEUE_CARDS: QueueCard[] = [
  {
    id: 'lint-result',
    label: 'Lint: 0 errors',
    appearsAtStep: 4,
    drainsAtStep: 6,
  },
  {
    id: 'test-result',
    label: 'Tests: 42 passed',
    appearsAtStep: 5,
    drainsAtStep: 6,
  },
]

const LLM_CALL_FRACTION = 0.82
const TOTAL_STEPS = 7

function fractionToX(fraction: number): number {
  return TIMELINE_LEFT + fraction * TIMELINE_WIDTH
}

function getBlockEndFraction(block: WorkBlock, step: number): number {
  if (step < block.appearsAtStep) return block.startFraction
  if (block.completesAtStep !== undefined && step >= block.completesAtStep) {
    return block.endFraction
  }
  const growthSteps = (block.completesAtStep ?? 6) - block.appearsAtStep
  const stepsElapsed = step - block.appearsAtStep
  const progress = Math.min(stepsElapsed / growthSteps, 1)
  const range = block.endFraction - block.startFraction
  return block.startFraction + range * progress
}

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: TOTAL_STEPS,
  autoPlayInterval: 2500,
})

const stepInfo = computed(() => STEP_INFO[currentStep.value] ?? STEP_INFO[0]!)
const showLlmMarker = computed(() => currentStep.value >= 5)
const showDrain = computed(() => currentStep.value >= 6)

function blockStartX(block: WorkBlock): number {
  return fractionToX(block.startFraction)
}

function blockEndX(block: WorkBlock): number {
  return fractionToX(getBlockEndFraction(block, currentStep.value))
}

function blockWidth(block: WorkBlock): number {
  return Math.max(blockEndX(block) - blockStartX(block), 4)
}

function blockIsComplete(block: WorkBlock): boolean {
  return block.completesAtStep !== undefined && currentStep.value >= block.completesAtStep
}

function queueCardX(idx: number): number {
  return TIMELINE_LEFT + 20 + idx * 150
}

function queueCardY(): number {
  return QUEUE_Y + 10
}

function drainTargetX(idx: number): number {
  return fractionToX(LLM_CALL_FRACTION) + 10 + idx * 15
}

function drainTargetY(): number {
  return LANE_Y.main + LANE_HEIGHT / 2 - 12
}

function cardIsDraining(card: QueueCard): boolean {
  return currentStep.value >= card.drainsAtStep
}

function drainStyle(idx: number) {
  return {
    '--from-x': queueCardX(idx) + 'px',
    '--from-y': queueCardY() + 'px',
    '--to-x': drainTargetX(idx) + 'px',
    '--to-y': drainTargetY() + 'px',
  }
}

const LANE_META = [
  { key: 'main' as Lane, y: LANE_Y.main, label: 'Main Thread' },
  { key: 'bg1' as Lane, y: LANE_Y.bg1, label: 'Background 1' },
  { key: 'bg2' as Lane, y: LANE_Y.bg2, label: 'Background 2' },
]
</script>

<template>
  <section class="cc-viz cc-viz--bg">
    <div class="cc-viz__panel">
      <svg
        viewBox="0 0 780 380"
        class="cc-viz__svg"
        role="img"
        aria-label="Background task lanes"
      >
        <defs>
          <marker id="forkArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cc-arrow)" />
          </marker>
          <marker id="drainArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
          <filter id="blockGlow" x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feFlood floodColor="#8b5cf6" floodOpacity="0.2" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Timeline axis -->
        <line
          :x1="TIMELINE_LEFT"
          y1="30"
          :x2="TIMELINE_RIGHT"
          y2="30"
          stroke="var(--cc-label)"
          stroke-width="1"
          stroke-dasharray="4 3"
          opacity="0.5"
        />
        <text :x="TIMELINE_LEFT" y="22" font-size="9" font-family="var(--font-mono)" fill="var(--cc-label)">t=0</text>
        <text :x="TIMELINE_RIGHT" y="22" font-size="9" font-family="var(--font-mono)" fill="var(--cc-label)" text-anchor="end">time</text>

        <!-- Lane backgrounds and labels -->
        <g v-for="lane in LANE_META" :key="lane.key">
          <rect
            :x="TIMELINE_LEFT"
            :y="lane.y"
            :width="TIMELINE_WIDTH"
            :height="LANE_HEIGHT"
            rx="6"
            fill="none"
            stroke="var(--cc-node-stroke)"
            stroke-width="1"
            stroke-dasharray="4 2"
            opacity="0.6"
          />
          <text
            :x="TIMELINE_LEFT - 10"
            :y="lane.y + LANE_HEIGHT / 2 + 1"
            text-anchor="end"
            dominant-baseline="middle"
            font-size="11"
            font-weight="600"
            fill="var(--cc-label)"
          >
            {{ lane.label }}
          </text>
        </g>

        <!-- Work blocks -->
        <template v-for="block in WORK_BLOCKS" :key="block.lane">
          <g v-if="currentStep >= block.appearsAtStep">
            <rect
              :x="blockStartX(block)"
              :y="LANE_Y[block.lane] + 4"
              :height="LANE_HEIGHT - 8"
              rx="5"
              :width="blockWidth(block)"
              :fill="block.color"
              :filter="!blockIsComplete(block) && block.lane === 'main' ? 'url(#blockGlow)' : 'none'"
              :opacity="blockIsComplete(block) ? 0.7 : 1"
              class="cc-viz__workrect"
            />
            <text
              v-if="blockWidth(block) > 60 && block.label"
              :x="blockStartX(block) + blockWidth(block) / 2"
              :y="LANE_Y[block.lane] + LANE_HEIGHT / 2 + 1"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="10"
              font-weight="500"
              fill="#ffffff"
              class="cc-viz__block-label"
            >
              {{ block.label }}
            </text>
            <text
              v-if="blockIsComplete(block)"
              :x="blockEndX(block) + 6"
              :y="LANE_Y[block.lane] + LANE_HEIGHT / 2 + 1"
              dominant-baseline="middle"
              font-size="9"
              font-family="var(--font-mono)"
              fill="#10b981"
              class="cc-viz__done"
            >done</text>
          </g>
        </template>

        <!-- Fork arrows from main to background lanes -->
        <template v-for="arrow in FORK_ARROWS" :key="`fork-${arrow.toLane}`">
          <line
            v-if="currentStep >= arrow.appearsAtStep"
            :x1="fractionToX(arrow.fromFraction)"
            :y1="LANE_Y.main + LANE_HEIGHT"
            :x2="fractionToX(arrow.fromFraction) + 20"
            :y2="LANE_Y[arrow.toLane]"
            stroke="var(--cc-arrow)"
            stroke-width="1.5"
            marker-end="url(#forkArrow)"
            class="cc-viz__fade"
          />
        </template>

        <!-- LLM API call marker -->
        <g v-if="showLlmMarker" class="cc-viz__fade">
          <line
            :x1="fractionToX(LLM_CALL_FRACTION)"
            :y1="LANE_Y.main"
            :x2="fractionToX(LLM_CALL_FRACTION)"
            :y2="LANE_Y.main + LANE_HEIGHT"
            stroke="#f59e0b"
            stroke-width="2"
            stroke-dasharray="3 2"
          />
          <rect :x="fractionToX(LLM_CALL_FRACTION) - 36" :y="LANE_Y.main - 16" width="72" height="16" rx="3" fill="#f59e0b" />
          <text
            :x="fractionToX(LLM_CALL_FRACTION)"
            :y="LANE_Y.main - 6"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="8"
            font-weight="600"
            fill="#ffffff"
          >LLM API call</text>
        </g>

        <!-- Notification queue area -->
        <rect
          :x="TIMELINE_LEFT"
          :y="QUEUE_Y"
          :width="TIMELINE_WIDTH"
          height="54"
          rx="8"
          fill="none"
          stroke="var(--cc-node-stroke)"
          stroke-width="1"
        />
        <text :x="TIMELINE_LEFT - 10" :y="QUEUE_Y + 18" text-anchor="end" font-size="10" font-weight="600" fill="var(--cc-label)">Notification</text>
        <text :x="TIMELINE_LEFT - 10" :y="QUEUE_Y + 32" text-anchor="end" font-size="10" font-weight="600" fill="var(--cc-label)">Queue</text>

        <!-- Queue cards -->
        <template v-for="(card, idx) in QUEUE_CARDS" :key="card.id">
          <g v-if="currentStep >= card.appearsAtStep">
            <g
              v-if="cardIsDraining(card)"
              :style="drainStyle(idx)"
              class="cc-viz__qcard cc-viz__qcard--drain"
            >
              <rect x="0" y="0" width="130" height="34" rx="5" fill="var(--qcard-amber-fill)" stroke="#f59e0b" stroke-width="1" />
              <text x="65" y="13" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="var(--qcard-amber-text)">tool_result</text>
              <text x="65" y="26" text-anchor="middle" dominant-baseline="middle" font-size="8" font-family="var(--font-mono)" fill="var(--qcard-amber-sub)">{{ card.label }}</text>
            </g>
            <g v-else class="cc-viz__qcard cc-viz__qcard--enter">
              <rect :x="queueCardX(idx)" :y="queueCardY()" width="130" height="34" rx="5" fill="var(--qcard-green-fill)" stroke="#10b981" stroke-width="1" />
              <text :x="queueCardX(idx) + 65" :y="queueCardY() + 13" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="600" fill="var(--qcard-green-text)">tool_result</text>
              <text :x="queueCardX(idx) + 65" :y="queueCardY() + 26" text-anchor="middle" dominant-baseline="middle" font-size="8" font-family="var(--font-mono)" fill="var(--qcard-green-sub)">{{ card.label }}</text>
            </g>
          </g>
        </template>

        <!-- Drain arrows from queue to main thread at step 6 -->
        <template v-if="showDrain">
          <line
            :x1="fractionToX(LLM_CALL_FRACTION) + 20"
            :y1="QUEUE_Y"
            :x2="fractionToX(LLM_CALL_FRACTION) + 20"
            :y2="LANE_Y.main + LANE_HEIGHT + 4"
            stroke="#f59e0b"
            stroke-width="1.5"
            marker-end="url(#drainArrow)"
            class="cc-viz__fade"
          />
          <text
            :x="TIMELINE_LEFT + TIMELINE_WIDTH / 2"
            :y="QUEUE_Y + 30"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="10"
            font-family="var(--font-mono)"
            fill="var(--cc-label)"
            class="cc-viz__fade-delay"
          >queue drained -- injected into next LLM call</text>
        </template>
      </svg>

      <!-- Legend -->
      <div class="cc-viz__legend">
        <div class="cc-viz__legend-item">
          <span class="cc-viz__legend-swatch" style="background: #8b5cf6" />
          <span class="cc-viz__legend-label">Main thread</span>
        </div>
        <div class="cc-viz__legend-item">
          <span class="cc-viz__legend-swatch" style="background: #10b981" />
          <span class="cc-viz__legend-label">Background 1</span>
        </div>
        <div class="cc-viz__legend-item">
          <span class="cc-viz__legend-swatch" style="background: #3b82f6" />
          <span class="cc-viz__legend-label">Background 2</span>
        </div>
        <div class="cc-viz__legend-item">
          <span class="cc-viz__legend-swatch" style="background: #f59e0b" />
          <span class="cc-viz__legend-label">LLM boundary</span>
        </div>
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="TOTAL_STEPS"
      :is-playing="isPlaying"
      :step-title="stepInfo.title"
      :step-description="stepInfo.description"
      @prev="prev"
      @next="next"
      @reset="reset"
      @toggle="toggleAutoPlay"
    />
  </section>
</template>

<style scoped lang="scss">
.cc-viz--bg {
  --qcard-green-fill: #d1fae5;
  --qcard-green-text: #047857;
  --qcard-green-sub: #065f46;
  --qcard-amber-fill: #fef3c7;
  --qcard-amber-text: #b45309;
  --qcard-amber-sub: #92400e;

  display: flex;
  flex-direction: column;
  gap: 16px;
}

[data-theme='dark'] .cc-viz--bg {
  --qcard-green-fill: rgba(6, 64, 39, 0.25);
  --qcard-green-text: #34d399;
  --qcard-green-sub: #10b981;
  --qcard-amber-fill: rgba(69, 26, 3, 0.25);
  --qcard-amber-text: #fbbf24;
  --qcard-amber-sub: #f59e0b;
}

.cc-viz__panel {
  padding: 16px;
  min-height: 500px;
}

.cc-viz__svg {
  width: 100%;
  min-height: 300px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
}

.cc-viz__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
}

.cc-viz__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cc-viz__legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.cc-viz__legend-label {
  font-size: 10px;
  color: var(--color-text-muted);
}

.cc-viz__workrect {
  transition: width 0.6s ease-out, opacity 0.6s ease-out;
}

.cc-viz__block-label {
  animation: cc-viz-bg-fade 0.3s ease 0.3s both;
}

.cc-viz__done {
  animation: cc-viz-bg-fade 0.3s ease both;
}

.cc-viz__fade {
  animation: cc-viz-bg-fade 0.4s ease both;
}

.cc-viz__fade-delay {
  animation: cc-viz-bg-fade 0.3s ease 0.6s both;
}

.cc-viz__qcard--enter {
  animation: cc-viz-bg-qcard-in 0.5s ease-out both;
}

.cc-viz__qcard--drain {
  animation: cc-viz-bg-qcard-drain 0.8s ease-in-out both;
}

@keyframes cc-viz-bg-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes cc-viz-bg-qcard-in {
  from { opacity: 0; transform: translateY(-40px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes cc-viz-bg-qcard-drain {
  0% { transform: translate(var(--from-x), var(--from-y)); opacity: 1; }
  55% { opacity: 1; }
  100% { transform: translate(var(--to-x), var(--to-y)); opacity: 0; }
}
</style>
