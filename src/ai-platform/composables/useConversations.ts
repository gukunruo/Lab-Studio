import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AiConversation, AiConversationSummary, ChatMessage, ChatParams } from '../types'
import {
  fetchConversations,
  fetchConversation,
  createConversation as apiCreate,
  updateConversation as apiUpdate,
  deleteConversation as apiDelete,
} from '../api'

export const useConversationsStore = defineStore('ai-conversations', () => {
  const conversations = ref<AiConversationSummary[]>([])
  const activeId = ref<number | null>(null)
  const activeConversation = ref<AiConversation | null>(null)

  async function loadList() {
    conversations.value = await fetchConversations()
  }

  async function select(id: number) {
    activeId.value = id
    activeConversation.value = await fetchConversation(id)
  }

  async function create(modelId: string, title?: string) {
    const conv = await apiCreate(modelId, title)
    activeId.value = conv.id
    activeConversation.value = conv
    await loadList()
    return conv
  }

  function setActiveMessages(messages: ChatMessage[]) {
    if (activeConversation.value) {
      activeConversation.value.messages = messages
    }
  }

  function updateActiveModel(modelId: string) {
    if (activeConversation.value) {
      activeConversation.value.modelId = modelId
    }
  }

  function updateActiveParams(params: ChatParams) {
    if (activeConversation.value) {
      activeConversation.value.params = { ...activeConversation.value.params, ...params }
    }
  }

  function updateActiveSystemPrompt(prompt: string) {
    if (activeConversation.value) {
      activeConversation.value.systemPrompt = prompt
    }
  }

  async function persistActive() {
    if (!activeConversation.value) return
    await apiUpdate(activeConversation.value.id, {
      title: activeConversation.value.title,
      modelId: activeConversation.value.modelId,
      systemPrompt: activeConversation.value.systemPrompt,
      params: activeConversation.value.params,
      messages: activeConversation.value.messages,
    })
    await loadList()
  }

  async function remove(id: number) {
    await apiDelete(id)
    if (activeId.value === id) {
      activeId.value = null
      activeConversation.value = null
    }
    await loadList()
  }

  return {
    conversations,
    activeId,
    activeConversation,
    loadList,
    select,
    create,
    setActiveMessages,
    updateActiveModel,
    updateActiveParams,
    updateActiveSystemPrompt,
    persistActive,
    remove,
  }
})
