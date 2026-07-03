import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

type Theme = 'light' | 'dark'

const KEY = 'lab-theme'

function readInitial(): Theme {
  const fromDom = document.documentElement.dataset.theme as Theme | undefined
  if (fromDom === 'light' || fromDom === 'dark') return fromDom
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return 'light'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(readInitial())

  function apply(t: Theme) {
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem(KEY, t)
    } catch {}
  }

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  watch(theme, apply)

  return { theme, toggle }
})
