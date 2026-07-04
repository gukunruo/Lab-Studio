<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
  PhX,
  PhPlaylist,
  PhHeart,
  PhHeartStraight,
  PhTrash,
} from '@phosphor-icons/vue'
import { usePlayerStore } from '@/stores/player'
import type { Track } from '@/data/tracks'

const player = usePlayerStore()
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
  playMode,
  showPlaylist,
  showFullPlayer,
  analyser,
  collectionKey,
} = storeToRefs(player)

const lyricsEl = ref<HTMLElement | null>(null)
const prevVolume = ref(0.8)
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]

const modeIcon = computed(() =>
  playMode.value === 'single' ? PhRepeatOnce : playMode.value === 'shuffle' ? PhShuffle : PhRepeat,
)
const modeLabel = computed(
  () => ({ list: '列表循环', single: '单曲循环', shuffle: '随机播放' } as const)[playMode.value],
)

const searchQuery = ref('')
const langTab = ref<'all' | 'cn' | 'en' | 'jpkr'>('all')
const tabs = [
  { key: 'all', label: '全部' },
  { key: 'cn', label: '华语' },
  { key: 'en', label: '欧美' },
  { key: 'jpkr', label: '日韩' },
] as const
function langOf(t: Track) {
  const s = (t.artist || '') + (t.title || '')
  if (/[가-힣]/.test(s)) return 'kr'
  if (/[ぁ-んァ-ヶー]/.test(s)) return 'jp'
  if (/[一-鿿]/.test(s)) return 'cn'
  return 'en'
}
const filteredTracks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return playlist.value
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      if (langTab.value !== 'all') {
        const l = langOf(t)
        if (langTab.value === 'jpkr' ? l !== 'jp' && l !== 'kr' : l !== langTab.value) return false
      }
      if (q && !(t.title + t.artist + t.album).toLowerCase().includes(q)) return false
      return true
    })
})

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
  player.seek(Number((e.target as HTMLInputElement).value))
}
function onRate(e: Event) {
  player.setRate(Number((e.target as HTMLSelectElement).value))
}
function onVolume(e: Event) {
  player.setVolume(Number((e.target as HTMLInputElement).value))
}
function toggleMute() {
  if (volume.value > 0) {
    prevVolume.value = volume.value
    player.setVolume(0)
  } else {
    player.setVolume(prevVolume.value)
  }
}

const progressPct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const volumePct = computed(() => volume.value * 100)

