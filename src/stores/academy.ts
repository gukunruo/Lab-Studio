import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { lessons, nextIncomplete } from '@/learn/curriculum'
import type { ChatMessage } from '@/learn/ai'

const STORAGE_KEY = 'lab-ai-academy-progress'
const CHAT_CAP = 50

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
    const payload: ProgressPayload = {
      completed: [...completed.value],
      lastOpened: lastOpened.value,
      notes: notes.value,
      stepIndex: { ...stepIndex.value },
      chatHistory: { ...chatHistory.value },
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  watch([completed, lastOpened, notes, stepIndex, chatHistory], persist, { deep: true })

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
  }

  function clearChat(id: string) {
    const next = { ...chatHistory.value }
    delete next[id]
    chatHistory.value = next
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
