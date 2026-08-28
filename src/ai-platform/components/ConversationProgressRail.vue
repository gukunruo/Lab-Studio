<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatMessage, TextMessage } from '../types'

const props = defineProps<{
  messages: ChatMessage[]
  containerEl: HTMLElement | null
}>()

const RAIL_WIDTH = 20
const MARKER_HEIGHT = 6

interface TurnMarker {
  startIndex: number
  topWithin: number
  topPx: number
  userContent: string
  kind: 'text' | 'image'
}

const railRef = ref<HTMLElement | null>(null)
const markers = ref<TurnMarker[]>([])
const scrollH = ref(1)
const clientH = ref(0)
const activeIndex = ref(-1)
const hoverIndex = ref(-1)

let containerRO: ResizeObserver | null = null
let railRO: ResizeObserver | null = null
let scrollTimer: ReturnType<typeof setTimeout> | null = null

const MIN_TURNS = 1
const scrollable = computed(
  () => markers.value.length >= MIN_TURNS && scrollH.value > clientH.value + 1,
)

function userPrompt(msg: ChatMessage): { content: string; kind: 'text' | 'image' } {
  if (msg.type === 'image-request') return { content: (msg.prompt || '').trim(), kind: 'image' }
  if (msg.type === 'gemini-multimodal-user') return { content: (msg.content || '').trim(), kind: 'text' }
  return { content: ((msg as TextMessage).content || '').trim(), kind: 'text' }
}

function buildTurns(msgs: ChatMessage[]): TurnMarker[] {
  const turns: TurnMarker[] = []
  msgs.forEach((msg, i) => {
    if (msg.role !== 'user') return
    const { content, kind } = userPrompt(msg)
    turns.push({
      startIndex: i,
      topWithin: 0,
      topPx: 0,
      userContent: content || (kind === 'image' ? '（图片）' : '（无内容）'),
      kind,
    })
  })
  return turns
}

function sync() {
  const container = props.containerEl
  const railH = railRef.value?.clientHeight ?? 0
  const usable = Math.max(railH - MARKER_HEIGHT, 1)
  const sh = container ? Math.max(1, container.scrollHeight) : 1
  const ch = container?.clientHeight ?? 0
  scrollH.value = sh
  clientH.value = ch
  for (const m of markers.value) {
    m.topPx = Math.max(0, Math.min(1, m.topWithin / sh)) * usable
  }
  if (!container || !markers.value.length) {
    activeIndex.value = -1
    return
  }
  // Between the extremes, highlight the round whose content sits around the top
  // quarter of the viewport; clamp the top/bottom so round 1 lights up at the
  // very top and the last round lights up at the very bottom.
  const maxScroll = Math.max(0, sh - ch)
  if (container.scrollTop >= maxScroll - 48) {
    activeIndex.value = markers.value.length - 1
    return
  }
  if (container.scrollTop <= 48) {
    activeIndex.value = 0
    return
  }
  const anchorY = container.scrollTop + ch * 0.25
  let best = 0
  markers.value.forEach((m, i) => {
    if (m.topWithin <= anchorY) best = i
  })
  activeIndex.value = best
}

async function measure() {
  await nextTick()
  const container = props.containerEl
  if (!container) return
  const built = buildTurns(props.messages)
  const containerRect = container.getBoundingClientRect()
  for (const t of built) {
    const el = container.querySelector<HTMLElement>(`[data-message-index="${t.startIndex}"]`)
    t.topWithin = el
      ? el.getBoundingClientRect().top - containerRect.top + container.scrollTop
      : 0
  }
  markers.value = built
  sync()
}

function onContainerScroll() {
  sync()
}

function onResize() {
  if (scrollTimer) clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    sync()
  }, 60)
}

function scrollToTurn(turn: TurnMarker) {
  const container = props.containerEl
  if (!container) return
  const el = container.querySelector<HTMLElement>(`[data-message-index="${turn.startIndex}"]`)
  if (!el) return
  const containerRect = container.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const topWithin = elRect.top - containerRect.top + container.scrollTop
  container.scrollTop = Math.max(0, topWithin - container.clientHeight * 0.2)
  hoverIndex.value = -1
}

const tooltipStyle = computed(() => {
  const m = markers.value[hoverIndex.value]
  if (!m) return {}
  const railH = railRef.value?.clientHeight ?? 0
  const clamped = Math.max(0, Math.min(m.topPx, Math.max(0, railH - 44)))
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

// The rail is v-if'd on `scrollable`, which only becomes true mid-measure, so it
// mounts after markers are first positioned. Re-sync once it has a real height.
watch(railRef, (el) => {
  railRO?.disconnect()
  if (el) {
    railRO = new ResizeObserver(onResize)
    railRO.observe(el)
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
    <button
      v-for="(turn, i) in markers"
      :key="turn.startIndex"
      class="progress-rail__marker"
      :class="{
        'progress-rail__marker--active': i === activeIndex,
        'progress-rail__marker--hovered': i === hoverIndex,
      }"
      type="button"
      :style="{ top: `${turn.topPx}px` }"
      :title="`第 ${i + 1} 轮`"
      :aria-label="`跳转到第 ${i + 1} 轮`"
      @click="scrollToTurn(turn)"
      @mouseenter="hoverIndex = i"
      @mouseleave="hoverIndex = -1"
    />

    <div
      v-if="hoverIndex >= 0 && markers[hoverIndex]"
      class="progress-rail__tooltip"
      :style="tooltipStyle"
      role="tooltip"
    >
      <div class="progress-rail__tooltip-label">
        <span class="progress-rail__tooltip-turn">第 {{ hoverIndex + 1 }} 轮</span>
        <span v-if="markers[hoverIndex].kind === 'image'" class="progress-rail__tooltip-kind">图片</span>
      </div>
      <div class="progress-rail__tooltip-content">{{ markers[hoverIndex].userContent }}</div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.progress-rail {
  position: relative;
  flex-shrink: 0;
  align-self: stretch;
  overflow: visible;
  padding: 24px 0;
  box-sizing: border-box;
}

.progress-rail__marker {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 5px;
  transform: translate(-50%, -50%);
  border: 0;
  border-radius: 999px;
  background: var(--color-border-strong);
  cursor: pointer;
  padding: 0;
  opacity: 0.75;
  transition:
    height 0.16s,
    background 0.16s,
    opacity 0.16s;
}

.progress-rail__marker:hover,
.progress-rail__marker--hovered {
  opacity: 1;
  background: var(--color-text-muted);
}

.progress-rail__marker--active {
  height: 7px;
  background: var(--color-accent);
  opacity: 1;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 22%, transparent);
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

.progress-rail__tooltip-label {
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
