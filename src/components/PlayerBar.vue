<script setup lang="ts">
import { computed, onUnmounted, ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import {
  PhPlay,
  PhPause,
  PhSkipBack,
  PhSkipForward,
  PhRepeat,
  PhRepeatOnce,
  PhShuffle,
  PhSpeakerHigh,
  PhSpeakerSlash,
  PhArrowsOutSimple,
  PhQueue,
  PhX,
} from '@phosphor-icons/vue'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'

defineProps<{ compact?: boolean }>()

const player = usePlayerStore()
const ui = useUiStore()
const {
  playlist,
  current,
  currentIndex,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  volume,
  playMode,
} = storeToRefs(player)

const prevVolume = ref(0.8)
const showQueue = ref(false)
const queueListEl = ref<HTMLElement | null>(null)

watch(showQueue, async (v) => {
  if (!v) return
  await nextTick()
  const el = queueListEl.value?.querySelector('[data-active="true"]')
  el?.scrollIntoView({ block: 'nearest' })
})
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]

const modeIcon = computed(() =>
  playMode.value === 'single' ? PhRepeatOnce : playMode.value === 'shuffle' ? PhShuffle : PhRepeat,
)
const modeLabel = computed(
  () => ({ list: '列表循环', single: '单曲循环', shuffle: '随机播放' } as const)[playMode.value],
)
const progressPct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const volumePct = computed(() => volume.value * 100)

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function onSeek(e: Event) {
  player.seek(Number((e.target as HTMLInputElement).value))
}

const hoverTime = ref<number | null>(null)
const hoverPct = ref(0)
function onProgressHover(e: PointerEvent) {
  const wrap = e.currentTarget as HTMLElement
  const rect = wrap.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  hoverPct.value = ratio * 100
  hoverTime.value = ratio * (duration.value || 0)
}
function onProgressLeave() {
  hoverTime.value = null
}
function onVolume(e: Event) {
  player.setVolume(Number((e.target as HTMLInputElement).value))
}
function onRate(e: Event) {
  player.setRate(Number((e.target as HTMLSelectElement).value))
}
function toggleMute() {
  if (volume.value > 0) {
    prevVolume.value = volume.value
    player.setVolume(0)
  } else {
    player.setVolume(prevVolume.value)
  }
}

/* ---------- Draggable vinyl (learn mode) ---------- */
const DISC_SIZE = 64
const dragMoved = ref(false)
let dragStartX = 0
let dragStartY = 0
let discRect: DOMRect | null = null

const vinylStyle = computed(() => {
  const pos = ui.playerPos
  if (pos) {
    return { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
  }
  return {}
})

function onVinylDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  dragMoved.value = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  const wrap = (e.currentTarget as HTMLElement).closest('.vinyl-wrap') as HTMLElement | null
  discRect = (wrap ?? (e.currentTarget as HTMLElement)).getBoundingClientRect()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  window.addEventListener('pointermove', onWinMove)
  window.addEventListener('pointerup', onWinUp, { once: true })
}

function onWinMove(e: PointerEvent) {
  if (!discRect) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (!dragMoved.value && Math.hypot(dx, dy) > 4) {
    dragMoved.value = true
  }
  if (!dragMoved.value) return
  const w = discRect.width || DISC_SIZE
  const h = discRect.height || DISC_SIZE
  const margin = 8
  let nx = discRect.left + dx
  let ny = discRect.top + dy
  nx = Math.max(margin, Math.min(nx, window.innerWidth - w - margin))
  ny = Math.max(margin, Math.min(ny, window.innerHeight - h - margin))
  if (ui.tutorOpen) {
    const maxX = window.innerWidth - ui.tutorW - 12 - w
    nx = Math.min(nx, Math.max(margin, maxX))
  }
  ui.setPlayerPos({ x: Math.round(nx), y: Math.round(ny) })
}

function onWinUp() {
  window.removeEventListener('pointermove', onWinMove)
  discRect = null
}

function onVinylClick(e: MouseEvent) {
  const moved = dragMoved.value
  dragMoved.value = false
  if (moved) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  player.toggle()
}

