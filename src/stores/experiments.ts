import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { experiments as allExperiments, type ExperimentMeta } from '@/experiments/_registry'

export const useExperimentStore = defineStore('experiments', () => {
  const items = allExperiments as readonly ExperimentMeta[]
  const query = ref('')

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    )
  })

  return { items, query, filtered }
})
