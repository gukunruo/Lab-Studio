import { ref, computed, watch, onBeforeUnmount } from 'vue'
import type { ComputedRef } from 'vue'
import type { SimStep } from '@/learn/cc-lab'

// steps 需以 computed 传入（scenario 异步加载，steps 引用会变化）。
export function useSimulator(stepsRef: ComputedRef<SimStep[]>) {
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  const speed = ref(1)
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function stepForward() {
    if (currentIndex.value >= stepsRef.value.length - 1) {
      isPlaying.value = false
      return
    }
    currentIndex.value += 1
  }

  function play() {
    if (currentIndex.value >= stepsRef.value.length - 1) return
    isPlaying.value = true
  }

  function pause() {
    clearTimer()
    isPlaying.value = false
  }

  function reset() {
    clearTimer()
    currentIndex.value = -1
    isPlaying.value = false
  }

  function setSpeed(level: number) {
    speed.value = level
  }

  watch([isPlaying, currentIndex, speed, stepsRef], () => {
    clearTimer()
    if (isPlaying.value && currentIndex.value < stepsRef.value.length - 1) {
      timer = setTimeout(stepForward, 1200 / speed.value)
    } else if (isPlaying.value && currentIndex.value >= stepsRef.value.length - 1) {
      isPlaying.value = false
    }
  })

  onBeforeUnmount(clearTimer)

  const visibleSteps = computed(() => stepsRef.value.slice(0, currentIndex.value + 1))
  const totalSteps = computed(() => stepsRef.value.length)
  const isComplete = computed(() => currentIndex.value >= stepsRef.value.length - 1)

  return {
    currentIndex,
    isPlaying,
    speed,
    visibleSteps,
    totalSteps,
    isComplete,
    play,
    pause,
    stepForward,
    reset,
    setSpeed,
  }
}
