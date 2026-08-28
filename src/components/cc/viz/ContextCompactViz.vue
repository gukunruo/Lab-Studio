<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s08 — Three-Layer Context Compression。上下文窗口 token 压缩：Micro / Auto / Manual 三层遗忘。

type BlockType = 'user' | 'assistant' | 'tool_result'

interface ContextBlock {
  id: string
  type: BlockType
  label: string
  tokens: number
}

interface StepBlock {
  id: string
  type: BlockType
  label: string
  heightPx: number
  compressed?: boolean
}

interface StepState {
  blocks: StepBlock[]
  tokenCount: number
  fillPercent: number
  compressionLabel: string | null
}

interface CompressionLayer {
  label: string
  full: string
  trigger: string
  action: string
  step: number
  tone: 'amber' | 'blue' | 'emerald'
}

const BLOCK_LABELS: Record<BlockType, string> = {
  user: 'USR',
  assistant: 'AST',
  tool_result: 'TRL',
}

const MAX_TOKENS = 100000
const WINDOW_HEIGHT = 350

function generateBlocks(count: number, seed: number): ContextBlock[] {
  const types: BlockType[] = ['user', 'assistant', 'tool_result']
  const blocks: ContextBlock[] = []
  for (let i = 0; i < count; i++) {
    const typeIndex = (i + seed) % 3
    const type = types[typeIndex]!
    const tokens = type === 'tool_result' ? 4000 + (i % 3) * 1000 : 1500 + (i % 4) * 500
    blocks.push({
      id: `b-${seed}-${i}`,
      type,
      label: `${BLOCK_LABELS[type]} ${i + 1}`,
      tokens,
    })
  }
  return blocks
}

function computeStepState(step: number): StepState {
  switch (step) {
    case 0: {
      const raw = generateBlocks(8, 0)
      const tokenCount = 30000
      const totalRawTokens = raw.reduce((a, b) => a + b.tokens, 0)
      const blocks = raw.map((b) => ({
        ...b,
        heightPx: Math.max(16, (b.tokens / totalRawTokens) * WINDOW_HEIGHT * 0.3),
      }))
      return { blocks, tokenCount, fillPercent: 30, compressionLabel: null }
    }
    case 1: {
      const raw = generateBlocks(16, 0)
      const tokenCount = 60000
      const totalRawTokens = raw.reduce((a, b) => a + b.tokens, 0)
      const blocks = raw.map((b) => ({
        ...b,
        heightPx: Math.max(12, (b.tokens / totalRawTokens) * WINDOW_HEIGHT * 0.6),
      }))
      return { blocks, tokenCount, fillPercent: 60, compressionLabel: null }
    }
    case 2: {
      const raw = generateBlocks(20, 0)
      const tokenCount = 80000
      const totalRawTokens = raw.reduce((a, b) => a + b.tokens, 0)
      const blocks = raw.map((b) => ({
        ...b,
        heightPx: Math.max(10, (b.tokens / totalRawTokens) * WINDOW_HEIGHT * 0.8),
      }))
      return { blocks, tokenCount, fillPercent: 80, compressionLabel: null }
    }
    case 3: {
      const raw = generateBlocks(20, 0)
      const tokenCount = 60000
      const totalRawTokens = raw.reduce((a, b) => a + b.tokens, 0)
      const blocks = raw.map((b) => ({
        ...b,
        heightPx:
          b.type === 'tool_result'
            ? 6
            : Math.max(12, (b.tokens / totalRawTokens) * WINDOW_HEIGHT * 0.6),
        compressed: b.type === 'tool_result',
      }))
      return {
        blocks,
        tokenCount,
        fillPercent: 60,
        compressionLabel: 'MICRO-COMPACT',
      }
    }
    case 4: {
      const raw = generateBlocks(24, 1)
      const tokenCount = 85000
      const totalRawTokens = raw.reduce((a, b) => a + b.tokens, 0)
      const blocks = raw.map((b) => ({
        ...b,
        heightPx: Math.max(10, (b.tokens / totalRawTokens) * WINDOW_HEIGHT * 0.85),
      }))
      return { blocks, tokenCount, fillPercent: 85, compressionLabel: null }
    }
    case 5: {
      const tokenCount = 25000
      const summaryBlock: StepBlock = {
        id: 'auto-summary',
        type: 'assistant',
        label: 'SUMMARY',
        heightPx: 40,
        compressed: false,
      }
      const recentBlocks = generateBlocks(4, 2).map((b) => ({
        ...b,
        heightPx: 20,
      }))
      return {
        blocks: [summaryBlock, ...recentBlocks],
        tokenCount,
        fillPercent: 25,
        compressionLabel: 'AUTO-COMPACT',
      }
    }
    case 6: {
      const tokenCount = 8000
      const compactBlock: StepBlock = {
        id: 'compact-summary',
        type: 'assistant',
        label: 'COMPACT SUMMARY',
        heightPx: 24,
        compressed: false,
      }
      return {
        blocks: [compactBlock],
        tokenCount,
        fillPercent: 8,
        compressionLabel: '/compact',
      }
    }
    default:
      return { blocks: [], tokenCount: 0, fillPercent: 0, compressionLabel: null }
  }
}

