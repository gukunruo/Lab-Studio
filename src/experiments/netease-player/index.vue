<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  PhPlay,
  PhPause,
  PhSkipBack,
  PhSkipForward,
  PhPlaylist,
  PhSpeakerHigh,
  PhSpeakerSlash,
} from '@phosphor-icons/vue'
import { tracks } from './mock'
import { useAudioPlayer } from './useAudioPlayer'

const {
  playlist,
  current,
  currentIndex,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  volume,
  toggle,
  next,
  prev,
  seek,
  setRate,
  setVolume,
  playTrack,
} = useAudioPlayer(tracks)

const showPlaylist = ref(false)
const lyricsEl = ref<HTMLElement | null>(null)
const prevVolume = ref(0.8)
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]

const activeLyricIndex = computed(() => {
  const t = currentTime.value
  const lines = current.value?.lyrics ?? []
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line && line.time <= t) idx = i
    else break
  }
  return idx
})

async function scrollLyric(i: number) {
  await nextTick()
  const c = lyricsEl.value
  if (!c) return
  const line = c.children[i] as HTMLElement | undefined
  if (!line) return
  const top = line.offsetTop - c.clientHeight / 2 + line.clientHeight / 2
  c.scrollTo({ top, behavior: 'smooth' })
}

watch(activeLyricIndex, scrollLyric)
watch(currentIndex, () => scrollLyric(0))

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function onSeek(e: Event) {
  seek(Number((e.target as HTMLInputElement).value))
}
function onRate(e: Event) {
  setRate(Number((e.target as HTMLSelectElement).value))
}
function onVolume(e: Event) {
  setVolume(Number((e.target as HTMLInputElement).value))
}
function toggleMute() {
  if (volume.value > 0) {
    prevVolume.value = volume.value
    setVolume(0)
  } else {
    setVolume(prevVolume.value)
  }
}

const progressPct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const volumePct = computed(() => volume.value * 100)
</script>

