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
  PhMagnifyingGlass,
  PhSliders,
  PhMoon,
  PhWaveform,
} from '@phosphor-icons/vue'
import { usePlayerStore, EQ_PRESETS } from '@/stores/player'
import type { Track } from '@/data/tracks'

const player = usePlayerStore()
const {
  playlist,
  current,
  currentIndex,
  isPlaying,
  isBuffering,
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
  eqGains,
  eqEnabled,
  eqFreqs,
  sleepTimer,
} = storeToRefs(player)

const lyricsEl = ref<HTMLElement | null>(null)
const prevVolume = ref(0.8)
const showShortcuts = ref(false)
const showEq = ref(false)
const showSleep = ref(false)
const showRate = ref(false)
type SpectrumMode = 'bars' | 'mirror' | 'orbit'
const spectrumMode = ref<SpectrumMode>('bars')
function cycleSpectrumMode() {
  const order: SpectrumMode[] = ['bars', 'mirror', 'orbit']
  spectrumMode.value = order[(order.indexOf(spectrumMode.value) + 1) % 3]!
}
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

let userScrolled = false
let resumeTimer: ReturnType<typeof setTimeout> | null = null

function onLyricsWheel() {
  userScrolled = true
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = setTimeout(() => {
    userScrolled = false
    scrollLyric()
  }, 3000)
}

function onLyricClick(time: number) {
  userScrolled = false
  if (resumeTimer) {
    clearTimeout(resumeTimer)
    resumeTimer = null
  }
  player.seek(time)
}

async function scrollLyric(i?: number) {
  if (userScrolled) return
  const idx = i ?? activeLyricIndex.value
  await nextTick()
  const c = lyricsEl.value
  if (!c) return
  const line = c.children[idx] as HTMLElement | undefined
  if (!line) return
  const top = line.offsetTop - c.clientHeight / 2 + line.clientHeight / 2
  c.scrollTo({ top, behavior: 'smooth' })
}

