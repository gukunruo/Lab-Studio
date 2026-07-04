import { ref, computed, onUnmounted } from 'vue'
import type { Track } from './mock'

export type PlayMode = 'list' | 'single' | 'shuffle'

export const PLAY_MODES: { key: PlayMode; label: string; icon: string }[] = [
  { key: 'list', label: '列表循环', icon: 'repeat' },
  { key: 'single', label: '单曲循环', icon: 'repeat-once' },
  { key: 'shuffle', label: '随机播放', icon: 'shuffle' },
]

export function useAudioPlayer(tracks: Track[]) {
  const audio = new Audio()
  audio.preload = 'metadata'

  const playlist = ref<Track[]>(tracks)
  const currentIndex = ref(0)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const playbackRate = ref(1)
  const volume = ref(0.8)
  const noAudio = ref(false)
  const playMode = ref<PlayMode>('list')

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
    try {
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

  // index of the next track according to the current play mode
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

  load(0)

  onUnmounted(() => {
    audio.pause()
    audio.src = ''
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
  }
}