<template>
  <div v-if="current" class="player">
    <div class="player__main">
      <div class="art" :class="{ 'art--playing': isPlaying }">
        <div class="art__disc">
          <img class="art__cover" :src="current.cover" :alt="current.title" loading="lazy" />
        </div>
      </div>

      <div class="lyrics" ref="lyricsEl">
        <p
          v-for="(line, i) in current.lyrics"
          :key="i"
          :class="['lyrics__line', { 'lyrics__line--active': i === activeLyricIndex }]"
          @click="seek(line.time)"
        >
          {{ line.text }}
        </p>
      </div>
    </div>

    <div class="bar">
      <span class="bar__time">{{ formatTime(currentTime) }}</span>
      <input
        class="bar__progress"
        type="range"
        min="0"
        :max="duration || 0"
        step="0.1"
        :value="currentTime"
        :style="{ '--progress': progressPct + '%' }"
        @input="onSeek"
        aria-label="播放进度"
      />
      <span class="bar__time">{{ formatTime(duration) }}</span>

      <button class="ctrl" @click="prev" aria-label="上一曲">
        <PhSkipBack :size="20" weight="fill" />
      </button>
      <button class="ctrl ctrl--play" @click="toggle" :aria-label="isPlaying ? '暂停' : '播放'">
        <component :is="isPlaying ? PhPause : PhPlay" :size="22" weight="fill" />
      </button>
      <button class="ctrl" @click="next" aria-label="下一曲">
        <PhSkipForward :size="20" weight="fill" />
      </button>

      <select class="rate" :value="playbackRate" @change="onRate" aria-label="倍速">
        <option v-for="r in rates" :key="r" :value="r">{{ r }}x</option>
      </select>

      <button class="ctrl" @click="toggleMute" :aria-label="volume > 0 ? '静音' : '取消静音'">
        <component :is="volume > 0 ? PhSpeakerHigh : PhSpeakerSlash" :size="18" />
      </button>
      <input
        class="bar__volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="volume"
        :style="{ '--progress': volumePct + '%' }"
        @input="onVolume"
        aria-label="音量"
      />

      <button
        class="ctrl"
        :class="{ 'ctrl--active': showPlaylist }"
        @click="showPlaylist = !showPlaylist"
        aria-label="播放列表"
      >
        <PhPlaylist :size="20" />
      </button>
    </div>

    <transition name="slide">
      <ul v-if="showPlaylist" class="playlist">
        <li
          v-for="(t, i) in playlist"
          :key="t.id"
          :class="{ 'playlist__item--active': i === currentIndex }"
          @click="playTrack(i)"
        >
          <span class="playlist__idx">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="playlist__title">{{ t.title }}</span>
          <span class="playlist__artist">{{ t.artist }}</span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.player {
  --p-bg: #1d1d1f;
  --p-surface: #2a2a2e;
  --p-surface-2: #3a3a40;
  --p-text: #f5f5f7;
  --p-muted: #8e8e93;
  --p-accent: #c20c0c;
  --p-accent-2: #e8483f;
  --p-border: rgba(255, 255, 255, 0.08);

  background: var(--p-bg);
  color: var(--p-text);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.player__main {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  padding: var(--space-8);
  align-items: center;
}

.art {
  width: 200px;
  height: 200px;
  flex-shrink: 0;
}

.art__disc {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle at center, #0c0c0c 0 2px, #1a1a1a 2px 4px),
    radial-gradient(circle at center, #1a1a1a, #000);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
}

.art--playing .art__disc {
  animation: spin 10s linear infinite;
}

.art__cover {
  width: 44%;
  height: 44%;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 4px var(--p-bg);
}

.art__disc::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #000;
  border: 2px solid #444;
  z-index: 2;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.lyrics {
  height: 220px;
  overflow-y: auto;
  scroll-behavior: smooth;
  padding: var(--space-4) 0;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
  scrollbar-width: none;
}

.lyrics::-webkit-scrollbar {
  width: 0;
}

.lyrics__line {
  padding: var(--space-2) var(--space-4);
  color: var(--p-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  text-align: center;
  cursor: pointer;
  transition:
    color 0.3s,
    transform 0.3s;
}

.lyrics__line:hover {
  color: var(--p-text);
}

.lyrics__line--active {
  color: var(--p-text);
  font-size: 1.08rem;
  font-weight: 600;
  transform: scale(1.03);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--p-surface);
  border-top: 1px solid var(--p-border);
  flex-wrap: wrap;
}

.bar__time {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--p-muted);
  min-width: 40px;
  text-align: center;
}

.bar__progress {
  flex: 1;
  min-width: 140px;
}

.bar__volume {
  width: 80px;
}

.player input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    var(--p-accent-2) var(--progress, 0%),
    var(--p-surface-2) var(--progress, 0%)
  );
  cursor: pointer;
  outline: none;
}

.player input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--p-accent-2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.player input[type='range']::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--p-accent-2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--p-text);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    transform 0.1s;
}

.ctrl:hover {
  background: var(--p-surface-2);
  color: var(--p-accent-2);
}

.ctrl:active {
  transform: scale(0.92);
}

.ctrl--active {
  color: var(--p-accent-2);
}

.ctrl--play {
  width: 46px;
  height: 46px;
  background: var(--p-accent);
  color: #fff;
}

.ctrl--play:hover {
  background: var(--p-accent-2);
  color: #fff;
}

.rate {
  background: var(--p-surface-2);
  color: var(--p-text);
  border: 1px solid var(--p-border);
  border-radius: var(--radius-sm);
  padding: 0.3rem 0.4rem;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
  outline: none;
}

.rate:focus {
  border-color: var(--p-accent-2);
}

.playlist {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid var(--p-border);
  background: var(--p-bg);
}

.playlist li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.88rem;
  transition: background 0.15s;
}

.playlist li:hover {
  background: var(--p-surface);
}

.playlist__item--active {
  color: var(--p-accent-2);
}

.playlist__idx {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--p-muted);
}

.playlist__item--active .playlist__idx {
  color: var(--p-accent-2);
}

.playlist__artist {
  color: var(--p-muted);
  font-size: 0.8rem;
}

.slide-enter-active,
.slide-leave-active {
  transition:
    opacity 0.25s ease,
    max-height 0.25s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 220px;
}

@media (max-width: 720px) {
  .player__main {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .art {
    width: 160px;
    height: 160px;
  }

  .bar__volume {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .art--playing .art__disc {
    animation: none;
  }

  .lyrics {
    scroll-behavior: auto;
  }
}
</style>
