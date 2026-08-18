import { ref } from 'vue'
import type { ChatMessage, ChatParams } from '../types'
import { streamChat } from '../api'

export function useChat() {
  const streaming = ref(false)
  const error = ref('')
  let abortController: AbortController | null = null

  async function send(
    messages: ChatMessage[],
    modelId: string,
    system: string,
    params: ChatParams,
    callbacks: {
      onToken: (token: string) => void
      onDone: (full: string) => void
      onError: (err: string) => void
    },
  ) {
    if (streaming.value) return
    streaming.value = true
    error.value = ''
    abortController = new AbortController()

    try {
      await streamChat({
        modelId,
        messages,
        system,
        params,
        onToken: callbacks.onToken,
        onDone: callbacks.onDone,
        onError: (err) => {
          error.value = err
          callbacks.onError(err)
        },
        signal: abortController.signal,
      })
    } finally {
      streaming.value = false
      abortController = null
    }
  }

  function abort() {
    abortController?.abort()
  }

  return { streaming, error, send, abort }
}
