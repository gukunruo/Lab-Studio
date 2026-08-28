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
      onAbort: (full: string) => void
    },
    summary = '',
  ) {
    if (streaming.value) return
    streaming.value = true
    error.value = ''
    abortController = new AbortController()
    let aborted = false
    let settled = false
    abortController.signal.addEventListener('abort', () => {
      aborted = true
    }, { once: true })

    try {
      await streamChat({
        modelId,
        messages,
        system,
        summary,
        params,
        onToken: callbacks.onToken,
        onDone: (full) => {
          settled = true
          if (aborted) callbacks.onAbort(full)
          else callbacks.onDone(full)
        },
        onError: (err) => {
          settled = true
          error.value = err
          callbacks.onError(err)
        },
        signal: abortController.signal,
      })
      if (aborted && !settled) callbacks.onAbort('')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        if (!settled) callbacks.onAbort('')
        return
      }
      const message = e instanceof Error ? e.message : '请求失败'
      error.value = message
      callbacks.onError(message)
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
