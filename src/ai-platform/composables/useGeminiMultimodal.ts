import { ref } from 'vue'
import { generateGeminiMultimodal, type GeminiMultimodalResponse } from '../api'
import type { GeminiContextMessage } from '../types'

export function useGeminiMultimodal() {
  const generating = ref(false)
  let abortController: AbortController | null = null

  async function generate(
    input: {
      prompt: string
      referenceImageId?: string
      history?: GeminiContextMessage[]
    },
    callbacks: {
      onDone: (result: GeminiMultimodalResponse) => void
      onError: (message: string) => void
      onAbort: () => void
    },
  ) {
    if (generating.value) return
    generating.value = true
    abortController = new AbortController()

    try {
      const result = await generateGeminiMultimodal({ ...input, signal: abortController.signal })
      callbacks.onDone(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        callbacks.onAbort()
      } else {
        callbacks.onError(error instanceof Error ? error.message : '图片创作失败，请稍后重试。')
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