const STEPS = [
  {
    title: 'Growing Context',
    description:
      'The context window holds the conversation. Each API call adds more messages.',
  },
  {
    title: 'Context Growing',
    description:
      'As the agent works, messages accumulate. The context window fills up.',
  },
  {
    title: 'Approaching Limit',
    description:
      'Old tool_results are the biggest consumers. Micro-compact targets these first.',
  },
  {
    title: 'Stage 1: Micro-Compact',
    description:
      'Replace old tool_results with short summaries. Automatic, transparent to the model.',
  },
  {
    title: 'Still Growing',
    description:
      'Work continues. Context grows again toward the threshold...',
  },
  {
    title: 'Stage 2: Auto-Compact',
    description:
      'Entire conversation summarized into a compact block. Triggered at token threshold.',
  },
  {
    title: 'Stage 3: /compact',
    description:
      'User-triggered, most aggressive. Three layers of strategic forgetting enable infinite sessions.',
  },
]

const COMPRESSION_LAYERS: CompressionLayer[] = [
  {
    label: 'Micro',
    full: 'MICRO-COMPACT',
    trigger: 'old tool_result',
    action: 'shrink bulky outputs',
    step: 3,
    tone: 'amber',
  },
  {
    label: 'Auto',
    full: 'AUTO-COMPACT',
    trigger: 'token threshold',
    action: 'summarize the conversation',
    step: 5,
    tone: 'blue',
  },
  {
    label: 'Manual',
    full: '/compact',
    trigger: 'user command',
    action: 'keep one compact summary',
    step: 6,
    tone: 'emerald',
  },
]

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2500,
})

const state = computed(() => computeStepState(currentStep.value))
const stepInfo = computed(() => STEPS[currentStep.value]!)

const tokenDisplay = computed(() => `${(state.value.tokenCount / 1000).toFixed(0)}K`)

const fillColor = computed<'red' | 'amber' | 'emerald'>(() => {
  const p = state.value.fillPercent
  if (p > 75) return 'red'
  if (p > 45) return 'amber'
  return 'emerald'
})

const stageTone = computed<'amber' | 'blue' | 'emerald'>(() => {
  if (currentStep.value === 3) return 'amber'
  if (currentStep.value === 5) return 'blue'
  return 'emerald'
})

const stageDescription = computed(() => {
  const s = currentStep.value
  if (s === 3) return 'Old tool_results shrunk to tiny summaries'
  if (s === 5) return 'Full conversation compressed to summary block'
  if (s === 6) return 'Most aggressive compression -- near-empty context'
  return ''
})

function isLayerReached(layer: CompressionLayer): boolean {
  return currentStep.value >= layer.step
}

function layerCardClass(layer: CompressionLayer): string {
  return [
    'cc-viz__layer',
    isLayerReached(layer) ? `cc-viz__layer--${layer.tone}` : 'cc-viz__layer--waiting',
    state.value.compressionLabel === layer.full ? 'cc-viz__layer--active' : '',
  ]
    .join(' ')
    .trim()
}
</script>