watch(
  () => ui.tutorOpen,
  async (open) => {
    if (open) {
      await nextTick()
      const current = document.querySelector<HTMLElement>('.vinyl-wrap')?.getBoundingClientRect()
      if (!current) return
      if (!ui.playerRestPos) {
        ui.setPlayerRestPos({ x: Math.round(current.left), y: Math.round(current.top) })
      }
      const margin = 12
      const tutorLeft = window.innerWidth - ui.tutorW - margin
      const safeX = Math.max(8, tutorLeft - DISC_SIZE - margin)
      if (current.left + DISC_SIZE > tutorLeft) {
        ui.setPlayerPos({ x: Math.round(safeX), y: Math.round(current.top) })
      }
      return
    }

    if (ui.playerRestPos) {
      ui.setPlayerPos(ui.playerRestPos)
      ui.setPlayerRestPos(null)
    }
  },
)

watch(
  () => ui.tutorW,
  () => {
    if (!ui.tutorOpen || !ui.playerPos) return
    const tutorLeft = window.innerWidth - ui.tutorW - 12
    const maxX = tutorLeft - DISC_SIZE - 12
    if (ui.playerPos.x > maxX) {
      ui.setPlayerPos({ x: Math.max(8, Math.round(maxX)), y: ui.playerPos.y })
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('pointermove', onWinMove)
  window.removeEventListener('pointerup', onWinUp)
})
</script>

<template>
  <!-- Learn mode: floating vinyl disc → drag to move, click to play/pause, hover expand -->
  <div
    v-if="compact && current"
    class="vinyl-wrap"
    :class="{ 'vinyl-wrap--dragging': dragMoved }"
    :style="vinylStyle"
  >
    <button
      type="button"
      class="vinyl"
      :aria-label="`${current.title} · ${isPlaying ? '暂停' : '播放'}`"
      :title="isPlaying ? '暂停' : '播放'"
      @pointerdown="onVinylDown"
      @click="onVinylClick"
    >
      <span class="vinyl__disc" :class="{ 'vinyl__disc--playing': isPlaying }">
        <span class="vinyl__ring" aria-hidden="true" />
        <img class="vinyl__cover" :src="current.cover" alt="" loading="lazy" draggable="false" />
        <span class="vinyl__hole" aria-hidden="true" />
      </span>
      <span class="vinyl__play-hint" aria-hidden="true">
        <component :is="isPlaying ? PhPause : PhPlay" :size="18" weight="fill" />
      </span>
    </button>
    <button
      type="button"
      class="vinyl__expand"
      aria-label="展开播放器"
      title="展开播放器"
      @click="player.openFull()"
    >
      <PhArrowsOutSimple :size="13" />
    </button>
  </div>

  <div v-else-if="current" class="bar">
    <transition name="queue">
      <div
        v-if="showQueue"
        class="queue"
      >
        <div class="queue__head">
          <span class="queue__title">播放列表 · {{ playlist.length }}</span>
          <button
            class="queue__close"
            @click="showQueue = false"
            aria-label="关闭列表"
          >
            <PhX :size="16" />
          </button>
        </div>
        <ul
          ref="queueListEl"
          class="queue__list"
        >
          <li
            v-for="(t, i) in playlist"
            :key="t.id"
            :data-active="i === currentIndex"
            :class="{ 'queue__item--active': i === currentIndex }"
            @click="player.playTrack(i); showQueue = false"
          >
            <span class="queue__idx">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="queue__name">{{ t.title }}</span>
            <span class="queue__artist">{{ t.artist }}</span>
          </li>
        </ul>
      </div>
    </transition>
    <div class="bar__inner">
      <button
        class="bar__now"
        type="button"
        @click="player.openFull()"
        aria-label="展开播放器"
      >
        <img
          class="bar__cover"
          :class="{ 'bar__cover--playing': isPlaying }"
          :src="current.cover"
          :alt="current.title"
          loading="lazy"
        />
        <span class="bar__meta">
          <span class="bar__title">{{ current.title }}</span>
          <span class="bar__artist">{{ current.artist }}</span>
        </span>
      </button>

      <div class="bar__center">
        <div class="bar__controls">
          <button
            class="ctrl"
            :class="{ 'ctrl--active': playMode !== 'list' }"
            @click="player.cyclePlayMode()"
            :aria-label="modeLabel"
            :title="modeLabel"
          >
            <component
              :is="modeIcon"
              :size="16"
            />
          </button>
          <button
            class="ctrl"
            @click="player.prev()"
            aria-label="上一曲"
          >
            <PhSkipBack
              :size="18"
              weight="fill"
            />
          </button>
          <button
            class="ctrl ctrl--play"
            @click="player.toggle()"
            :aria-label="isPlaying ? '暂停' : '播放'"
          >
            <component
              :is="isPlaying ? PhPause : PhPlay"
              :size="20"
              weight="fill"
            />
          </button>
          <button
            class="ctrl"
            @click="player.next()"
            aria-label="下一曲"
          >
            <PhSkipForward
              :size="18"
              weight="fill"
            />
          </button>
          <select
            class="rate"
            :value="player.playbackRate"
            @change="onRate"
            aria-label="倍速"
          >
            <option
              v-for="r in rates"
              :key="r"
              :value="r"
            >{{ r }}x</option>
          </select>
        </div>
        <div class="bar__progress">
          <span class="time">{{ formatTime(currentTime) }}</span>
          <div
            class="progress-wrap"
            :class="{ 'progress-wrap--buffering': isBuffering }"
            @pointermove="onProgressHover"
            @pointerleave="onProgressLeave"
          >
            <input
              class="progress"
              type="range"
              min="0"
              :max="duration || 0"
              step="0.1"
              :value="currentTime"
              :style="{ '--progress': progressPct + '%' }"
              @input="onSeek"
              aria-label="播放进度"
            />
            <span
              v-if="hoverTime !== null"
              class="progress__tip"
              :style="{ left: hoverPct + '%' }"
            >
              {{ formatTime(hoverTime) }}
            </span>
          </div>
          <span class="time">{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="bar__right">
        <div class="vol">
          <button
            class="ctrl ctrl--mute"
            @click="toggleMute"
            :aria-label="volume > 0 ? '静音' : '取消静音'"
          >
            <component
              :is="volume > 0 ? PhSpeakerHigh : PhSpeakerSlash"
              :size="16"
            />
          </button>
          <div class="vol__pop">
            <input
              class="volume vol__slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="volume"
              :style="{ '--progress': volumePct + '%' }"
              @input="onVolume"
              aria-label="音量"
            />
          </div>
        </div>
        <button
          class="ctrl"
          :class="{ 'ctrl--active': showQueue }"
          @click="showQueue = !showQueue"
          aria-label="播放列表"
          title="播放列表"
        >
          <PhQueue :size="18" />
        </button>
        <button
          class="ctrl"
          @click="player.openFull()"
          aria-label="展开"
          title="展开"
        >
          <PhArrowsOutSimple :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vinyl-wrap {
  position: fixed;
  right: var(--space-5);
  bottom: calc(var(--space-5) + env(safe-area-inset-bottom));
  z-index: 30;
  width: 64px;
  height: 64px;
  transition:
    left 0.28s ease,
    top 0.28s ease,
    right 0.28s ease,
    bottom 0.28s ease;
}

.vinyl-wrap--dragging {
  transition: none;
}

.vinyl {
  position: relative;
  width: 64px;
  height: 64px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: grab;
  background: transparent;
  user-select: none;
  -webkit-user-drag: none;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.18),
    0 0 0 1px var(--color-border);
  transition: transform 0.2s ease;
}

.vinyl:hover {
  transform: scale(1.06);
}

.vinyl:active {
  transform: scale(0.96);
}

.vinyl-wrap--dragging .vinyl {
  transition: none;
  cursor: grabbing;
  transform: none;
}

.vinyl__play-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  opacity: 0;
  transition: opacity 0.18s;
  pointer-events: none;
}

