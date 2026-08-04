import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { worlds as allWorlds, type WorldMeta } from '@/worlds/_registry'

export const useWorldStore = defineStore('worlds', () => {
  const items = allWorlds as readonly WorldMeta[]
  const query = ref('')
  const activeTag = ref<string | null>(null)

  const allTags = computed(() => {
    const set = new Set<string>()
    for (const e of items) for (const t of e.tags) set.add(t)
    return Array.from(set).sort()
  })

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    const tag = activeTag.value
    return items.filter((e) => {
      if (tag && !e.tags.includes(tag)) return false
      if (!q) return true
      return (
        e.title.zh.toLowerCase().includes(q) ||
        e.title.en.toLowerCase().includes(q) ||
        e.description.zh.toLowerCase().includes(q) ||
        e.description.en.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  })

  function toggleTag(tag: string) {
    activeTag.value = activeTag.value === tag ? null : tag
  }

  return { items, query, activeTag, allTags, filtered, toggleTag }
})
