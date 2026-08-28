<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, TextMessage } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  containerEl: HTMLElement | null
}>()

const RAIL_WIDTH = 26
const PAD = 12

interface RoundInfo {
  startIndex: number
  midWithin: number
  topPx: number
  userContent: string
  kind: 'text' | 'image'
}

const railRef = ref<HTMLElement | null>(null)
const rounds = ref<RoundInfo[]>([])
const scrollH = ref(1)
const clientH = ref(0)
const activeIndex = ref(-1)
const hoverIndex = ref(-1)

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
      topPx: 0,
      userContent: content || (kind === 'image' ? '（图片）' : '（无内容）'),
      kind,
    })
  })
  return roundsArr
}

// One bar per round, evenly spaced across the rail and vertically centered.
function layoutBars() {
  const railH = railRef.value?.clientHeight ?? 0
  const usable = Math.max(railH - PAD * 2, 0)
  const n = Math.max(rounds.value.length, 1)
  const slot = usable / n
  rounds.value.forEach((r, i) => {
    // `top` 即长条中心：translateY(-50%) 已自行居中，无需再减半高。
    r.topPx = PAD + slot * (i + 0.5)
  })
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
    return
  }
  if (container.scrollTop <= 48) {
    activeIndex.value = 0
    return
  }
  const anchorY = container.scrollTop + clientH.value * 0.25
  let best = 0
  rounds.value.forEach((r, i) => {
    if (r.midWithin <= anchorY) best = i
  })
  activeIndex.value = best
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
  layoutBars()
  sync()
}

function onContainerScroll() {
  sync()
}

function onResize() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    layoutBars()
    sync()
  }, 60)
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

const hovered = computed(() => rounds.value[hoverIndex.value] ?? null)

const tooltipStyle = computed(() => {
  const r = hovered.value
  if (!r) return {}
  const railH = railRef.value?.clientHeight ?? 0
  const clamped = Math.max(0, Math.min(r.topPx, Math.max(0, railH - 44)))
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
    layoutBars()
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
      v-for="(round, i) in rounds"
      :key="round.startIndex"
      class="progress-rail__bar"
      :class="{
        'progress-rail__bar--active': i === activeIndex,
        'progress-rail__bar--hovered': i === hoverIndex,
      }"
      type="button"
      :style="{ top: `${round.topPx}px` }"
      :title="`第 ${i + 1} 轮`"
      :aria-label="`跳转到第 ${i + 1} 轮`"
      @click="scrollToRound(round)"
      @mouseenter="hoverIndex = i"
      @mouseleave="hoverIndex = -1"
    />

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

.progress-rail__bar {
  position: absolute;
  left: 50%;
  width: 16px;
  height: 6px;
  transform: translate(-50%, -50%);
  border: 0;
  border-radius: 3px;
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

.progress-rail__bar:hover,
.progress-rail__bar--hovered {
  opacity: 1;
  background: var(--color-text-muted);
}

.progress-rail__bar--active {
  height: 8px;
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
