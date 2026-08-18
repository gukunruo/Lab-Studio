<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useModelsStore } from '@/ai-platform/composables/useModels'
import { useConversationsStore } from '@/ai-platform/composables/useConversations'
import ConversationSidebar from '@/ai-platform/components/ConversationSidebar.vue'
import ChatArea from '@/ai-platform/components/ChatArea.vue'
import ParameterPanel from '@/ai-platform/components/ParameterPanel.vue'
import type { AiModel, ChatMessage, ChatParams } from '@/ai-platform/types'

const modelsStore = useModelsStore()
const conversationsStore = useConversationsStore()
const loaded = ref(false)
const loadError = ref('')
const panelOpen = ref(true)

async function init() {
  loadError.value = ''
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
const systemPrompt = computed(() => activeConv.value?.systemPrompt || 'You are a helpful assistant.')
const params = computed(() => activeConv.value?.params ?? { reasoningEffort: 'high', maxTokens: 4096 })
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
        :panel-open="panelOpen"
        @select-model="onSelectModel"
        @toggle-panel="panelOpen = !panelOpen"
        @clear-messages="onUpdateMessages([])"
        @update:messages="onUpdateMessages"
      />
      <ParameterPanel
        :open="panelOpen"
        :params="params"
        :system-prompt="systemPrompt"
        :current-model="currentModel"
        @update:params="onUpdateParams"
        @update:system-prompt="onUpdateSystemPrompt"
        @select-model="onSelectModel"
        @close="panelOpen = false"
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

<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');
</style>

<style scoped lang="scss">
.ai-platform {
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  display: flex;
  background: #0a0a0a;
  color-scheme: dark;

  // Dark glassmorphism theme — matches the high-fidelity mockup.
  // Overrides project tokens for this subtree only; global theme is untouched.
  --color-bg: #0a0a0a;
  --color-bg-elevated: #111113;
  --color-surface: rgba(255, 255, 255, 0.045);
  --color-surface-2: rgba(255, 255, 255, 0.07);
  --color-text: #f4f4f5;
  --color-text-muted: #a1a1aa;
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.05);
  --color-border-strong: rgba(255, 255, 255, 0.13);
  --color-accent: #2dd4bf;
  --color-accent-strong: #5eead4;
  --color-accent-soft: rgba(45, 212, 191, 0.12);
  --color-accent-glow: rgba(45, 212, 191, 0.22);
  --color-danger: #f87171;
  --font-sans: 'DM Sans', system-ui, -apple-system, 'PingFang SC', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-full: 9999px;
}

.ai-platform__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--color-text-muted);
  background: var(--color-bg);
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
