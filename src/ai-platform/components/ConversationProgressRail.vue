<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, TextMessage } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  containerEl: HTMLElement | null
}>()

// 布局常量对齐 Paseo 网页版实测值：每格 8px、条高 2px、条长 10px/18px、左侧缩进 4px、轨道宽 36px。
const RAIL_WIDTH = 36
const BAR_H = 2
const BAR_LEFT = 4
const TICK = 8
const MIN_TICK = 4
const BASE_LEN = 10
const ACTIVE_LEN = 18
const PAD_V = 12
// hover 波峰：到 hover 条的距离 → 额外长度。
const PEAK = [12, 6, 3]

interface RoundInfo {
  startIndex: number
  midWithin: number
  userContent: string
  kind: 'text' | 'image'
}

const railRef = ref<HTMLElement | null>(null)
const barsRef = ref<HTMLElement | null>(null)
const rounds = ref<RoundInfo[]>([])
const scrollH = ref(1)
const clientH = ref(0)
const activeIndex = ref(-1)
const hoverIndex = ref(-1)
const hoverBarTop = ref(0)
const groupScrollable = ref(false)
const barsOffset = ref(0)
const rowPx = ref(TICK)

let containerRO: ResizeObserver | null = null
let railRO: ResizeObserver | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const scrollable = computed(
  () => rounds.value.length >= 1 && scrollH.value > clientH.value + 1,
)

const hovered = computed(() => rounds.value[hoverIndex.value] ?? null)

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

// 每格固定 8px（Paseo 实测），整组竖向居中；轮次超出可用高度时压缩间距（下限 MIN_TICK），
// 压缩到极限仍放不下时退回内部滚动兜底，避免首尾条被裁切。
function layout() {
  const railH = railRef.value?.clientHeight ?? 0
  const avail = Math.max(railH - 2 * PAD_V, 0)
  const n = rounds.value.length
  if (n === 0) {
    groupScrollable.value = false
    barsOffset.value = 0
    rowPx.value = TICK
    return
  }
  const fitRow = avail / n
  const raw = Math.min(TICK, fitRow)
  if (raw >= MIN_TICK) {
    groupScrollable.value = false
    rowPx.value = raw
    const groupH = n * rowPx.value
    barsOffset.value = avail > 0 ? Math.max((avail - groupH) / 2, 0) : 0
    if (barsRef.value) barsRef.value.scrollTop = 0
  } else {
    groupScrollable.value = true
    rowPx.value = MIN_TICK
    barsOffset.value = 0
  }
}

function sync() {
  const container = props.containerEl
  if (!container || !rounds.value.length) {
    activeIndex.value = -1
    return
  }
  scrollH.value = Math.max(1, container.scrollHeight)
  clientH.value = Math.max(0, container.clientHeight || 0)
  const maxScroll = Math.max(0, scrollH.value - clientH.value)
  if (container.scrollTop >= maxScroll - 48) {
    activeIndex.value = rounds.value.length - 1
  } else if (container.scrollTop <= 48) {
    activeIndex.value = 0
  } else {
    const anchorY = container.scrollTop + clientH.value * 0.25
    let best = 0
    rounds.value.forEach((r, i) => {
      if (r.midWithin <= anchorY) best = i
    })
    activeIndex.value = best
  }
  ensureBarVisible(activeIndex.value)
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
  layout()
  sync()
}

function onContainerScroll() {
  sync()
}

function onResize() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    layout()
    sync()
  }, 60)
}

// 条在 bars（相对定位）内的纵向坐标。绝对定位 + 固定的 top 让条互不影响。
function barStyle(i: number) {
  const top = barsOffset.value + i * rowPx.value
  return { top: `${top}px`, left: `${BAR_LEFT}px`, width: `${barWidth(i)}px`, height: `${BAR_H}px` }
}

// hover 波峰：hover 条最长，左右邻居递减弱，其余保持基础长度；激活条至少为选中长度。
function barWidth(i: number) {
  const hi = hoverIndex.value
  let w = BASE_LEN
  if (hi >= 0) {
    const d = Math.abs(i - hi)
    w += PEAK[d] ?? 0
  }
  if (i === activeIndex.value) w = Math.max(w, ACTIVE_LEN)
  return w
}

