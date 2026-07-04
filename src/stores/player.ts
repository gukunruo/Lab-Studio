import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { tracks, type Track } from '@/data/tracks'
import { rocoTracks } from '@/data/roco-tracks'

export type PlayMode = 'list' | 'single' | 'shuffle'

export const PLAY_MODES: { key: PlayMode; label: string }[] = [
  { key: 'list', label: '列表循环' },
  { key: 'single', label: '单曲循环' },
  { key: 'shuffle', label: '随机播放' },
]

const PERSIST_KEY = 'lab-player'
const LIKED_KEY = 'lab-player-liked'
const DISLIKED_KEY = 'lab-player-disliked'
const PROGRESS_KEY = 'lab-player-progress'

type Persisted = { volume?: number; playMode?: PlayMode; eqGains?: number[]; eqEnabled?: boolean }
type Progress = { collectionKey: 'all' | 'roco'; currentIndex: number; currentTime: number }

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {}
  return fallback
}

const persisted = readJSON<Persisted>(PERSIST_KEY, {})
const savedLiked = readJSON<string[]>(LIKED_KEY, [])
const savedDisliked = readJSON<string[]>(DISLIKED_KEY, [])
const savedProgress = readJSON<Progress | null>(PROGRESS_KEY, null)

// Single Audio instance + reactive state at module scope — survives route
// changes (the store never unmounts) and is HMR-safe enough for dev.
const audio = new Audio()
audio.preload = 'metadata'