watch(activeLyricIndex, () => scrollLyric())
watch(currentIndex, () => {
  userScrolled = false
  if (resumeTimer) {
    clearTimeout(resumeTimer)
    resumeTimer = null
  }
  scrollLyric()
})

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function formatSleep(s: number): string {
  return Math.ceil(s / 60) + 'm'
}
function formatFreq(f: number): string {
  return f >= 1000 ? f / 1000 + 'k' : String(f)
}
function onEqBand(i: number, e: Event) {
  player.setEqBand(i, Number((e.target as HTMLInputElement).value))
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
  return vibePalette[h % vibePalette.length] ?? '#2dd4bf'
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
    case 'Slash':
      if (e.shiftKey) {
        e.preventDefault()
        showShortcuts.value = !showShortcuts.value
      }
      break
    case 'Escape':
      if (showShortcuts.value) showShortcuts.value = false
      else if (showEq.value) showEq.value = false
      else if (showSleep.value) showSleep.value = false
      else if (showRate.value) showRate.value = false
      else if (showPlaylist.value) player.togglePlaylist()
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
let freqBuf: Uint8Array<ArrayBuffer> | null = null
function loop() {
  const an = analyser.value
  if (an) {
    if (!freqBuf || freqBuf.length !== an.frequencyBinCount) {
      freqBuf = new Uint8Array(an.frequencyBinCount)
    }
    an.getByteFrequencyData(freqBuf)
  } else {
    freqBuf = null
  }

  if (freqBuf) {
    const step = Math.max(1, Math.floor(freqBuf.length / BARS))
    const prev = bars.value
    const next = Array(BARS).fill(0)
    const half = BARS / 2
    const halfBins: number[] = []
    for (let i = 0; i < half; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) sum += freqBuf[i * step + j] || 0
      halfBins.push(Math.min(1, sum / step / 255))
    }
    for (let i = 0; i < BARS; i++) {
      let target: number
      if (spectrumMode.value === 'bars') {
        const binIdx = Math.min(i, freqBuf.length - 1)
        let sum = 0
        for (let j = 0; j < step; j++) sum += freqBuf[binIdx * step + j] || 0
        target = Math.min(1, sum / step / 255)
      } else {
        const binIdx = i < half ? half - 1 - i : i - half
        target = halfBins[binIdx] ?? 0
      }
      const pv = prev[i] ?? 0
      next[i] = target >= pv ? target : Math.max(target, pv * 0.88)
    }
    bars.value = next
  }
  raf = requestAnimationFrame(loop)
}
watch(showFullPlayer, (v) => {
  if (v) {
    raf = requestAnimationFrame(loop)
    userScrolled = false
    if (resumeTimer) {
      clearTimeout(resumeTimer)
      resumeTimer = null
    }
    nextTick(() => scrollLyric())
  } else cancelAnimationFrame(raf)
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
          class="full__help"
          :class="{ 'full__help--hidden': showPlaylist }"
          @click="showShortcuts = !showShortcuts"
          aria-label="键盘快捷键"
          title="键盘快捷键"
        >
          ?
        </button>
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
            <div class="art" :class="{ 'art--playing': isPlaying, 'art--buffering': isBuffering }">
              <div class="art__vinyl"></div>
              <img class="art__cover" :src="current.cover" :alt="current.title" loading="lazy" />
              <div v-if="spectrumMode === 'orbit'" class="spectrum spectrum--orbit">
                <span
                  v-for="(b, i) in bars"
                  :key="i"
                  class="spectrum__bar spectrum__bar--orbit"
                  :style="{ transform: `rotate(${i * 11.25}deg) translateY(-150px) scaleY(${b})` }"
                />
              </div>
            </div>
            <div v-if="spectrumMode !== 'orbit'" class="spectrum">
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

          <div class="lyrics" ref="lyricsEl" @wheel.passive="onLyricsWheel" @touchmove.passive="onLyricsWheel">
            <p
              v-for="(line, i) in current.lyrics"
              :key="i"
              :class="['lyrics__line', { 'lyrics__line--active': i === activeLyricIndex }]"
              @click="onLyricClick(line.time)"
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
              <span v-if="hoverTime !== null" class="progress__tip" :style="{ left: hoverPct + '%' }">
                {{ formatTime(hoverTime) }}
              </span>
            </div>
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
              <div class="rate">
                <button
                  class="ctrl rate__btn"
                  :class="{ 'ctrl--active': playbackRate !== 1 }"
                  @click="showRate = !showRate"
                  aria-label="倍速"
                  title="倍速"
                >
                  {{ playbackRate }}x
                </button>
                <div v-if="showRate" class="rate__backdrop" @click="showRate = false" />
                <div v-if="showRate" class="rate__menu">
                  <button
                    v-for="r in rates"
                    :key="r"
                    class="rate__item"
                    :class="{ 'rate__item--active': r === playbackRate }"
                    @click="player.setRate(r); showRate = false"
                  >
                    {{ r }}x
                  </button>
                </div>
              </div>
              <button
                class="ctrl"
                :class="{ 'ctrl--active': eqEnabled }"
                @click="showEq = !showEq"
                aria-label="均衡器"
                title="均衡器"
              >
                <PhSliders :size="18" />
              </button>
              <button
                class="ctrl"
                :class="{ 'ctrl--active': spectrumMode !== 'bars' }"
                @click="cycleSpectrumMode"
                aria-label="频谱样式"
                :title="spectrumMode === 'bars' ? '频谱:经典' : spectrumMode === 'mirror' ? '频谱:对称' : '频谱:环绕'"
              >
                <PhWaveform :size="18" />
              </button>
              <button
                class="ctrl"
                :class="{ 'ctrl--active': sleepTimer !== null }"
                @click="showSleep = !showSleep"
                aria-label="睡眠定时器"
                title="睡眠定时器"
              >
                <PhMoon :size="18" />
                <span v-if="sleepTimer !== null" class="ctrl__time">{{ formatSleep(sleepTimer) }}</span>
              </button>
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
              <div class="vol">
                <button class="ctrl ctrl--mute" @click="toggleMute" :aria-label="volume > 0 ? '静音' : '取消静音'">
                  <component :is="volume > 0 ? PhSpeakerHigh : PhSpeakerSlash" :size="18" />
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
              <div class="playlist__search-wrap">
                <PhMagnifyingGlass :size="16" class="playlist__search-icon" />
                <input
                  class="playlist__search"
                  v-model="searchQuery"
                  placeholder="歌曲 / 艺人 / 专辑"
                  aria-label="搜索歌单"
                />
              </div>
              <div class="playlist__tabs-row">
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

        <transition name="overlay">
          <div v-if="showShortcuts" class="shortcuts" @click.self="showShortcuts = false">
            <div class="shortcuts__panel">
              <div class="shortcuts__head">
                <span>键盘快捷键</span>
                <button class="shortcuts__close" @click="showShortcuts = false" aria-label="关闭">
                  <PhX :size="18" />
                </button>
              </div>
              <ul class="shortcuts__list">
                <li><kbd>Space</kbd><span>播放 / 暂停</span></li>
                <li><kbd>←</kbd><span>后退 5 秒</span></li>
                <li><kbd>→</kbd><span>前进 5 秒</span></li>
                <li><kbd>↑</kbd><span>音量 +</span></li>
                <li><kbd>↓</kbd><span>音量 −</span></li>
                <li><kbd>M</kbd><span>静音切换</span></li>
                <li><kbd>N</kbd><span>下一曲</span></li>
                <li><kbd>P</kbd><span>上一曲</span></li>
                <li><kbd>?</kbd><span>开关此面板</span></li>
                <li><kbd>Esc</kbd><span>关闭面板 / 播放列表 / 全屏</span></li>
              </ul>
            </div>
          </div>
        </transition>

        <transition name="overlay">
          <div v-if="showEq" class="eq" @click.self="showEq = false">
            <div class="eq__panel">
              <div class="eq__head">
                <span>均衡器</span>
                <button
                  class="eq__toggle"
                  :class="{ 'eq__toggle--on': eqEnabled }"
                  @click="player.toggleEq()"
                >
                  {{ eqEnabled ? '已启用' : '已关闭' }}
                </button>
              </div>
              <div class="eq__bands">
                <div v-for="(g, i) in eqGains" :key="i" class="eq__band">
                  <span class="eq__freq">{{ formatFreq(eqFreqs[i] ?? 0) }}</span>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    :value="g"
                    class="eq__slider"
                    @input="onEqBand(i, $event)"
                  />
                  <span class="eq__gain">{{ g > 0 ? '+' : '' }}{{ g }}dB</span>
                </div>
              </div>
              <div class="eq__presets">
                <button
                  v-for="p in EQ_PRESETS"
                  :key="p.key"
                  class="eq__preset"
                  @click="player.applyEqPreset(p.gains)"
                >
                  {{ p.label }}
                </button>
              </div>
            </div>
          </div>
        </transition>

        <transition name="overlay">
          <div v-if="showSleep" class="sleep" @click.self="showSleep = false">
            <div class="sleep__panel">
              <div class="sleep__head">睡眠定时器</div>
              <div class="sleep__options">
                <button
                  v-for="m in [15, 30, 45, 60, 90]"
                  :key="m"
                  class="sleep__opt"
                  @click="player.startSleepTimer(m); showSleep = false"
                >
                  {{ m }} 分钟
                </button>
              </div>
              <button
                v-if="sleepTimer !== null"
                class="sleep__cancel"
                @click="player.stopSleepTimer(); showSleep = false"
              >
                取消定时
              </button>
            </div>
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
  transition: opacity 0.3s ease;
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

.full__help {
  position: absolute;
  top: max(var(--space-4), env(safe-area-inset-top));
  right: calc(max(var(--space-5), env(safe-area-inset-right)) + 52px);
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
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.full__help--hidden {
  opacity: 0;
  pointer-events: none;
  transform: scale(0.9);
}

.full__help:hover {
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
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--vibe, var(--color-accent)) 30%, transparent),
    var(--vibe, var(--color-accent))
  );
  border-radius: 2px;
  transform-origin: bottom center;
  opacity: 0.9;
  transition: transform 0.08s ease-out;
}

