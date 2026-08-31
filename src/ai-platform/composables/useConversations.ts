import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AiConversation, AiConversationSummary, ChatMessage, ChatParams, ConversationDigest } from '../types'
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

  async function create(modelId: string, title = '新对话') {
    const active = activeConversation.value
    const shouldPersist = active && (active.id === 0 || persistTimer !== null)
    cancelPendingPersist()
    if (shouldPersist && active) await flushPersist(active)
    const draft: AiConversation = {
      id: 0,
      userKey: 'admin',
      title,
      modelId,
      systemPrompt: '',
      params: {},
      messages: [],
      pinned: false,
      parentConversationId: null,
      branchFromMessageIndex: null,
      digest: null,
      digestMessageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    activeId.value = null
    activeConversation.value = draft
    return draft
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
  let pendingPersist: { source: AiConversation; snapshot: AiConversation } | null = null
  let persistLoop: Promise<void> | null = null
  let selectionGeneration = 0

  function conversationTitle(conversation: AiConversation): string {
    if (conversation.title !== '新对话') return conversation.title
    const firstUserMessage = conversation.messages.find((message) => message.role === 'user')
    const content = firstUserMessage?.type === 'image-request'
      ? firstUserMessage.prompt.replace(/\s+/g, ' ').trim()
      : firstUserMessage && (firstUserMessage.type === 'text' || firstUserMessage.type === undefined)
        ? firstUserMessage.content.replace(/\s+/g, ' ').trim()
        : ''
    return content ? content.slice(0, 32) + (content.length > 32 ? '…' : '') : '新对话'
  }

  function snapshot(conversation: AiConversation): AiConversation {
    return {
      ...conversation,
      title: conversationTitle(conversation),
      params: { ...conversation.params },
      messages: [...conversation.messages],
      digest: conversation.digest
        ? { ...conversation.digest, outline: [...conversation.digest.outline] }
        : null,
    }
  }

  function queuePersist(conversation: AiConversation): Promise<void> {
    pendingPersist = { source: conversation, snapshot: snapshot(conversation) }
    if (!persistLoop) {
      persistLoop = drainPersist().finally(() => {
        persistLoop = null
      })
    }
    return persistLoop
  }

  function assignQueuedDraftId(source: AiConversation, id: number) {
    const queued = pendingPersist
    if (queued?.source === source && queued.snapshot.id === 0) {
      queued.snapshot.id = id
    }
  }

  async function drainPersist() {
    while (pendingPersist) {
      const pending = pendingPersist
      pendingPersist = null
      const conversation = pending.snapshot
      if (conversation.messages.length === 0) continue

      if (conversation.id === 0) {
        const created = await apiCreate({
          modelId: conversation.modelId,
          title: conversation.title,
          messages: conversation.messages,
          params: conversation.params,
          systemPrompt: conversation.systemPrompt,
          ...(conversation.parentConversationId !== null
            ? {
                parentConversationId: conversation.parentConversationId,
                branchFromMessageIndex: conversation.branchFromMessageIndex ?? 0,
              }
            : {}),
        })
        if (activeConversation.value === pending.source) {
          activeId.value = created.id
          Object.assign(activeConversation.value, created)
        }
        assignQueuedDraftId(pending.source, created.id)
        await loadList()
        continue
      }

      await apiUpdate(conversation.id, {
        title: conversation.title,
        modelId: conversation.modelId,
        systemPrompt: conversation.systemPrompt,
        params: conversation.params,
        messages: conversation.messages,
        pinned: conversation.pinned,
        digest: conversation.digest,
        digestMessageCount: conversation.digestMessageCount,
      })
      await loadList()
    }
  }

  function persistActive() {
    const active = activeConversation.value
    if (!active || active.messages.length === 0) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      const current = activeConversation.value
      if (current && current.messages.length > 0) void queuePersist(current)
    }, 250)
  }

  async function flushPersist(conversation: AiConversation) {
    cancelPendingPersist()
    if (conversation.messages.length === 0) return
    await queuePersist(conversation)
  }

  async function ensurePersisted() {
    const active = activeConversation.value
    if (!active || active.messages.length === 0) return
    cancelPendingPersist()
    await queuePersist(active)
  }

  function cancelPendingPersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
  }

  async function select(id: number) {
    const generation = ++selectionGeneration
    cancelPendingPersist()
    const conversation = await fetchConversation(id)
    if (generation !== selectionGeneration) return
    activeId.value = id
    activeConversation.value = conversation
  }

  async function createBranch(messageIndex: number): Promise<AiConversation | null> {
    const source = activeConversation.value
    if (!source || source.id === 0 || messageIndex < 0 || messageIndex >= source.messages.length) return null

    await flushPersist(source)
    const messages = source.messages.slice(0, messageIndex + 1).map((message) => ({ ...message }))
    const title = `分支 · ${conversationTitle(source)}`.slice(0, 200)
    const branch = await apiCreate({
      modelId: source.modelId,
      title,
      messages,
      params: { ...source.params },
      systemPrompt: source.systemPrompt,
      parentConversationId: source.id,
      branchFromMessageIndex: messageIndex,
    })
    activeId.value = branch.id
    activeConversation.value = branch
    await loadList()
    return branch
  }

  function updateActiveDigest(digest: ConversationDigest) {
    if (!activeConversation.value) return
    activeConversation.value.digest = digest
    activeConversation.value.digestMessageCount = digest.sourceMessageCount
    persistActive()
  }

  function clearActiveDigest() {
    if (!activeConversation.value?.digest) return
    activeConversation.value.digest = null
    activeConversation.value.digestMessageCount = 0
    persistActive()
  }

  async function rename(id: number, title: string) {
    const trimmed = title.trim().slice(0, 200)
    if (!trimmed) return
    await apiUpdate(id, { title: trimmed })
    const item = conversations.value.find((conversation) => conversation.id === id)
    if (item) item.title = trimmed
    if (activeConversation.value?.id === id) activeConversation.value.title = trimmed
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
    ensurePersisted,
    createBranch,
    updateActiveDigest,
    clearActiveDigest,
    rename,
    setPinned,
    togglePinned,
    remove,
  }
})