// vibe color: hash track id to a stable palette entry (no CORS issues)
const vibePalette = ['#2dd4bf', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#10b981', '#f97316']
const vibeColor = computed(() => {
  const id = current.value?.id || ''
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return vibePalette[h % vibePalette.length]
})

// keyboard shortcuts (ignored while typing in inputs)
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
function onKey(e: KeyboardEvent) {
  if (isTyping(e)) return
  switch (e.code) {
    case 'Space':
      e.preventDefault()
      player.toggle()
      break
    case 'ArrowLeft':
      e.preventDefault()
      player.seek(Math.max(0, currentTime.value - 5))
      break
    case 'ArrowRight':
      e.preventDefault()
      player.seek(Math.min(duration.value || 0, currentTime.value + 5))
      break
    case 'ArrowUp':
      e.preventDefault()
      player.setVolume(Math.min(1, volume.value + 0.05))
      break
    case 'ArrowDown':
      e.preventDefault()
      player.setVolume(Math.max(0, volume.value - 0.05))
      break
    case 'KeyM':
      e.preventDefault()
      toggleMute()
      break
    case 'KeyN':
      e.preventDefault()
      player.next()
      break
    case 'KeyP':
      e.preventDefault()
      player.prev()
      break
    case 'Escape':
      if (showPlaylist.value) player.togglePlaylist()
      else player.closeFull()
      break
  }
}

// playlist drawer: scroll active track into view on open
const playlistListEl = ref<HTMLElement | null>(null)
watch(showPlaylist, async (v) => {
  if (!v) return
  await nextTick()
  setTimeout(() => {
    const c = playlistListEl.value
    if (!c) return
    const active = c.querySelector('.playlist__item--active') as HTMLElement | null
    if (active) active.scrollIntoView({ block: 'center' })
  }, 280)
})

// spectrum: rAF loop reading analyser frequency data into 32 bars
const BARS = 32
const bars = ref<number[]>(Array(BARS).fill(0))
let raf = 0
function loop() {
  const an = analyser.value
  if (an) {
    const data = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(data)
    const step = Math.max(1, Math.floor(data.length / BARS))
    const next = Array(BARS).fill(0)
    for (let i = 0; i < BARS; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0
      next[i] = Math.min(1, sum / step / 255)
    }
    bars.value = next
  }
  raf = requestAnimationFrame(loop)
}
watch(showFullPlayer, (v) => {
  if (v) raf = requestAnimationFrame(loop)
  else cancelAnimationFrame(raf)
})

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <Teleport to="body">
    <transition name="overlay">
      <div v-if="player.showFullPlayer && current" class="full" :style="{ '--vibe': vibeColor }">
        <button
          class="full__close"
          :class="{ 'full__close--hidden': showPlaylist }"
          @click="player.closeFull()"
          aria-label="关闭"
        >
          <PhX :size="22" />
        </button>

        <div class="full__main">
          <div class="cover-col">
            <div class="art" :class="{ 'art--playing': isPlaying }">
              <div class="art__vinyl"></div>
              <img class="art__cover" :src="current.cover" :alt="current.title" loading="lazy" />
            </div>
            <div class="spectrum">
              <span
                v-for="(b, i) in bars"
                :key="i"
                class="spectrum__bar"
                :style="{ transform: `scaleY(${b})` }"
              />
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
              @click="player.seek(line.time)"
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
              <button
                class="ctrl"
                :class="{ 'ctrl--active': playMode !== 'list' }"
                @click="player.cyclePlayMode()"
                :aria-label="modeLabel"
                :title="modeLabel"
              >
                <component :is="modeIcon" :size="18" />
              </button>
              <select class="rate" :value="playbackRate" @change="onRate" aria-label="倍速">
                <option v-for="r in rates" :key="r" :value="r">{{ r }}x</option>
              </select>
            </div>

            <div class="controls__center">
              <button class="ctrl" @click="player.prev()" aria-label="上一曲">
                <PhSkipBack :size="22" weight="fill" />
              </button>
              <button class="ctrl ctrl--play" @click="player.toggle()" :aria-label="isPlaying ? '暂停' : '播放'">
                <component :is="isPlaying ? PhPause : PhPlay" :size="26" weight="fill" />
              </button>
              <button class="ctrl" @click="player.next()" aria-label="下一曲">
                <PhSkipForward :size="22" weight="fill" />
              </button>
            </div>

            <div class="controls__side controls__side--right">
              <button
                class="ctrl"
                :class="{ 'ctrl--active': player.isLiked(current.id) }"
                @click="player.toggleLike(current.id)"
                :aria-label="player.isLiked(current.id) ? '取消喜欢' : '喜欢'"
                :title="player.isLiked(current.id) ? '取消喜欢' : '喜欢'"
              >
                <component
                  :is="player.isLiked(current.id) ? PhHeart : PhHeartStraight"
                  :size="18"
                  :weight="player.isLiked(current.id) ? 'fill' : 'regular'"
                />
              </button>
              <button
                class="ctrl ctrl--remove"
                @click="player.removeFromPlaylist(current.id)"
                aria-label="从歌单移除"
                title="从歌单移除"
              >
                <PhTrash :size="18" />
              </button>
              <button class="ctrl ctrl--mute" @click="toggleMute" :aria-label="volume > 0 ? '静音' : '取消静音'">
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
                @click="player.togglePlaylist()"
                aria-label="播放列表"
              >
                <PhPlaylist :size="20" />
                <span class="ctrl__badge">{{ playlist.length }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="showPlaylist" class="playlist-backdrop" @click="player.togglePlaylist()" />
        <transition name="slide">
          <div v-if="showPlaylist" class="playlist">
            <div class="playlist__collections">
              <button
                v-for="c in player.collections"
                :key="c.key"
                class="playlist__col"
                :class="{ 'playlist__col--active': collectionKey === c.key }"
                @click="player.switchCollection(c.key)"
              >
                {{ c.label }}
              </button>
            </div>
            <div class="playlist__bar">
              <input
                class="playlist__search"
                v-model="searchQuery"
                placeholder="搜索歌曲 / 艺人 / 专辑"
                aria-label="搜索歌单"
              />
              <div class="playlist__tabs">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  class="playlist__tab"
                  :class="{ 'playlist__tab--active': langTab === tab.key }"
                  @click="langTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>
              <button class="playlist__close" @click="player.togglePlaylist()" aria-label="关闭播放列表">
                <PhX :size="18" />
              </button>
            </div>
            <ul class="playlist__list" ref="playlistListEl">
              <li
                v-for="{ t, i } in filteredTracks"
                :key="t.id"
                :class="{ 'playlist__item--active': i === currentIndex }"
                @click="player.playTrack(i)"
              >
                <span class="playlist__idx">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="playlist__title"
                  >{{ t.title
                  }}<PhHeart v-if="player.isLiked(t.id)" :size="12" weight="fill" class="playlist__liked"
                /></span>
                <span class="playlist__artist">{{ t.artist }}</span>
                <button
                  class="playlist__remove"
                  @click.stop="player.removeFromPlaylist(t.id)"
                  aria-label="从歌单移除"
                  title="从歌单移除"
                >
                  <PhTrash :size="14" />
                </button>
              </li>
            </ul>
          </div>
        </transition>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.full {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100dvh;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  overflow: hidden;
}

.full::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    circle at 30% 18%,
    color-mix(in srgb, var(--vibe, var(--color-accent)) 24%, transparent),
    transparent 55%
  );
  pointer-events: none;
}