.spectrum--orbit {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  gap: 0;
  pointer-events: none;
}

.spectrum__bar--orbit {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 40px;
  margin-left: -1.5px;
  margin-top: -20px;
  transform-origin: center;
  background: linear-gradient(to top, transparent, var(--vibe, var(--color-accent)));
  border-radius: 2px;
  transition: transform 0.08s ease-out;
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

.art--buffering .art__cover {
  animation: buffering-pulse 1.2s ease-in-out infinite;
}

@keyframes buffering-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 0.9;
  }
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
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 0.2rem 0.5rem;
  background: var(--color-text);
  color: var(--color-bg);
  border-radius: var(--radius-sm);
  pointer-events: none;
  white-space: nowrap;
  z-index: 2;
}

.progress-wrap--buffering .progress {
  background: repeating-linear-gradient(
    45deg,
    var(--color-accent) 0 4px,
    var(--color-border) 4px 8px
  );
  background-size: 11.3px 11.3px;
  animation: buffering-stripes 0.6s linear infinite;
}

@keyframes buffering-stripes {
  to {
    background-position: 11.3px 0;
  }
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
  width: 30px;
  height: 100px;
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
  width: 84px;
  height: 4px;
  transform: rotate(-90deg);
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
  position: relative;
}

.rate__btn {
  min-width: 42px;
  justify-content: center;
  font-family: var(--font-mono);
}

