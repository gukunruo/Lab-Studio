<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, TextMessage } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  containerEl: HTMLElement | null
}>()

const RAIL_WIDTH = 26
const PAD = 12
const TICK_SPACING = 9
const DASH_HEIGHT = 3

interface RoundInfo {
  startIndex: number
  midWithin: number
  userContent: string
  kind: 'text' | 'image'
}

interface Tick {
  topPx: number
}

const railRef = ref<HTMLElement | null>(null)
const ticks = ref<Tick[]>([])
const rounds = ref<RoundInfo[]>([])
const scrollH = ref(1)
const clientH = ref(0)
const activeTick = ref(-1)
const hoverTick = ref(-1)

let containerRO: ResizeObserver | null = null
let railRO: ResizeObserver | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const MIN_ROUNDS = 1
const scrollable = computed(
  () => rounds.value.length >= MIN_ROUNDS && scrollH.value > clientH.value + 1,
)

function userPrompt(msg: ChatMessage): { content: string; kind: 'text' | 'image' } {
  if (msg.type === 'image-request') return { content: (msg.prompt || '').trim(), kind: 'image' }
  if (msg.type === 'gemini-multimodal-user') return { content: (msg.content || '').trim(), kind: 'text' }
  return { content: ((msg as TextMessage).content || '').trim(), kind: 'text' }
}

function buildRounds(msgs: ChatMessage[]): RoundInfo[] {
  const roundsArr: RoundInfo[] = []
  msgs.forEach((msg, i) => {
    if (msg.role !== 'user') return
    const { content, kind } = userPrompt(msg)
    roundsArr.push({
      startIndex: i,
      midWithin: 0,
      userContent: content || (kind === 'image' ? '（图片）' : '（无内容）'),
      kind,
    })
  })
  return roundsArr
}

function buildTicks() {
  const railH = railRef.value?.clientHeight ?? 0
  const roomH = Math.max(railH - PAD * 2, 0)
  const count = Math.max(2, Math.floor(roomH / TICK_SPACING) + 1)
  const next: Tick[] = []
  for (let i = 0; i < count; i++) {
    next.push({ topPx: PAD + i * TICK_SPACING })
  }
  ticks.value = next
}

function maxScroll(): number {
  const container = props.containerEl
  if (!container) return 0
  return Math.max(0, container.scrollHeight - container.clientHeight)
}

function roundForScroll(scrollTop: number): { round: RoundInfo; index: number } | null {
  if (!rounds.value.length) return null
  let best = 0
  let bestDist = Infinity
  rounds.value.forEach((r, i) => {
    const d = Math.abs(r.midWithin - scrollTop)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  const round = rounds.value[best]
  if (!round) return null
  return { round, index: best }
}

function roundIndexForTick(i: number): number | null {
  const found = roundForScroll((i / (ticks.value.length - 1)) * maxScroll())
  return found ? found.index : null
}

function sync() {
  const container = props.containerEl
  const ticksLen = ticks.value.length
  if (!container || !ticksLen) {
    activeTick.value = -1
    return
  }
  scrollH.value = Math.max(1, container.scrollHeight)
  clientH.value = Math.max(0, container.clientHeight || 0)
  const range = maxScroll()
  if (range <= 0) {
    activeTick.value = 0
    return
  }
  const frac = Math.max(0, Math.min(1, container.scrollTop / range))
  activeTick.value = Math.round(frac * (ticksLen - 1))
}

async function measure() {
  await nextTick()
  const container = props.containerEl
  if (!container) return
  const built = buildRounds(props.messages)
  const containerRect = container.getBoundingClientRect()
  for (const r of built) {
    const el = container.querySelector<HTMLElement>(`[data-message-index="${r.startIndex}"]`)
    if (el) {
      const rect = el.getBoundingClientRect()
      r.midWithin = rect.top - containerRect.top + container.scrollTop + rect.height / 2
    }
  }
  rounds.value = built
  scrollH.value = Math.max(1, container.scrollHeight)
  clientH.value = Math.max(0, container.clientHeight || 0)
  buildTicks()
  sync()
}

function onContainerScroll() {
  sync()
}

function onResize() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    buildTicks()
    sync()
  }, 60)
}

function scrollToTick(i: number) {
  const container = props.containerEl
  if (!container || ticks.value.length < 2) return
  const frac = i / (ticks.value.length - 1)
  container.scrollTop = frac * maxScroll()
  hoverTick.value = -1
}