// 全部 = liked + roco 按 id 去重(liked 与 roco 共享 4 个 id → 108 首)
const allTracks: Track[] = [...tracks, ...rocoTracks].filter(
  (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i,
)

const COLLECTIONS = [
  { key: 'all', label: '全部', tracks: allTracks },
  { key: 'roco', label: '洛克王国', tracks: rocoTracks },
] as const

const likedIds = ref<string[]>(savedLiked)
const dislikedIds = ref<string[]>(savedDisliked)

function filterDisliked(arr: Track[]): Track[] {
  return arr.filter((t) => !dislikedIds.value.includes(t.id))
}

const initKey = savedProgress?.collectionKey === 'roco' ? 'roco' : 'all'
const initTracks = filterDisliked(
  (COLLECTIONS.find((c) => c.key === initKey) ?? COLLECTIONS[0]).tracks,
)
const playlist = ref<Track[]>(initTracks)
const collectionKey = ref<'all' | 'roco'>(initKey)
const currentIndex = ref(
  savedProgress ? Math.min(savedProgress.currentIndex, initTracks.length - 1) : -1,
)
const isPlaying = ref(false)
const isBuffering = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const volume = ref(typeof persisted.volume === 'number' ? persisted.volume : 0.8)
const noAudio = ref(false)
const playMode = ref<PlayMode>(persisted.playMode ?? 'list')
const eqGains = ref<number[]>(persisted.eqGains ?? [0, 0, 0, 0, 0])
const eqEnabled = ref(persisted.eqEnabled ?? false)

const showFullPlayer = ref(false)
const showPlaylist = ref(false)
const sleepTimer = ref<number | null>(null) // 剩余秒数,null=未启用
let sleepTimerId: ReturnType<typeof setInterval> | null = null

const current = computed<Track | null>(() => playlist.value[currentIndex.value] ?? null)

function load(index: number) {
  const track = playlist.value[index]
  if (!track) return
  currentIndex.value = index
  audio.src = track.src
  audio.playbackRate = playbackRate.value
  audio.volume = volume.value
  currentTime.value = 0
  noAudio.value = false
  isBuffering.value = true
}

async function play() {
  if (!audio.src) load(currentIndex.value)
  ensureAudioGraph()
  try {
    await audioCtx?.resume()
    await audio.play()
    isPlaying.value = true
  } catch {
    isPlaying.value = false
  }
}

function pause() {
  audio.pause()
  isPlaying.value = false
}

function toggle() {
  if (isPlaying.value) pause()
  else play()
}

function nextIndex(from = currentIndex.value) {
  const len = playlist.value.length
  if (len === 0) return 0
  if (playMode.value === 'shuffle') {
    if (len === 1) return from
    let r = from
    while (r === from) r = Math.floor(Math.random() * len)
    return r
  }
  return (from + 1) % len
}

function prevIndex(from = currentIndex.value) {
  const len = playlist.value.length
  if (len === 0) return 0
  if (playMode.value === 'shuffle') return nextIndex(from)
  return (from - 1 + len) % len
}

function next() {
  load(nextIndex())
  if (isPlaying.value) play()
}

function prev() {
  if (currentTime.value > 3) {
    audio.currentTime = 0
    return
  }
  load(prevIndex())
  if (isPlaying.value) play()
}

function seek(time: number) {
  audio.currentTime = time
  currentTime.value = time
}

function setRate(rate: number) {
  playbackRate.value = rate
  audio.playbackRate = rate
}

function setVolume(v: number) {
  volume.value = v
  audio.volume = v
}

function playTrack(index: number) {
  load(index)
  play()
}

function cyclePlayMode() {
  const order: PlayMode[] = ['list', 'single', 'shuffle']
  playMode.value = order[(order.indexOf(playMode.value) + 1) % order.length] ?? 'list'
}

function startSleepTimer(minutes: number) {
  stopSleepTimer()
  sleepTimer.value = minutes * 60
  sleepTimerId = setInterval(() => {
    if (sleepTimer.value === null) return
    sleepTimer.value--
    if (sleepTimer.value <= 0) {
      pause()
      stopSleepTimer()
    }
  }, 1000)
}
function stopSleepTimer() {
  if (sleepTimerId) clearInterval(sleepTimerId)
  sleepTimerId = null
  sleepTimer.value = null
}

function switchCollection(key: 'all' | 'roco') {
  const c = COLLECTIONS.find((c) => c.key === key)
  if (!c) return
  collectionKey.value = key
  playlist.value = filterDisliked(c.tracks)
  currentIndex.value = 0
  load(0)
  if (isPlaying.value) play()
}

function toggleLike(id: string) {
  const i = likedIds.value.indexOf(id)
  if (i >= 0) likedIds.value.splice(i, 1)
  else likedIds.value = [...likedIds.value, id]
  try {
    localStorage.setItem(LIKED_KEY, JSON.stringify(likedIds.value))
  } catch {}
}

function removeFromPlaylist(id: string) {
  const idx = playlist.value.findIndex((t) => t.id === id)
  if (idx < 0) return
  const wasCurrent = idx === currentIndex.value
  playlist.value = playlist.value.filter((_, i) => i !== idx)
  if (!dislikedIds.value.includes(id)) {
    dislikedIds.value = [...dislikedIds.value, id]
    try {
      localStorage.setItem(DISLIKED_KEY, JSON.stringify(dislikedIds.value))
    } catch {}
  }
  if (playlist.value.length === 0) {
    currentIndex.value = 0
    return
  }
  if (wasCurrent) {
    const ni = Math.min(idx, playlist.value.length - 1)
    currentIndex.value = ni
    load(ni)
    if (isPlaying.value) play()
  } else if (idx < currentIndex.value) {
    currentIndex.value--
  }
}

audio.addEventListener('timeupdate', () => {
  currentTime.value = audio.currentTime
})
let pendingSeek: number | null = savedProgress?.currentTime ?? null
audio.addEventListener('loadedmetadata', () => {
  duration.value = audio.duration || 0
  if (pendingSeek != null && pendingSeek > 0 && pendingSeek < (audio.duration || 0)) {
    audio.currentTime = pendingSeek
    currentTime.value = pendingSeek
  }
  pendingSeek = null
})
audio.addEventListener('durationchange', () => {
  duration.value = audio.duration || 0
})
audio.addEventListener('ended', () => {
  if (playMode.value === 'single') {
    audio.currentTime = 0
    play()
  } else {
    load(nextIndex())
    play()
  }
})
audio.addEventListener('play', () => {
  isPlaying.value = true
})
audio.addEventListener('pause', () => {
  isPlaying.value = false
})
audio.addEventListener('error', () => {
  noAudio.value = true
  isPlaying.value = false
})
audio.addEventListener('waiting', () => {
  isBuffering.value = true
})
audio.addEventListener('playing', () => {
  isBuffering.value = false
})
audio.addEventListener('canplay', () => {
  isBuffering.value = false
})

// Web Audio graph for spectrum visualization. Created lazily on first
// play() (user gesture) so AudioContext starts unlocked. source→EQ chain→
// analyser→destination keeps audio audible while exposing frequency data.
const EQ_FREQS = [60, 230, 910, 3600, 14000] as const
export const EQ_PRESETS: { key: string; label: string; gains: number[] }[] = [
  { key: 'flat', label: '平直', gains: [0, 0, 0, 0, 0] },
  { key: 'vocal', label: '人声', gains: [-2, -1, 2, 3, 2] },
  { key: 'bass', label: '低音', gains: [6, 4, 0, -1, -2] },
  { key: 'treble', label: '高音', gains: [-1, -1, 0, 3, 6] },
  { key: 'live', label: '现场', gains: [3, -1, -2, 2, 4] },
]
const eqFreqs = ref(EQ_FREQS)

let audioCtx: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
const filterNodes: BiquadFilterNode[] = []
const analyserRef = ref<AnalyserNode | null>(null)

function ensureAudioGraph() {
  if (audioCtx) return
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    audioCtx = new AC()
    sourceNode = audioCtx.createMediaElementSource(audio)
    for (const freq of EQ_FREQS) {
      const f = audioCtx.createBiquadFilter()
      f.type = 'peaking'
      f.frequency.value = freq
      f.Q.value = 1
      f.gain.value = eqEnabled.value ? eqGains.value[EQ_FREQS.indexOf(freq)] ?? 0 : 0
      filterNodes.push(f)
    }
    analyserNode = audioCtx.createAnalyser()
    analyserNode.fftSize = 64
    analyserNode.smoothingTimeConstant = 0.8
    let prev: AudioNode = sourceNode
    for (const f of filterNodes) {
      prev.connect(f)
      prev = f
    }
    prev.connect(analyserNode)
    analyserNode.connect(audioCtx.destination)
    analyserRef.value = analyserNode
  } catch {}
}