.rate__menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 12;
  min-width: 64px;
}

.rate__backdrop {
  position: fixed;
  inset: 0;
  z-index: 11;
}

.rate__item {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.rate__item:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.rate__item--active {
  color: var(--color-accent);
  font-weight: 600;
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
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 1;
}

.playlist__search-wrap {
  position: relative;
  width: 100%;
}

.playlist__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
  transition: color 0.2s;
}

.playlist__search-wrap:focus-within .playlist__search-icon {
  color: var(--color-accent);
}

.playlist__search {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: 0.45rem 0.8rem 0.45rem 2.1rem;
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s;
}

.playlist__search:focus {
  border-color: var(--color-accent);
}

.playlist__search::placeholder {
  color: var(--color-text-muted);
}

.playlist__tabs-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: center;
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

  .playlist__tabs-row {
    justify-content: flex-end;
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

.ctrl__time {
  position: absolute;
  bottom: -3px;
  right: -3px;
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 700;
  color: var(--color-accent);
  background: var(--color-bg);
  padding: 0 3px;
  border-radius: var(--radius-sm);
  line-height: 1.4;
  border: 1px solid var(--color-border);
}

.eq,
.sleep {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: var(--space-4);
}

.eq__panel,
.sleep__panel {
  width: 100%;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  padding: var(--space-5);
}

.eq__panel {
  max-width: 460px;
}

.sleep__panel {
  max-width: 360px;
}

.eq__head,
.sleep__head {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-4);
}

.eq__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eq__toggle {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s,
    background 0.2s;
}

.eq__toggle--on {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.eq__bands {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.eq__band {
  display: grid;
  grid-template-columns: 50px 1fr 48px;
  align-items: center;
  gap: var(--space-3);
}

.eq__freq {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.eq__gain {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text);
  text-align: right;
}

.eq__slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: var(--color-border);
  cursor: pointer;
  outline: none;
}

.eq__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.eq__slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-accent);
  border: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

.eq__presets {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.eq__preset {
  flex: 1;
  min-width: 56px;
  padding: 0.35rem 0.5rem;
  font-size: 0.74rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.eq__preset:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.sleep__options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.sleep__opt {
  padding: 0.5rem 0.4rem;
  font-size: 0.78rem;
  font-family: var(--font-mono);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.sleep__opt:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.sleep__cancel {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.sleep__cancel:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .art--playing .art__vinyl {
    animation: none;
  }

  .art--buffering .art__cover,
  .progress-wrap--buffering .progress {
    animation: none;
  }

  .lyrics {
    scroll-behavior: auto;
  }
}

.shortcuts {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: var(--space-4);
}

.shortcuts__panel {
  width: 100%;
  max-width: 420px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.shortcuts__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.shortcuts__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition:
    color 0.2s,
    background 0.2s;
}

.shortcuts__close:hover {
  color: var(--color-accent);
  background: var(--color-surface);
}

.shortcuts__list {
  list-style: none;
  margin: 0;
  padding: var(--space-2);
}

.shortcuts__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: 0.84rem;
  color: var(--color-text);
  transition: background 0.15s;
}

.shortcuts__list li:hover {
  background: var(--color-surface);
}

.shortcuts__list kbd {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-bottom-width: 2px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  min-width: 28px;
  text-align: center;
}
</style>