<template>
  <section class="cc-viz cc-viz--compact">
    <div class="cc-viz__panel cc-viz__compact-panel">
      <div class="cc-viz__compact-grid">
        <!-- Token Window (tall vertical bar on the left) -->
        <div class="cc-viz__window-col">
          <div class="cc-viz__window-head">Context Window</div>
          <div
            class="cc-viz__window"
            :style="{ height: WINDOW_HEIGHT + 'px' }"
          >
            <div class="cc-viz__blocks">
              <div
                v-for="block in state.blocks"
                :key="block.id"
                class="cc-viz__block"
                :class="[`cc-viz__block--${block.type}`, { 'cc-viz__block--compressed': block.compressed }]"
                :style="{ height: block.heightPx + 'px' }"
              >
                <span v-if="block.heightPx >= 14" class="cc-viz__block-label">{{ block.label }}</span>
              </div>
            </div>
            <div class="cc-viz__fill-line" :style="{ bottom: state.fillPercent + '%' }">
              <span class="cc-viz__fill-label">{{ state.fillPercent }}%</span>
            </div>
          </div>
          <div :key="state.tokenCount" class="cc-viz__token-count">{{ tokenDisplay }}</div>
          <div class="cc-viz__token-denom">/ 100K</div>
        </div>

        <!-- Right side: state display and compression stage -->
        <div class="cc-viz__detail">
          <!-- Top: horizontal token bar -->
          <div>
            <div class="cc-viz__usage-head">
              <span class="cc-viz__usage-label">Token usage</span>
              <span class="cc-viz__usage-num">
                {{ state.tokenCount.toLocaleString() }} / {{ MAX_TOKENS.toLocaleString() }}
              </span>
            </div>
            <div class="cc-viz__usage-track">
              <div
                class="cc-viz__usage-fill"
                :class="`cc-viz__usage-fill--${fillColor}`"
                :style="{ width: state.fillPercent + '%' }"
              />
            </div>
          </div>

          <!-- Message type legend -->
          <div class="cc-viz__legend">
            <div class="cc-viz__legend-item">
              <span class="cc-viz__swatch cc-viz__swatch--user" />
              <span class="cc-viz__legend-text">user</span>
            </div>
            <div class="cc-viz__legend-item">
              <span class="cc-viz__swatch cc-viz__swatch--ast" />
              <span class="cc-viz__legend-text">assistant</span>
            </div>
            <div class="cc-viz__legend-item">
              <span class="cc-viz__swatch cc-viz__swatch--tool" />
              <span class="cc-viz__legend-text">tool_result</span>
            </div>
          </div>

          <!-- Compression layer cards -->
          <div class="cc-viz__layers">
            <div
              v-for="layer in COMPRESSION_LAYERS"
              :key="layer.full"
              :class="layerCardClass(layer)"
            >
              <div class="cc-viz__layer-head">
                <span class="cc-viz__layer-name">{{ layer.label }}</span>
                <span class="cc-viz__layer-badge">{{ isLayerReached(layer) ? 'used' : 'waiting' }}</span>
              </div>
              <div class="cc-viz__layer-body">
                <div class="cc-viz__layer-trigger">{{ layer.trigger }}</div>
                <div class="cc-viz__layer-action">{{ layer.action }}</div>
              </div>
            </div>
          </div>

          <!-- Highlight old tool_results at step 2 -->
          <div v-if="currentStep === 2" class="cc-viz__callout">
            <div class="cc-viz__callout-title">tool_results are the largest blocks</div>
            <div class="cc-viz__callout-desc">
              File contents, command outputs, search results -- each one is thousands of tokens.
            </div>
          </div>

          <!-- Compression stage label -->
          <div
            v-if="state.compressionLabel"
            class="cc-viz__stage"
            :class="`cc-viz__stage--${stageTone}`"
          >
            <div class="cc-viz__stage-title">{{ state.compressionLabel }}</div>
            <div class="cc-viz__stage-desc">{{ stageDescription }}</div>
          </div>

          <!-- Three stages overview on final step -->
          <div v-if="currentStep === 6" class="cc-viz__summary">
            <div
              v-for="(layer, index) in COMPRESSION_LAYERS"
              :key="`summary-${layer.full}`"
              class="cc-viz__summary-row"
              :class="`cc-viz__layer--${layer.tone}`"
            >
              <span class="cc-viz__summary-main">
                Stage {{ index + 1 }}: {{ layer.label }} -- {{ layer.action }}
              </span>
              <span class="cc-viz__summary-trigger">{{ layer.trigger }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="STEPS.length"
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
.cc-viz__compact-panel {
  padding: 16px;
  min-height: 500px;
}

.cc-viz__compact-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: 1fr;
}

