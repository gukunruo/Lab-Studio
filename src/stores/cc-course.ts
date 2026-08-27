import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { ccChapters } from '@/learn/cc-curriculum'

const STORAGE_KEY = 'lab-cc-course-progress'

type Progress = { completed: string[]; lastOpened: string | null }

function load(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { completed: [], lastOpened: null }
    const parsed = JSON.parse(raw) as Partial<Progress>
    return {
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id) => typeof id === 'string') : [],
      lastOpened: typeof parsed.lastOpened === 'string' ? parsed.lastOpened : null,
    }
  } catch {
    return { completed: [], lastOpened: null }
  }
}

export const useCcCourseStore = defineStore('cc-course', () => {
  const initial = load()
  const completed = ref<string[]>(initial.completed)
  const lastOpened = ref<string | null>(initial.lastOpened)

  const completedSet = computed(() => new Set(completed.value))
  const doneCount = computed(() => completed.value.length)
  const totalCount = ccChapters.length
  const progressRatio = computed(() => (totalCount ? doneCount.value / totalCount : 0))

  watch([completed, lastOpened], () => {
    const payload: Progress = { completed: [...completed.value], lastOpened: lastOpened.value }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // storage unavailable (private mode) — keep in-memory only
    }
  }, { deep: true })

  function isDone(id: string) {
    return completedSet.value.has(id)
  }

  function toggleDone(id: string) {
    const i = completed.value.indexOf(id)
    if (i >= 0) completed.value.splice(i, 1)
    else completed.value.push(id)
  }

  function openChapter(id: string) {
    lastOpened.value = id
  }

  function resetProgress() {
    completed.value = []
    lastOpened.value = null
  }

  return {
    completed,
    lastOpened,
    completedSet,
    doneCount,
    totalCount,
    progressRatio,
    isDone,
    toggleDone,
    openChapter,
    resetProgress,
  }
})