.full__main,
.controls,
.no-audio {
  position: relative;
  z-index: 1;
}

.full__close {
  position: absolute;
  top: max(var(--space-4), env(safe-area-inset-top));
  right: max(var(--space-5), env(safe-area-inset-right));
  z-index: 5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.full__close--hidden {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
}

.full__close:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.full__main {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 360px) 1fr;
  gap: var(--space-8);
  padding: var(--space-8) var(--space-8) var(--space-6);
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.cover-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

.spectrum {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  height: 44px;
  width: 200px;
}

.spectrum__bar {
  width: 4px;
  height: 100%;
  background: var(--color-accent);
  border-radius: 2px;
  transform-origin: bottom center;
  opacity: 0.85;
  transition: transform 0.06s linear;
}

/* vinyl: circular album cover centered on a grooved disc */
.art {
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  box-shadow: 0 0 90px color-mix(in srgb, var(--vibe, var(--color-accent)) 30%, transparent);
}

.art__vinyl {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 1;
  background:
    repeating-radial-gradient(circle at center, rgba(255, 255, 255, 0.04) 0 2px, transparent 2px 4px),
    radial-gradient(circle at center, #2a2a2e, #0a0a0a);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
}

.art__cover {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  object-fit: cover;
  z-index: 2;
  box-shadow: 0 0 0 6px var(--color-bg), 0 8px 24px rgba(0, 0, 0, 0.3);
}

.art::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #0a0a0a;
  border: 2px solid var(--color-bg);
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
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: var(--space-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.now-playing__artist {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics {
  height: 320px;
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
  color: var(--color-text-muted);
  font-size: 0.98rem;
  line-height: 1.6;
  text-align: center;
  cursor: pointer;
  transition:
    color 0.3s,
    transform 0.3s;
}

.lyrics__line:hover {
  color: var(--color-text);
}

.lyrics__line--active {
  color: var(--color-accent);
  font-size: 1.1rem;
  font-weight: 600;
  transform: scale(1.03);
}

.controls {
  padding-block: var(--space-4) var(--space-5);
  padding-inline: max(var(--space-6), calc((100% - 1100px) / 2));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.no-audio {
  padding: var(--space-3) var(--space-6);
  background: var(--color-accent-soft);
  border-top: 1px solid var(--color-border);
  color: var(--color-accent);
  font-size: 0.82rem;
  line-height: 1.6;
}

.no-audio code {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  background: var(--color-bg);
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
  color: var(--color-text-muted);
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
  flex: none;
}

.controls__side {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 120px;
}

.controls__side--right {
  justify-content: flex-end;
}

.volume {
  width: 80px;
}

.full input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    var(--color-accent) var(--progress, 0%),
    var(--color-border) var(--progress, 0%)
  );
  cursor: pointer;
  outline: none;
}

.full input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--color-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.full input[type='range']::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--color-accent);
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
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    transform 0.1s;
}

.ctrl:hover {
  background: var(--color-bg);
  color: var(--color-accent);
}

.ctrl:active {
  transform: scale(0.92);
}

.ctrl--active {
  color: var(--color-accent);
}

.ctrl--play {
  width: 56px;
  height: 56px;
  background: var(--color-accent);
  color: var(--color-bg);
  box-shadow: 0 6px 20px var(--color-accent-soft);
}

.ctrl--play:hover {
  background: var(--color-accent);
  filter: brightness(1.08);
  color: var(--color-bg);
}

.ctrl__badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--color-accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}