.cc-viz__window-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.cc-viz__detail {
  min-width: 0;
}

.cc-viz__window-head {
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.cc-viz__window {
  position: relative;
  width: 80px;
  max-width: 100%;
  overflow: hidden;
  border: 2px solid var(--cc-node-stroke);
  border-radius: 12px;
  background: var(--cc-bg-subtle);
}

.cc-viz__blocks {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column-reverse;
  gap: 1px;
  padding: 4px;
}

.cc-viz__block {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  transform-origin: bottom;
  transition: height 0.4s ease, opacity 0.4s ease;
  animation: cc-viz-block-in 0.4s ease both;
}

.cc-viz__block--user {
  background: #3b82f6;
}

.cc-viz__block--assistant {
  background: #71717a;
}

.cc-viz__block--tool {
  background: #10b981;
}

.cc-viz__block--compressed {
  background: #6ee7b7;
}

.cc-viz__block-label {
  overflow: hidden;
  padding: 0 4px;
  font-size: 8px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@keyframes cc-viz-block-in {
  from {
    opacity: 0;
    transform: scaleY(0.2);
  }
  to {
    opacity: 1;
    transform: scaleY(1);
  }
}

.cc-viz__fill-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 2px dashed #ef4444;
  transition: bottom 0.5s ease;
}

.cc-viz__fill-label {
  position: absolute;
  top: -16px;
  right: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: #ef4444;
}

.cc-viz__token-count {
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  animation: cc-viz-pop 0.4s ease;
}

.cc-viz__token-denom {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

@keyframes cc-viz-pop {
  from {
    transform: scale(0.85);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.cc-viz__usage-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.cc-viz__usage-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-viz__usage-num {
  overflow-wrap: break-word;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-viz__usage-track {
  height: 12px;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--cc-node-fill);
}

.cc-viz__usage-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.5s ease;
}

.cc-viz__usage-fill--red {
  background: #ef4444;
}

.cc-viz__usage-fill--amber {
  background: #f59e0b;
}

.cc-viz__usage-fill--emerald {
  background: #10b981;
}

.cc-viz__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.cc-viz__legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.cc-viz__swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.cc-viz__swatch--user {
  background: #3b82f6;
}

.cc-viz__swatch--ast {
  background: #71717a;
}

.cc-viz__swatch--tool {
  background: #10b981;
}

.cc-viz__legend-text {
  font-size: 10px;
  color: var(--color-text-muted);
}

.cc-viz__layers {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}

.cc-viz__layer {
  min-width: 0;
  border-width: 1px;
  border-style: solid;
  border-radius: var(--radius-md);
  padding: 12px;
  transition: background 0.3s, border-color 0.3s, color 0.3s, transform 0.3s;
}

.cc-viz__layer--waiting {
  border-color: var(--cc-node-stroke);
  background: var(--cc-node-fill);
  color: var(--cc-label);
}

.cc-viz__layer--amber {
  border-color: #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.cc-viz__layer--blue {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1e40af;
}

.cc-viz__layer--emerald {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #065f46;
}

[data-theme='dark'] .cc-viz__layer--amber {
  border-color: #78350f;
  background: rgba(120, 53, 15, 0.3);
  color: #fde68a;
}

[data-theme='dark'] .cc-viz__layer--blue {
  border-color: #1e3a8a;
  background: rgba(30, 58, 138, 0.3);
  color: #bfdbfe;
}

[data-theme='dark'] .cc-viz__layer--emerald {
  border-color: #064e3b;
  background: rgba(6, 78, 59, 0.3);
  color: #a7f3d0;
}

.cc-viz__layer--active {
  animation: cc-viz-bob 0.8s ease infinite;
}

.cc-viz__layer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cc-viz__layer-name {
  font-size: 14px;
  font-weight: 600;
}

.cc-viz__layer-badge {
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  background: rgba(255, 255, 255, 0.7);
}

[data-theme='dark'] .cc-viz__layer-badge {
  background: rgba(24, 24, 27, 0.6);
}

.cc-viz__layer-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  line-height: 1.3;
}

.cc-viz__layer-trigger {
  overflow-wrap: break-word;
  font-family: var(--font-mono);
}

.cc-viz__layer-action {
  overflow-wrap: break-word;
  opacity: 0.8;
}

@keyframes cc-viz-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

.cc-viz__callout {
  margin-top: 12px;
  border: 1px solid #fcd34d;
  border-radius: var(--radius-md);
  padding: 8px 12px;
  background: #fffbeb;
  animation: cc-viz-fadein 0.4s ease;
}

[data-theme='dark'] .cc-viz__callout {
  border-color: #b45309;
  background: rgba(120, 53, 15, 0.2);
}

.cc-viz__callout-title {
  font-size: 12px;
  font-weight: 600;
  color: #b45309;
}

[data-theme='dark'] .cc-viz__callout-title {
  color: #fcd34d;
}

.cc-viz__callout-desc {
  font-size: 11px;
  line-height: 1.3;
  color: #d97706;
}

[data-theme='dark'] .cc-viz__callout-desc {
  color: #fbbf24;
}

.cc-viz__stage {
  margin-top: 16px;
  border-width: 2px;
  border-style: solid;
  border-radius: var(--radius-md);
  padding: 16px;
  text-align: center;
  animation: cc-viz-fadein 0.4s ease;
}

.cc-viz__stage--amber {
  border-color: #fbbf24;
  background: #fffbeb;
}

.cc-viz__stage--blue {
  border-color: #60a5fa;
  background: #eff6ff;
}

.cc-viz__stage--emerald {
  border-color: #34d399;
  background: #ecfdf5;
}

[data-theme='dark'] .cc-viz__stage--amber {
  border-color: #d97706;
  background: rgba(120, 53, 15, 0.2);
}

[data-theme='dark'] .cc-viz__stage--blue {
  border-color: #2563eb;
  background: rgba(30, 58, 138, 0.2);
}

[data-theme='dark'] .cc-viz__stage--emerald {
  border-color: #059669;
  background: rgba(6, 78, 59, 0.2);
}

.cc-viz__stage-title {
  font-size: 18px;
  font-weight: 900;
}

.cc-viz__stage--amber .cc-viz__stage-title {
  color: #d97706;
}

.cc-viz__stage--blue .cc-viz__stage-title {
  color: #2563eb;
}

.cc-viz__stage--emerald .cc-viz__stage-title {
  color: #059669;
}

[data-theme='dark'] .cc-viz__stage--amber .cc-viz__stage-title {
  color: #fcd34d;
}

[data-theme='dark'] .cc-viz__stage--blue .cc-viz__stage-title {
  color: #93c5fd;
}

[data-theme='dark'] .cc-viz__stage--emerald .cc-viz__stage-title {
  color: #6ee7b7;
}

.cc-viz__stage-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.3;
}

.cc-viz__stage--amber .cc-viz__stage-desc {
  color: #f59e0b;
}

.cc-viz__stage--blue .cc-viz__stage-desc {
  color: #3b82f6;
}

.cc-viz__stage--emerald .cc-viz__stage-desc {
  color: #10b981;
}

[data-theme='dark'] .cc-viz__stage--amber .cc-viz__stage-desc {
  color: #fbbf24;
}

[data-theme='dark'] .cc-viz__stage--blue .cc-viz__stage-desc {
  color: #60a5fa;
}

[data-theme='dark'] .cc-viz__stage--emerald .cc-viz__stage-desc {
  color: #34d399;
}

.cc-viz__summary {
  margin-top: 16px;
  display: grid;
  gap: 8px;
  animation: cc-viz-fadein 0.4s ease 0.4s both;
}

.cc-viz__summary-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-width: 1px;
  border-style: solid;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}

.cc-viz__summary-main {
  overflow-wrap: break-word;
  font-size: 12px;
}

.cc-viz__summary-trigger {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.8;
}

@keyframes cc-viz-fadein {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 640px) {
  .cc-viz__window {
    width: 96px;
  }

  .cc-viz__usage-head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .cc-viz__layers {
    grid-template-columns: repeat(3, 1fr);
  }

  .cc-viz__summary-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

@media (min-width: 1024px) {
  .cc-viz__compact-grid {
    grid-template-columns: 140px 1fr;
  }
}
</style>