function ensureBarVisible(i: number) {
  if (!groupScrollable.value || i < 0) return
  const bars = barsRef.value
  const bar = bars?.querySelector<HTMLElement>(`[data-bar-index="${i}"]`)
  if (!bars || !bar) return
  const target = bar.offsetTop - bars.clientHeight / 2 + bar.offsetHeight / 2
  bars.scrollTop = Math.max(0, Math.min(target, bars.scrollHeight - bars.clientHeight))
}

function onBarEnter(i: number) {
  hoverIndex.value = i
  ensureBarVisible(i)
  const rail = railRef.value
  const bar = barsRef.value?.querySelector<HTMLElement>(`[data-bar-index="${i}"]`)
  if (!rail || !bar) return
  const railRect = rail.getBoundingClientRect()
  const barRect = bar.getBoundingClientRect()
  hoverBarTop.value = barRect.top - railRect.top
}

function onBarLeave() {
  hoverIndex.value = -1
}

function scrollToRound(r: RoundInfo) {
  const container = props.containerEl
  if (!container) return
  const el = container.querySelector<HTMLElement>(`[data-message-index="${r.startIndex}"]`)
  if (!el) return
  const containerRect = container.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const topWithin = elRect.top - containerRect.top + container.scrollTop
  container.scrollTop = Math.max(0, topWithin - container.clientHeight * 0.2)
  hoverIndex.value = -1
}

const tooltipStyle = computed(() => {
  const railH = railRef.value?.clientHeight ?? 0
  const clamped = Math.max(0, Math.min(hoverBarTop.value, Math.max(0, railH - 48)))
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
    layout()
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
    role="tablist"
    aria-label="对话缩略进度"
  >
    <div
      ref="barsRef"
      class="progress-rail__bars"
      :class="{ 'progress-rail__bars--scrollable': groupScrollable }"
      :style="{ top: `${PAD_V}px`, bottom: `${PAD_V}px` }"
    >
      <button
        v-for="(round, i) in rounds"
        :key="round.startIndex"
        :data-bar-index="i"
        :data-testid="`chat-outline-tick-${round.startIndex}`"
        class="progress-rail__bar"
        :class="{
          'progress-rail__bar--active': i === activeIndex,
          'progress-rail__bar--hovered': i === hoverIndex,
        }"
        :style="barStyle(i)"
        type="button"
        role="tab"
        :aria-selected="i === activeIndex"
        :aria-label="`${i + 1} of ${rounds.length}: ${round.userContent}`"
        @click="scrollToRound(round)"
        @mouseenter="onBarEnter(i)"
        @mouseleave="onBarLeave"
      />
    </div>

    <div
      v-if="hovered"
      class="progress-rail__tooltip"
      :style="tooltipStyle"
      role="tooltip"
    >
      <div class="progress-rail__tooltip-header">
        <span class="progress-rail__tooltip-turn">第 {{ hoverIndex + 1 }} 轮</span>
        <span v-if="hovered.kind === 'image'" class="progress-rail__tooltip-kind">图片</span>
      </div>
      <div class="progress-rail__tooltip-content">{{ hovered.userContent }}</div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.progress-rail {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  overflow: visible;
  box-sizing: border-box;
}

.progress-rail__bars {
  position: absolute;
  left: 0;
  right: 0;
  overflow: visible;
  box-sizing: border-box;
}

.progress-rail__bars--scrollable {
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}

.progress-rail__bar {
  position: absolute;
  border: 0;
  padding: 0;
  border-radius: 9999px;
  background: var(--color-border-strong);
  cursor: pointer;
  opacity: 0.9;
  transition:
    width 0.12s,
    background 0.12s,
    opacity 0.12s;
}

.progress-rail__bar:hover,
.progress-rail__bar--hovered {
  opacity: 1;
  background: var(--color-text-muted);
}

.progress-rail__bar--active {
  opacity: 1;
  background: var(--color-text-muted);
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

.progress-rail__tooltip::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 12px;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 6px solid var(--color-border-strong);
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
