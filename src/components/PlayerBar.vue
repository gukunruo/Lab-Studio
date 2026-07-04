<script setup lang="ts">
import { computed, ref } from 'vue'
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
} from '@phosphor-icons/vue'
import { usePlayerStore } from '@/stores/player'

const player = usePlayerStore()
const {
  current,
  isPlaying,
  currentTime,
  duration,
  volume,
  playMode,
} = storeToRefs(player)

const prevVolume = ref(0.8)
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
</script>

<template>
  <div v-if="current" class="bar">
    <div class="bar__inner">
      <button class="bar__now" type="button" @click="player.openFull()" aria-label="展开播放器">
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
            <component :is="modeIcon" :size="16" />
          </button>
          <button class="ctrl" @click="player.prev()" aria-label="上一曲">
            <PhSkipBack :size="18" weight="fill" />
          </button>
          <button class="ctrl ctrl--play" @click="player.toggle()" :aria-label="isPlaying ? '暂停' : '播放'">
            <component :is="isPlaying ? PhPause : PhPlay" :size="20" weight="fill" />
          </button>
          <button class="ctrl" @click="player.next()" aria-label="下一曲">
            <PhSkipForward :size="18" weight="fill" />
          </button>
          <select class="rate" :value="player.playbackRate" @change="onRate" aria-label="倍速">
            <option v-for="r in rates" :key="r" :value="r">{{ r }}x</option>
          </select>
        </div>
        <div class="bar__progress">
          <span class="time">{{ formatTime(currentTime) }}</span>
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
          <span class="time">{{ formatTime(duration) }}</span>
        </div>
      </div>

      <div class="bar__right">
        <button class="ctrl" @click="toggleMute" :aria-label="volume > 0 ? '静音' : '取消静音'">
          <component :is="volume > 0 ? PhSpeakerHigh : PhSpeakerSlash" :size="16" />
        </button>
        <input
          class="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          :style="{ '--progress': volumePct + '%' }"
          @input="onVolume"
          aria-label="音量"
        />
        <button class="ctrl" @click="player.openFull()" aria-label="展开" title="展开">
          <PhArrowsOutSimple :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
}

.bar__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
  height: 76px;
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

.progress {
  flex: 1;
}

.bar__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  justify-content: flex-end;
}

.volume {
  width: 72px;
}

.bar input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    var(--color-accent) var(--progress, 0%),
    var(--color-surface) var(--progress, 0%)
  );
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

@media (max-width: 720px) {
  .bar__inner {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    padding: 0 var(--space-4);
  }

  .bar__progress,
  .bar__right .volume {
    display: none;
  }

  .bar__right {
    gap: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar__cover--playing {
    animation: none;
  }
}
</style>
