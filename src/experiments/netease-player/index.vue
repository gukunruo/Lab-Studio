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
  noAudio,
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
      <div class="cover-col">
        <div class="art" :class="{ 'art--playing': isPlaying }">
          <div class="art__vinyl"></div>
          <img class="art__cover" :src="current.cover" :alt="current.title" loading="lazy" />
        </div>
        <div class="now-playing">
          <div class="now-playing__title">{{ current.title }}</div>
          <div class="now-playing__artist">{{ current.artist }} · {{ current.album }}</div>
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

    <div v-if="noAudio" class="no-audio">
      <span>未找到音频文件。</span>
      请把 <code>{{ current.id }}.mp3</code> 放入 <code>public/audio/</code> 后刷新
    </div>

    <div class="controls">
      <div class="controls__progress">
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

      <div class="controls__row">
        <div class="controls__side">
          <select class="rate" :value="playbackRate" @change="onRate" aria-label="倍速">
            <option v-for="r in rates" :key="r" :value="r">{{ r }}x</option>
          </select>
        </div>

        <div class="controls__center">
          <button class="ctrl" @click="prev" aria-label="上一曲">
            <PhSkipBack :size="22" weight="fill" />
          </button>
          <button class="ctrl ctrl--play" @click="toggle" :aria-label="isPlaying ? '暂停' : '播放'">
            <component :is="isPlaying ? PhPause : PhPlay" :size="26" weight="fill" />
          </button>
          <button class="ctrl" @click="next" aria-label="下一曲">
            <PhSkipForward :size="22" weight="fill" />
          </button>
        </div>

        <div class="controls__side controls__side--right">
          <button class="ctrl" @click="toggleMute" :aria-label="volume > 0 ? '静音' : '取消静音'">
            <component :is="volume > 0 ? PhSpeakerHigh : PhSpeakerSlash" :size="18" />
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
          <button
            class="ctrl ctrl--list"
            :class="{ 'ctrl--active': showPlaylist }"
            @click="showPlaylist = !showPlaylist"
            aria-label="播放列表"
          >
            <PhPlaylist :size="20" />
            <span class="ctrl__badge">{{ playlist.length }}</span>
          </button>
        </div>
      </div>
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
  grid-template-columns: minmax(0, 320px) 1fr;
  gap: var(--space-8);
  padding: var(--space-8);
  align-items: center;
}

.cover-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-5);
}

/* NetEase-style vinyl: circular album cover centered on a grooved disc.
   Cover inscribed in the disc so nothing overflows; the disc spins. */
.art {
  position: relative;
  width: 240px;
  height: 240px;
}

.art__vinyl {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 1;
  background:
    repeating-radial-gradient(circle at center, #0a0a0a 0 2px, #161616 2px 4px),
    radial-gradient(circle at center, #1a1a1a, #000);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
}

.art__cover {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  object-fit: cover;
  z-index: 2;
  box-shadow: 0 0 0 6px #0c0c0c, 0 8px 24px rgba(0, 0, 0, 0.5);
}

.art::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #000;
  border: 2px solid #2a2a2e;
  z-index: 3;
}

.art--playing .art__vinyl {
  animation: spin 8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.now-playing {
  text-align: center;
  max-width: 100%;
}

.now-playing__title {
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.now-playing__artist {
  font-size: 0.8rem;
  color: var(--p-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics {
  height: 260px;
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

.controls {
  padding: var(--space-4) var(--space-6) var(--space-5);
  background: var(--p-surface);
  border-top: 1px solid var(--p-border);
}

.no-audio {
  padding: var(--space-3) var(--space-6);
  background: rgba(194, 12, 12, 0.12);
  border-top: 1px solid var(--p-border);
  color: var(--p-accent-2);
  font-size: 0.82rem;
  line-height: 1.6;
}

.no-audio code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.1em 0.35em;
  border-radius: var(--radius-sm);
}

.controls__progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.time {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--p-muted);
  min-width: 40px;
  text-align: center;
}

.progress {
  flex: 1;
}

.controls__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.controls__center {
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

.controls__side {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 120px;
}

.controls__side--right {
  justify-content: flex-end;
}

.volume {
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
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
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
  width: 56px;
  height: 56px;
  background: var(--p-accent);
  color: #fff;
  box-shadow: 0 6px 20px rgba(194, 12, 12, 0.4);
}

.ctrl--play:hover {
  background: var(--p-accent-2);
  color: #fff;
}

.ctrl__badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--p-accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.rate {
  background: var(--p-surface-2);
  color: var(--p-text);
  border: 1px solid var(--p-border);
  border-radius: var(--radius-full);
  padding: 0.3rem 0.6rem;
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
  max-height: 220px;
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
  max-height: 240px;
}

@media (max-width: 720px) {
  .player__main {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .lyrics {
    height: 180px;
    width: 100%;
  }

  .controls__side {
    min-width: 0;
  }

  .volume {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .art--playing .art__vinyl {
    animation: none;
  }

  .lyrics {
    scroll-behavior: auto;
  }
}
</style>
