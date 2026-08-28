import { ref, watch, onBeforeUnmount } from 'vue'

interface SteppedVisualizationOptions {
  totalSteps: number
  autoPlayInterval?: number
}

export function useSteppedVisualization({
  totalSteps,
  autoPlayInterval = 2000,
}: SteppedVisualizationOptions) {
  const currentStep = ref(0)
  const isPlaying = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function next() {
    currentStep.value = Math.min(currentStep.value + 1, totalSteps - 1)
  }

  function prev() {
    currentStep.value = Math.max(currentStep.value - 1, 0)
  }

  function reset() {
    currentStep.value = 0
    isPlaying.value = false
  }

  function goToStep(step: number) {
    currentStep.value = Math.max(0, Math.min(step, totalSteps - 1))
  }

  function toggleAutoPlay() {
    isPlaying.value = !isPlaying.value
  }

  watch(isPlaying, (playing) => {
    clearTimer()
    if (playing) {
      timer = setInterval(() => {
        if (currentStep.value >= totalSteps - 1) {
          isPlaying.value = false
          return
        }
        currentStep.value += 1
      }, autoPlayInterval)
    }
  })

  onBeforeUnmount(clearTimer)

  return {
    currentStep,
    next,
    prev,
    reset,
    goToStep,
    isPlaying,
    toggleAutoPlay,
  }
}
