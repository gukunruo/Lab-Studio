import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { lessons, nextIncomplete } from '@/learn/curriculum'
import type { ChatMessage } from '@/learn/ai'

const STORAGE_KEY = 'lab-ai-academy-progress'
const CHAT_CAP = 50
const USER_KEY = 'local-user'

function syncProgress(payload: ProgressPayload): void {
  void fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userKey: USER_KEY, ...payload }),
  }).catch(() => undefined)
}

function syncChat(lessonId: string, messages: ChatMessage[]): void {
  void fetch(`/api/chat-sessions/${encodeURIComponent(lessonId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userKey: USER_KEY, messages }),
  }).catch(() => undefined)
}

async function hydrateRemote(
  apply: (payload: ProgressPayload) => void,
  applyChats: (chats: Record<string, ChatMessage[]>) => void,
): Promise<void> {
  try {
    const [progressRes, chatsRes] = await Promise.all([
      fetch(`/api/progress?userKey=${encodeURIComponent(USER_KEY)}`),
      fetch(`/api/chat-sessions?userKey=${encodeURIComponent(USER_KEY)}`),
    ])
    if (progressRes.ok) {
      const remote = await progressRes.json() as ProgressPayload | null
      if (remote?.updatedAt) apply(remote)
    }
    if (chatsRes.ok) {
      const rows = await chatsRes.json() as Array<{ lessonId: string; messages: ChatMessage[] }>
      applyChats(Object.fromEntries(rows.map((row) => [row.lessonId, row.messages])))
    }
  } catch {
    // localStorage remains the offline fallback
  }
}

function payloadOf(
  completed: string[],
  lastOpened: string | null,
  notes: string,
  stepIndex: Record<string, number>,
  chatHistory: Record<string, ChatMessage[]>,
): ProgressPayload {
  return {
    completed: [...completed],
    lastOpened,
    notes,
    stepIndex: { ...stepIndex },
    chatHistory: { ...chatHistory },
    updatedAt: new Date().toISOString(),
  }
}



type ProgressPayload = {
  completed: string[]
  lastOpened: string | null
  notes: string
  stepIndex: Record<string, number>
  chatHistory: Record<string, ChatMessage[]>
  updatedAt: string
}

function emptyPayload(): ProgressPayload {
  return {
    completed: [],
    lastOpened: null,
    notes: '',
    stepIndex: {},
    chatHistory: {},
    updatedAt: '',
  }
}

function load(): ProgressPayload {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyPayload()
    const parsed = JSON.parse(raw) as Partial<ProgressPayload>
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed : [],
      lastOpened: parsed.lastOpened ?? null,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      stepIndex:
        parsed.stepIndex && typeof parsed.stepIndex === 'object' ? parsed.stepIndex : {},
      chatHistory:
        parsed.chatHistory && typeof parsed.chatHistory === 'object' ? parsed.chatHistory : {},
      updatedAt: parsed.updatedAt ?? '',
    }
  } catch {
    return emptyPayload()
  }
}

export const useAcademyStore = defineStore('ai-academy', () => {
  const initial = load()
  const completed = ref<string[]>(initial.completed)
  const lastOpened = ref<string | null>(initial.lastOpened)
  const notes = ref(initial.notes)
  const stepIndex = ref<Record<string, number>>(initial.stepIndex)
  const chatHistory = ref<Record<string, ChatMessage[]>>(initial.chatHistory)

  const completedSet = computed(() => new Set(completed.value))
  const doneCount = computed(() => completed.value.length)
  const totalCount = lessons.length
  const progressRatio = computed(() => (totalCount ? doneCount.value / totalCount : 0))
  const todayLesson = computed(() => nextIncomplete(completedSet.value))

  function persist() {
    const payload = payloadOf(
      completed.value,
      lastOpened.value,
      notes.value,
      stepIndex.value,
      chatHistory.value,
    )
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    syncProgress(payload)
  }

  watch([completed, lastOpened, notes, stepIndex, chatHistory], persist, { deep: true })

  void hydrateRemote(
    (remote) => {
      completed.value = remote.completed
      lastOpened.value = remote.lastOpened
      notes.value = remote.notes
      stepIndex.value = remote.stepIndex
    },
    (chats) => {
      chatHistory.value = { ...chatHistory.value, ...chats }
    },
  )

  function isDone(id: string) {
    return completedSet.value.has(id)
  }

  function toggleDone(id: string) {
    const i = completed.value.indexOf(id)
    if (i >= 0) completed.value.splice(i, 1)
    else completed.value.push(id)
  }

  function markDone(id: string) {
    if (!completedSet.value.has(id)) completed.value.push(id)
  }

  function openLesson(id: string) {
    lastOpened.value = id
  }

  function getStep(id: string): number {
    return stepIndex.value[id] ?? 0
  }

  function setStep(id: string, i: number) {
    stepIndex.value = { ...stepIndex.value, [id]: i }
  }

  function getChat(id: string): ChatMessage[] {
    return chatHistory.value[id] ?? []
  }

  function addMessage(id: string, msg: ChatMessage) {
    const list = chatHistory.value[id] ? [...chatHistory.value[id]!] : []
    list.push(msg)
    if (list.length > CHAT_CAP) list.splice(0, list.length - CHAT_CAP)
    chatHistory.value = { ...chatHistory.value, [id]: list }
    syncChat(id, list)
  }

  function clearChat(id: string) {
    const next = { ...chatHistory.value }
    delete next[id]
    chatHistory.value = next
    syncChat(id, [])
  }

  function resetProgress() {
    completed.value = []
    lastOpened.value = null
    stepIndex.value = {}
    chatHistory.value = {}
  }

  return {
    completed,
    lastOpened,
    notes,
    stepIndex,
    chatHistory,
    completedSet,
    doneCount,
    totalCount,
    progressRatio,
    todayLesson,
    isDone,
    toggleDone,
    markDone,
    openLesson,
    getStep,
    setStep,
    getChat,
    addMessage,
    clearChat,
    resetProgress,
  }
})
