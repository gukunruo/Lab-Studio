<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, TextMessage } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  containerEl: HTMLElement | null
}>()

// 布局常量对齐 Paseo 网页版实测：每格 8px、条宽 10px/18px、左侧缩进 4px、轨道宽 36px。
const RAIL_WIDTH = 36
const BAR_LEFT = 4
const TICK = 8
const MIN_SPACING = 3
const BASE_LEN = 10
const BASE_H = 2
const ACTIVE_LEN = 18
const PAD_V = 12
// hover 波峰：到焦点条的距离 → 宽度/高度增量。对齐 Paseo 实测 26×4 / 22×3.5 / 14×2.5 / 10×2。
const WAVE_W = [16, 12, 4, 0]
const WAVE_H = [2, 1.5, 0.5, 0]
const WAVE_RANGE = WAVE_W.length - 1

interface RoundInfo {
  startIndex: number
  // 本轮用户消息在滚动内容里的顶边坐标，用于「到达视口顶端即激活」的判定。
  topWithin: number
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
      topWithin: 0,
      userContent: content || (kind === 'image' ? '（图片）' : '（无内容）'),
      kind,
    })
  })
  return roundsArr
}

// 每格固定 8px，整组竖向居中；轮次超出可用高度时压缩间距（下限 MIN_SPACING），
// 始终保持全部轮次可见，对齐 Paseo 的 flex-shrink 行为。
function layout() {
  const railH = railRef.value?.clientHeight ?? 0
  const avail = Math.max(railH - 2 * PAD_V, 0)
  const n = rounds.value.length
  if (n === 0) {
    barsOffset.value = 0
    rowPx.value = TICK
    return
  }
  rowPx.value = Math.max(Math.min(TICK, avail / n), MIN_SPACING)
  barsOffset.value = (avail - n * rowPx.value) / 2
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
  } else {
    // 阅读线设在视口顶端：长条在「下一轮用户消息顶边到达视口顶端」的瞬间切换，
    // 与顶端内容严格同步。对齐 Paseo 实测（切换时新轮次顶边距视口顶仅 5~7px）。
    const line = container.scrollTop
    let best = 0
    rounds.value.forEach((r, i) => {
      if (r.topWithin <= line) best = i
    })
    activeIndex.value = best
  }
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
      r.topWithin = rect.top - containerRect.top + container.scrollTop
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

function tickStyle(i: number) {
  const top = barsOffset.value + i * rowPx.value
  return { top: `${top}px`, height: `${rowPx.value}px` }
}

function barStyle(i: number) {
  return { left: `${BAR_LEFT}px`, width: `${barWidth(i)}px`, height: `${barHeight(i)}px` }
}

// hover 波峰：焦点条最长最高，左右邻居按距离递减弱。整条药丸随距离同步缩放宽高。
function barWidth(i: number) {
  let w = i === activeIndex.value ? Math.max(BASE_LEN, ACTIVE_LEN) : BASE_LEN
  const hi = hoverIndex.value
  if (hi >= 0) {
    const d = Math.abs(i - hi)
    if (d <= WAVE_RANGE) w = Math.max(w, BASE_LEN + (WAVE_W[d] ?? 0))
  }
  return w
}

function barHeight(i: number) {
  let h = BASE_H
  const hi = hoverIndex.value
  if (hi >= 0) {
    const d = Math.abs(i - hi)
    if (d <= WAVE_RANGE) h = Math.max(h, BASE_H + (WAVE_H[d] ?? 0))
  }
  return h
}

function tickClass(i: number) {
  return {
    'progress-rail__tick--active': i === activeIndex.value,
    'progress-rail__tick--focused': i === hoverIndex.value,
  }
}

function onBarEnter(i: number) {
  hoverIndex.value = i
  const rail = railRef.value
  const tick = barsRef.value?.querySelector<HTMLElement>(`[data-bar-index="${i}"]`)
  const bar = tick?.querySelector<HTMLElement>('.progress-rail__bar')
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
      :style="{ top: `${PAD_V}px`, bottom: `${PAD_V}px` }"
    >
      <button
        v-for="(round, i) in rounds"
        :key="round.startIndex"
        :data-bar-index="i"
        :data-testid="`chat-outline-tick-${round.startIndex}`"
        class="progress-rail__tick"
        :class="tickClass(i)"
        :style="tickStyle(i)"
        type="button"
        role="tab"
        :aria-selected="i === activeIndex"
        :aria-label="`${i + 1} of ${rounds.length}: ${round.userContent}`"
        @click="scrollToRound(round)"
        @mouseenter="onBarEnter(i)"
        @mouseleave="onBarLeave"
      >
        <span class="progress-rail__bar" :style="barStyle(i)"></span>
      </button>
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

// 整格 36px 宽作为点击/悬浮命中区，格内用 flex 把长条垂直居中、左侧缩进 4px（对齐 Paseo）。
.progress-rail__tick {
  position: absolute;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 0 0 0 4px;
  border: 0;
  background: transparent;
  cursor: pointer;
  box-sizing: border-box;
}

.progress-rail__bar {
  flex-shrink: 0;
  border-radius: 9999px;
  background: var(--color-border-strong);
  transition:
    width 140ms ease-out,
    height 140ms ease-out,
    background 140ms ease-out;
}

.progress-rail__tick--active .progress-rail__bar {
  background: var(--color-text-muted);
}

// 焦点条（鼠标悬浮命中）用最强前景色（暗色主题近白 / 亮色主题近黑），最高优先级。
.progress-rail__tick--focused .progress-rail__bar {
  background: var(--color-text);
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
