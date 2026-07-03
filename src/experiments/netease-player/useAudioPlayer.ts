import { ref, computed, onUnmounted } from 'vue'
import type { Track } from './mock'

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

  function next() {
    load((currentIndex.value + 1) % playlist.value.length)
    if (isPlaying.value) play()
  }

  function prev() {
    if (currentTime.value > 3) {
      audio.currentTime = 0
      return
    }
    load((currentIndex.value - 1 + playlist.value.length) % playlist.value.length)
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
    next()
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
    play,
    pause,
    toggle,
    next,
    prev,
    seek,
    setRate,
    setVolume,
    playTrack,
  }
}
