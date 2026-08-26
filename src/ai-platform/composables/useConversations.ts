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

  async function create(modelId: string, title?: string) {
    cancelPendingPersist()
    if (activeConversation.value) await flushPersist(activeConversation.value)
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

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persistInFlight = false
  let queuedConversation: AiConversation | null = null
  let pendingConversation: AiConversation | null = null

  async function persistActive() {
    if (!activeConversation.value) return
    pendingConversation = {
      ...activeConversation.value,
      params: { ...activeConversation.value.params },
      messages: [...activeConversation.value.messages],
    }
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const conversation = pendingConversation
      pendingConversation = null
      if (conversation) void flushPersist(conversation)
    }, 250)
  }

  async function flushPersist(conversation: AiConversation) {
    if (persistInFlight) {
      queuedConversation = conversation
      return
    }
    persistInFlight = true
    try {
      await apiUpdate(conversation.id, {
        title: conversation.title,
        modelId: conversation.modelId,
        systemPrompt: conversation.systemPrompt,
        params: conversation.params,
        messages: conversation.messages,
        pinned: conversation.pinned,
      })
      await loadList()
    } finally {
      persistInFlight = false
      if (queuedConversation) {
        const nextConversation = queuedConversation
        queuedConversation = null
        void flushPersist(nextConversation)
      }
    }
  }

  function cancelPendingPersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    pendingConversation = null
  }

  async function select(id: number) {
    cancelPendingPersist()
    if (activeConversation.value) await flushPersist(activeConversation.value)
    activeId.value = id
    activeConversation.value = await fetchConversation(id)
  }

  async function setPinned(id: number, pinned: boolean) {
    await apiUpdate(id, { pinned })
    if (activeConversation.value?.id === id) {
      activeConversation.value.pinned = pinned
    }
    await loadList()
  }

  async function togglePinned(id: number) {
    const conversation = conversations.value.find((item) => item.id === id)
    if (conversation) await setPinned(id, !conversation.pinned)
  }

  async function remove(id: number) {
    cancelPendingPersist()
    if (activeConversation.value?.id === id) {
      await flushPersist(activeConversation.value)
    }
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
    setPinned,
    togglePinned,
    remove,
  }
})