.vinyl:hover .vinyl__play-hint {
  opacity: 1;
}

.vinyl__expand {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.18s, transform 0.18s, color 0.15s;
  pointer-events: none;
}

.vinyl-wrap:hover .vinyl__expand {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.vinyl__expand:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.vinyl__disc {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.vinyl__cover {
  position: absolute;
  inset: 7px;
  width: calc(100% - 14px);
  height: calc(100% - 14px);
  border-radius: 50%;
  object-fit: cover;
  z-index: 1;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
}

.vinyl__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(
      circle at 50% 50%,
      transparent 38%,
      rgba(24, 24, 27, 0.55) 39%,
      rgba(24, 24, 27, 0.75) 52%,
      rgba(39, 39, 42, 0.9) 70%,
      #18181b 100%
    );
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.vinyl__hole {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--color-bg);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
}

.vinyl__disc--playing {
  animation: vinyl-spin 8s linear infinite;
}

@keyframes vinyl-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vinyl__disc--playing {
    animation: none;
  }
}

@media (max-width: 640px) {
  .vinyl-wrap {
    right: var(--space-3);
    bottom: calc(var(--space-3) + env(safe-area-inset-bottom));
    width: 56px;
    height: 56px;
  }

  .vinyl {
    width: 56px;
    height: 56px;
  }
}

