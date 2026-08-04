import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'lab-ui-layout'

export const SIDE_MIN = 220
export const SIDE_MAX = 380
export const TUTOR_MIN = 320
export const TUTOR_MAX = 560

export interface PlayerPos {
  x: number
  y: number
}

interface UiLayout {
  sideW: number
  tutorW: number
  tutorOpen: boolean
  sideCollapsed: boolean
  playerPos: PlayerPos | null
  playerRestPos: PlayerPos | null
}

const DEFAULTS: UiLayout = {
  sideW: 276,
  tutorW: 380,
  tutorOpen: false,
  sideCollapsed: false,
  playerPos: null,
  playerRestPos: null,
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function load(): UiLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<UiLayout>
    const pp = p.playerPos
    const safePos =
      pp && typeof pp === 'object' && typeof pp.x === 'number' && typeof pp.y === 'number'
        ? { x: pp.x, y: pp.y }
        : null
    return {
      sideW: typeof p.sideW === 'number' ? clamp(p.sideW, SIDE_MIN, SIDE_MAX) : DEFAULTS.sideW,
      tutorW: typeof p.tutorW === 'number' ? clamp(p.tutorW, TUTOR_MIN, TUTOR_MAX) : DEFAULTS.tutorW,
      tutorOpen: typeof p.tutorOpen === 'boolean' ? p.tutorOpen : DEFAULTS.tutorOpen,
      sideCollapsed: typeof p.sideCollapsed === 'boolean' ? p.sideCollapsed : DEFAULTS.sideCollapsed,
      playerPos: safePos,
      playerRestPos:
        p.playerRestPos && typeof p.playerRestPos === 'object' &&
        typeof p.playerRestPos.x === 'number' && typeof p.playerRestPos.y === 'number'
          ? { x: p.playerRestPos.x, y: p.playerRestPos.y }
          : null,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useUiStore = defineStore('ui-layout', () => {
  const initial = load()
  const sideW = ref(initial.sideW)
  const tutorW = ref(initial.tutorW)
  const tutorOpen = ref(initial.tutorOpen)
  const sideCollapsed = ref(initial.sideCollapsed)
  const playerPos = ref<PlayerPos | null>(initial.playerPos)
  const playerRestPos = ref<PlayerPos | null>(initial.playerRestPos)

  function persist() {
    const payload: UiLayout = {
      sideW: sideW.value,
      tutorW: tutorW.value,
      tutorOpen: tutorOpen.value,
      sideCollapsed: sideCollapsed.value,
      playerPos: playerPos.value,
      playerRestPos: playerRestPos.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }

  watch([sideW, tutorW, tutorOpen, sideCollapsed, playerPos, playerRestPos], persist, { deep: true })

  function setSideW(v: number) {
    sideW.value = clamp(Math.round(v), SIDE_MIN, SIDE_MAX)
  }
  function setTutorW(v: number) {
    tutorW.value = clamp(Math.round(v), TUTOR_MIN, TUTOR_MAX)
  }
  function toggleTutor(v?: boolean) {
    tutorOpen.value = v ?? !tutorOpen.value
  }
  function toggleSideCollapsed(v?: boolean) {
    sideCollapsed.value = v ?? !sideCollapsed.value
  }
  function setPlayerPos(pos: PlayerPos | null) {
    playerPos.value = pos
  }
  function setPlayerRestPos(pos: PlayerPos | null) {
    playerRestPos.value = pos
  }
  function resetLayout() {
    sideW.value = DEFAULTS.sideW
    tutorW.value = DEFAULTS.tutorW
    tutorOpen.value = DEFAULTS.tutorOpen
    sideCollapsed.value = DEFAULTS.sideCollapsed
    playerPos.value = DEFAULTS.playerPos
    playerRestPos.value = DEFAULTS.playerRestPos
  }

  return {
    sideW,
    tutorW,
    tutorOpen,
    sideCollapsed,
    playerPos,
    playerRestPos,
    setPlayerRestPos,
    setSideW,
    setTutorW,
    toggleTutor,
    toggleSideCollapsed,
    setPlayerPos,
    resetLayout,
  }
})
