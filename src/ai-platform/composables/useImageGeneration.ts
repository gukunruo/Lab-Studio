import { ref } from 'vue'
import { generateImage, type ImageGenerationInput, type ImageGenerationResponse } from '../api'

export function useImageGeneration() {
  const generating = ref(false)
  let abortController: AbortController | null = null

  async function generate(
    input: Omit<ImageGenerationInput, 'signal'>,
    callbacks: {
      onDone: (result: ImageGenerationResponse) => void
      onError: (message: string) => void
      onAbort: () => void
    },
  ) {
    if (generating.value) return
    generating.value = true
    abortController = new AbortController()

    try {
      const result = await generateImage({ ...input, signal: abortController.signal })
      callbacks.onDone(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        callbacks.onAbort()
      } else {
        callbacks.onError(error instanceof Error ? error.message : '图片生成失败，请稍后重试。')
      }
    } finally {
      generating.value = false
      abortController = null
    }
  }

  function abort() {
    abortController?.abort()
  }

  return { generating, generate, abort }
}