.bar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.bar__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
  height: 88px;
  padding: 0 var(--space-6);
}

.bar__now {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}

.bar__cover {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px var(--color-border);
}

.bar__cover--playing {
  animation: spin 8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.bar__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bar__title {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar__artist {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar__center {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
  min-width: 0;
  padding: var(--space-2) 0;
}

.bar__controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.bar__progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.time {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--color-text-muted);
  min-width: 36px;
  text-align: center;
}

.progress-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.progress {
  width: 100%;
}

.progress__tip {
  position: absolute;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  padding: 0.15rem 0.4rem;
  background: var(--color-text);
  color: var(--color-bg);
  border-radius: var(--radius-sm);
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}

.progress-wrap--buffering .progress {
  background: repeating-linear-gradient(45deg,
      var(--color-accent) 0 4px,
      var(--color-surface) 4px 8px);
  background-size: 11.3px 11.3px;
  animation: buffering-stripes 0.6s linear infinite;
}

@keyframes buffering-stripes {
  to {
    background-position: 11.3px 0;
  }
}

.bar__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  justify-content: flex-end;
}

.vol {
  position: relative;
}

.vol__pop {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) scale(0.92);
  transform-origin: bottom center;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-2);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 30;
  width: 28px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vol__pop::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 10px;
}

.vol:hover .vol__pop,
.vol:focus-within .vol__pop {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) scale(1);
}

.vol__slider {
  width: 80px;
  height: 4px;
  transform: rotate(-90deg);
}

.bar input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(to right,
      var(--color-accent) var(--progress, 0%),
      var(--color-surface) var(--progress, 0%));
  cursor: pointer;
  outline: none;
}

.bar input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--color-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.bar input[type='range']::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--color-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s,
    transform 0.1s;
}

.ctrl:hover {
  color: var(--color-accent);
  background: var(--color-surface);
}

.ctrl:active {
  transform: scale(0.92);
}

.ctrl--active {
  color: var(--color-accent);
}

.ctrl--play {
  width: 44px;
  height: 44px;
  background: var(--color-accent);
  color: var(--color-bg);
}

.ctrl--play:hover {
  background: var(--color-accent);
  color: var(--color-bg);
  filter: brightness(1.08);
}

.rate {
  background: var(--color-surface);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 0.2rem 0.45rem;
  font: inherit;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  cursor: pointer;
  outline: none;
}

.rate:focus {
  border-color: var(--color-accent);
}

.queue {
  position: absolute;
  bottom: 100%;
  right: var(--space-6);
  width: 360px;
  max-height: 380px;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  margin-bottom: var(--space-2);
  z-index: 21;
}

.queue__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.queue__title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}

.queue__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}

.queue__close:hover {
  color: var(--color-accent);
  background: var(--color-bg);
}

.queue__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
  overflow-y: auto;
  flex: 1;
  scrollbar-width: none;
}

.queue__list::-webkit-scrollbar {
  display: none;
}

.queue__list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.84rem;
  color: var(--color-text);
  transition: background 0.15s;
}

.queue__list li:hover {
  background: var(--color-bg);
}

.queue__item--active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.queue__idx {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--color-text-muted);
  min-width: 1.5em;
}

.queue__item--active .queue__idx {
  color: var(--color-accent);
}

.queue__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue__artist {
  color: var(--color-text-muted);
  font-size: 0.76rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 90px;
}

.queue-enter-active,
.queue-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}

.queue-enter-from,
.queue-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 720px) {
  .bar__inner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
  }

  .bar__now {
    flex: 1;
  }

  .bar__center {
    flex: none;
  }

  .bar__progress,
  .bar__right .volume,
  .rate,
  .ctrl--mute {
    display: none;
  }

  .bar__controls {
    gap: var(--space-1);
  }

  .bar__right {
    gap: var(--space-1);
    flex: none;
  }

  .bar__artist {
    display: none;
  }

  .bar__cover {
    width: 38px;
    height: 38px;
  }

  .queue {
    right: var(--space-3);
    left: var(--space-3);
    width: auto;
    max-height: 320px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar__cover--playing {
    animation: none;
  }
}
</style>