.rate {
  background: var(--color-bg);
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 0.3rem 0.6rem;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
  outline: none;
}

.rate:focus {
  border-color: var(--color-accent);
}

.playlist-backdrop {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.playlist {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  overflow-y: auto;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg);
  z-index: 3;
  box-shadow: -12px 0 40px rgba(0, 0, 0, 0.18);
}

.playlist__collections {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) 0;
}

.playlist__col {
  flex: 1;
  padding: 0.4rem 0.5rem;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s,
    border-color 0.15s;
}

.playlist__col:hover {
  color: var(--color-text);
}

.playlist__col--active {
  color: var(--color-bg);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.playlist__bar {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 1;
}

.playlist__search {
  flex: 1;
  min-width: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 0.35rem 0.8rem;
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  outline: none;
}

.playlist__search:focus {
  border-color: var(--color-accent);
}

.playlist__search::placeholder {
  color: var(--color-text-muted);
}

.playlist__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}

.playlist__close:hover {
  color: var(--color-accent);
  background: var(--color-surface);
}

.playlist__tabs {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.playlist__tab {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.76rem;
  padding: 0.3rem 0.55rem;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.playlist__tab:hover {
  color: var(--color-text);
}

.playlist__tab--active {
  color: var(--color-accent);
  background: var(--color-surface);
}

.playlist__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-3);
}

.playlist__list li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.88rem;
  color: var(--color-text);
  transition: background 0.15s;
}

.playlist__liked {
  color: var(--color-accent);
  margin-left: var(--space-1);
  vertical-align: middle;
}

.playlist__remove {
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.playlist__list li:hover .playlist__remove {
  opacity: 1;
}

.playlist__remove:hover {
  color: var(--color-accent);
}

.playlist__list li:hover {
  background: var(--color-surface);
}

.playlist__item--active {
  color: var(--color-accent);
}

.playlist__idx {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.playlist__item--active .playlist__idx {
  color: var(--color-accent);
}

.playlist__artist {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.overlay-enter-active,
.overlay-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.slide-enter-active,
.slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

@media (max-width: 720px) {
  .full__main {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: var(--space-5);
    padding: var(--space-6) var(--space-4) var(--space-3);
  }

  .art {
    width: 200px;
    height: 200px;
  }

  .spectrum {
    width: 160px;
    height: 36px;
  }

  .now-playing__title {
    font-size: 1rem;
  }

  .now-playing__artist {
    font-size: 0.76rem;
  }

  .lyrics {
    height: 180px;
    width: 100%;
  }

  .lyrics__line {
    font-size: 0.9rem;
  }

  .lyrics__line--active {
    font-size: 1rem;
  }

  .controls {
    padding-inline: var(--space-3);
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  }

  .controls__row {
    gap: var(--space-2);
  }

  .controls__center {
    gap: var(--space-3);
  }

  .controls__side {
    min-width: 0;
    gap: var(--space-1);
  }

  .rate,
  .volume,
  .ctrl--mute,
  .ctrl--remove {
    display: none;
  }

  .ctrl {
    width: 42px;
    height: 42px;
  }

  .ctrl--play {
    width: 54px;
    height: 54px;
  }

  .playlist {
    width: 88%;
    max-width: 360px;
  }

  .playlist__tabs {
    display: none;
  }

  .playlist__list li {
    grid-template-columns: auto 1fr auto;
    gap: var(--space-2);
    padding: var(--space-2);
    font-size: 0.84rem;
  }

  .playlist__artist {
    display: none;
  }

  .playlist__remove {
    opacity: 1;
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
