import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { messages, type Locale } from '@/i18n/messages'
import type { LocalizedString } from '@/apps/_registry'

const KEY = 'lab-locale'

function readInitial(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {}
  return 'zh'
}

export const useLocaleStore = defineStore('locale', () => {
  const locale = ref<Locale>(readInitial())

  function t(key: string): string {
    return messages[locale.value][key] ?? messages.zh[key] ?? key
  }

  function tl(value: LocalizedString): string {
    return value[locale.value] ?? value.zh
  }

  function setLocale(l: Locale) {
    locale.value = l
  }

  function toggle() {
    locale.value = locale.value === 'zh' ? 'en' : 'zh'
  }

  watch(
    locale,
    (l) => {
      document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'
      try {
        localStorage.setItem(KEY, l)
      } catch {}
    },
    { immediate: true },
  )

  return { locale, t, tl, setLocale, toggle }
})
