import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AiModel, ModelsByCategory } from '../types'
import { fetchModels } from '../api'

export const useModelsStore = defineStore('ai-models', () => {
  const models = ref<ModelsByCategory>({})
  const loading = ref(false)

  const chatModels = computed(() => models.value.chat ?? [])
  const reasoningModels = computed(() => models.value.reasoning ?? [])
  const imageModels = computed(() => models.value.image ?? [])

  async function load() {
    if (loading.value) return
    loading.value = true
    try {
      models.value = await fetchModels()
    } finally {
      loading.value = false
    }
  }

  function findById(modelId: string): AiModel | undefined {
    return [...chatModels.value, ...reasoningModels.value].find((m) => m.modelId === modelId)
  }

  return { models, loading, chatModels, reasoningModels, imageModels, load, findById }
})