const hoveredTick = computed(() => (hoverTick.value >= 0 ? ticks.value[hoverTick.value] ?? null : null))

const hoverInfo = computed(() => {
  const tick = hoveredTick.value
  if (!tick || ticks.value.length < 2) return null
  const frac = hoverTick.value / (ticks.value.length - 1)
  return roundForScroll(frac * maxScroll())
})

const tooltipStyle = computed(() => {
  const tick = hoveredTick.value
  if (!tick) return {}
  const railH = railRef.value?.clientHeight ?? 0
  const clamped = Math.max(0, Math.min(tick.topPx, Math.max(0, railH - 44)))
  return { top: `${clamped}px` }
})

watch(
  () => props.messages,
  () => void measure(),
)

watch(
  () => props.containerEl,
  (el, old) => {
    if (old) {
      old.removeEventListener('scroll', onContainerScroll)
      containerRO?.disconnect()
    }
    if (el) {
      el.addEventListener('scroll', onContainerScroll, { passive: true })
      containerRO = new ResizeObserver(onResize)
      containerRO.observe(el)
    }
    void measure()
  },
  { immediate: true },
)

watch(railRef, (el) => {
  railRO?.disconnect()
  if (el) {
    railRO = new ResizeObserver(onResize)
    railRO.observe(el)
    buildTicks()
    sync()
  }
})

onBeforeUnmount(() => {
  const container = props.containerEl
  container?.removeEventListener('scroll', onContainerScroll)
  containerRO?.disconnect()
  railRO?.disconnect()
  if (scrollTimer) clearTimeout(scrollTimer)
})
</script>

<template>
  <aside
    v-if="scrollable"
    ref="railRef"
    class="progress-rail"
    :style="{ width: `${RAIL_WIDTH}px` }"
    aria-label="对话缩略进度"
  >
    <div class="progress-rail__track" />
    <button
      v-for="(tick, i) in ticks"
      :key="i"
      class="progress-rail__dash"
      :class="{
        'progress-rail__dash--active': i === activeTick,
        'progress-rail__dash--hovered': i === hoverTick,
      }"
      type="button"
      :style="{ top: `${tick.topPx}px` }"
      :title="roundIndexForTick(i) !== null ? `第 ${(roundIndexForTick(i) ?? 0) + 1} 轮` : '对话进度'"
      :aria-label="`滚动到进度 ${Math.round((i / (ticks.length - 1)) * 100)}%`"
      @click="scrollToTick(i)"
      @mouseenter="hoverTick = i"
      @mouseleave="hoverTick = -1"
    />

    <div
      v-if="hoverInfo"
      class="progress-rail__tooltip"
      :style="tooltipStyle"
      role="tooltip"
    >
      <div class="progress-rail__tooltip-header">
        <span class="progress-rail__tooltip-turn">第 {{ hoverInfo.index + 1 }} 轮</span>
        <span v-if="hoverInfo.round.kind === 'image'" class="progress-rail__tooltip-kind">图片</span>
      </div>
      <div class="progress-rail__tooltip-content">{{ hoverInfo.round.userContent }}</div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.progress-rail {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  overflow: visible;
  padding: 12px 0;
  box-sizing: border-box;
}

.progress-rail__track {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 50%;
  width: 16px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
}

.progress-rail__dash {
  position: absolute;
  left: 50%;
  width: 16px;
  height: 3px;
  transform: translate(-50%, -50%);
  border: 0;
  border-radius: 2px;
  background: var(--color-border-strong);
  cursor: pointer;
  padding: 0;
  opacity: 0.8;
  transition:
    height 0.15s,
    background 0.15s,
    opacity 0.15s,
    box-shadow 0.15s;
}

.progress-rail__dash:hover,
.progress-rail__dash--hovered {
  opacity: 1;
  background: var(--color-text-muted);
}

.progress-rail__dash--active {
  height: 7px;
  background: var(--color-accent);
  opacity: 1;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 20%, transparent);
}

.progress-rail__tooltip {
  position: absolute;
  left: 100%;
  top: 0;
  z-index: 40;
  width: min(240px, calc(100vw - 96px));
  padding: 8px 10px;
  margin-left: 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.progress-rail__tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.progress-rail__tooltip-turn {
  color: var(--color-accent-strong);
  font-size: 11px;
  font-weight: 600;
}

.progress-rail__tooltip-kind {
  color: var(--color-text-muted);
  font-size: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 1px 5px;
}

.progress-rail__tooltip-content {
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
