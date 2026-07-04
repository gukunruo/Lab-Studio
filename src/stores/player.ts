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

type Persisted = { volume?: number; playMode?: PlayMode }

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch {}
  return {}
}

const persisted = readPersisted()

// Single Audio instance + reactive state at module scope — survives route
// changes (the store never unmounts) and is HMR-safe enough for dev.
const audio = new Audio()
audio.preload = 'metadata'

const playlist = ref<Track[]>(tracks)
const COLLECTIONS = [
  { key: 'liked', label: '我喜欢', tracks },
  { key: 'roco', label: '洛克王国', tracks: rocoTracks },
] as const
const collectionKey = ref<'liked' | 'roco'>('liked')
const currentIndex = ref(0)
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
  playlist.value = c.tracks
  currentIndex.value = 0
  load(0)
}

audio.addEventListener('timeupdate', () => {
  currentTime.value = audio.currentTime
})
audio.addEventListener('loadedmetadata', () => {
  duration.value = audio.duration || 0
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

// load track 0 but do not autoplay — respects browser gesture policy
load(0)

export const usePlayerStore = defineStore('player', () => {
  watch([volume, playMode], () => {
    try {
      localStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ volume: volume.value, playMode: playMode.value }),
      )
    } catch {}
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