function setEqBand(index: number, gain: number) {
  if (!filterNodes[index]) return
  eqGains.value[index] = gain
  filterNodes[index].gain.value = eqEnabled.value ? gain : 0
}
function applyEqPreset(gains: number[]) {
  for (let i = 0; i < EQ_FREQS.length; i++) eqGains.value[i] = gains[i] ?? 0
  eqEnabled.value = true
  for (let i = 0; i < filterNodes.length; i++) {
    filterNodes[i]!.gain.value = eqGains.value[i] ?? 0
  }
}
function toggleEq() {
  eqEnabled.value = !eqEnabled.value
  for (let i = 0; i < filterNodes.length; i++) {
    filterNodes[i]!.gain.value = eqEnabled.value ? (eqGains.value[i] ?? 0) : 0
  }
}

// restore last track + position; do not autoplay (browser gesture policy)
load(currentIndex.value)

export const usePlayerStore = defineStore('player', () => {
  watch([volume, playMode, eqGains, eqEnabled], () => {
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({
          volume: volume.value,
          playMode: playMode.value,
          eqGains: eqGains.value,
          eqEnabled: eqEnabled.value,
        }),
      )
    } catch {}
  }, { deep: true })

  let progressTimer: ReturnType<typeof setTimeout> | null = null
  watch([collectionKey, currentIndex, currentTime], () => {
    if (progressTimer) clearTimeout(progressTimer)
    progressTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          PROGRESS_KEY,
          JSON.stringify({
            collectionKey: collectionKey.value,
            currentIndex: currentIndex.value,
            currentTime: currentTime.value,
          }),
        )
      } catch {}
    }, 1500)
  })

  return {
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
    showFullPlayer,
    showPlaylist,
    analyser: analyserRef,
    collectionKey,
    collections: COLLECTIONS,
    switchCollection,
    likedIds,
    dislikedIds,
    isLiked: (id: string) => likedIds.value.includes(id),
    toggleLike,
    removeFromPlaylist,
    play,
    pause,
    toggle,
    next,
    prev,
    seek,
    setRate,
    setVolume,
    playTrack,
    cyclePlayMode,
    eqGains,
    eqEnabled,
    eqFreqs,
    setEqBand,
    applyEqPreset,
    toggleEq,
    sleepTimer,
    startSleepTimer,
    stopSleepTimer,
    openFull: () => {
      showFullPlayer.value = true
    },
    closeFull: () => {
      showFullPlayer.value = false
    },
    togglePlaylist: () => {
      showPlaylist.value = !showPlaylist.value
    },
  }
})
