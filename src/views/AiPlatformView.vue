<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useModelsStore } from '@/ai-platform/composables/useModels'
import { useConversationsStore } from '@/ai-platform/composables/useConversations'
import ConversationSidebar from '@/ai-platform/components/ConversationSidebar.vue'
import ChatArea from '@/ai-platform/components/ChatArea.vue'
import type { AiModel, ChatMessage, ChatParams } from '@/ai-platform/types'

const modelsStore = useModelsStore()
const conversationsStore = useConversationsStore()
const loaded = ref(false)

onMounted(async () => {
  await Promise.all([modelsStore.load(), conversationsStore.loadList()])
  if (conversationsStore.conversations.length > 0) {
    await conversationsStore.select(conversationsStore.conversations[0]!.id)
  }
  loaded.value = true
})

const activeConv = computed(() => conversationsStore.activeConversation)
const messages = computed(() => activeConv.value?.messages ?? [])
const modelId = computed(() => activeConv.value?.modelId ?? 'claude-opus-5')
const systemPrompt = computed(() => activeConv.value?.systemPrompt ?? '')
const params = computed(() => activeConv.value?.params ?? {})
const currentModel = computed(() => modelsStore.findById(modelId.value))

function onSelectModel(model: AiModel) {
  conversationsStore.updateActiveModel(model.modelId)
  conversationsStore.persistActive()
}

function onUpdateMessages(msgs: ChatMessage[]) {
  conversationsStore.setActiveMessages(msgs)
  conversationsStore.persistActive()
}

function onUpdateParams(p: ChatParams) {
  conversationsStore.updateActiveParams(p)
  conversationsStore.persistActive()
}

function onUpdateSystemPrompt(prompt: string) {
  conversationsStore.updateActiveSystemPrompt(prompt)
  conversationsStore.persistActive()
}
</script>

<template>
  <div class="ai-platform">
    <template v-if="loaded">
      <ConversationSidebar />
      <ChatArea
        :messages="messages"
        :model-id="modelId"
        :system-prompt="systemPrompt"
        :params="params"
        :current-model="currentModel"
        @select-model="onSelectModel"
        @update:messages="onUpdateMessages"
        @update:params="onUpdateParams"
        @update:system-prompt="onUpdateSystemPrompt"
      />
    </template>
    <div v-else class="ai-platform__loading">
      <span>Loading…</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-platform {
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  display: flex;
  background: var(--color-bg);
}

.ai-platform__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--color-text-muted);
}
</style>
