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
const loadError = ref('')

async function init() {
  try {
    await Promise.all([modelsStore.load(), conversationsStore.loadList()])
    if (conversationsStore.conversations.length > 0) {
      await conversationsStore.select(conversationsStore.conversations[0]!.id)
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败'
  }
  loaded.value = true
}

onMounted(init)

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
      <div v-if="loadError" class="ai-platform__error">
        <span class="ai-platform__error-msg">{{ loadError }}</span>
        <button class="ai-platform__retry-btn" type="button" @click="init">重试</button>
      </div>
      <span v-else>Loading…</span>
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

.ai-platform__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.ai-platform__error-msg {
  color: var(--color-text);
  font-size: 14px;
}

.ai-platform__retry-btn {
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  font-size: 13px;
  font-family: var(--font-sans);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}
</style>
