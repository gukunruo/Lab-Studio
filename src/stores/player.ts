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

type Persisted = { volume?: number; playMode?: PlayMode }
type Progress = { collectionKey: 'liked' | 'roco'; currentIndex: number; currentTime: number }

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
let savedProgress = readJSON<Progress | null>(PROGRESS_KEY, null)

// Single Audio instance + reactive state at module scope — survives route
// changes (the store never unmounts) and is HMR-safe enough for dev.
const audio = new Audio()
audio.preload = 'metadata'

const COLLECTIONS = [
  { key: 'liked', label: '我喜欢', tracks },
  { key: 'roco', label: '洛克王国', tracks: rocoTracks },
] as const

const likedIds = ref<string[]>(savedLiked)
const dislikedIds = ref<string[]>(savedDisliked)

function filterDisliked(arr: Track[]): Track[] {
  return arr.filter((t) => !dislikedIds.value.includes(t.id))
}

const initKey = savedProgress?.collectionKey ?? 'liked'
const initTracks = filterDisliked(
  (COLLECTIONS.find((c) => c.key === initKey) ?? COLLECTIONS[0]).tracks,
)
const playlist = ref<Track[]>(initTracks)
const collectionKey = ref<'liked' | 'roco'>(initKey)
const currentIndex = ref(
  savedProgress ? Math.min(savedProgress.currentIndex, initTracks.length - 1) : -1,
)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const volume = ref(typeof persisted.volume === 'number' ? persisted.volume : 0.8)
const noAudio = ref(false)
const playMode = ref<PlayMode>(persisted.playMode ?? 'list')

const showFullPlayer = ref(false)
const showPlaylist = ref(false)

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

function switchCollection(key: 'liked' | 'roco') {
  const c = COLLECTIONS.find((c) => c.key === key)
  if (!c) return
  collectionKey.value = key
  playlist.value = filterDisliked(c.tracks)
  currentIndex.value = 0
  load(0)
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

// Web Audio graph for spectrum visualization. Created lazily on first
// play() (user gesture) so AudioContext starts unlocked. source→analyser→
// destination keeps audio audible while exposing frequency data.
let audioCtx: AudioContext | null = null
let analyserNode: AnalyserNode | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
const analyserRef = ref<AnalyserNode | null>(null)

function ensureAudioGraph() {
  if (audioCtx) return
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    audioCtx = new AC()
    sourceNode = audioCtx.createMediaElementSource(audio)
    analyserNode = audioCtx.createAnalyser()
    analyserNode.fftSize = 64
    analyserNode.smoothingTimeConstant = 0.8
    sourceNode.connect(analyserNode)
    analyserNode.connect(audioCtx.destination)
    analyserRef.value = analyserNode
  } catch {}
}

// restore last track + position; do not autoplay (browser gesture policy)
load(currentIndex.value)

export const usePlayerStore = defineStore('player', () => {
  watch([volume, playMode], () => {
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ volume: volume.value, playMode: playMode.value }),
      )
    } catch {}
  })

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
