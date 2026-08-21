<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { useModelsStore } from '@/ai-platform/composables/useModels'
import { useConversationsStore } from '@/ai-platform/composables/useConversations'
import ConversationSidebar from '@/ai-platform/components/ConversationSidebar.vue'
import ChatArea from '@/ai-platform/components/ChatArea.vue'
import ParameterPanel from '@/ai-platform/components/ParameterPanel.vue'
import type { AiModel, ChatMessage, ChatParams } from '@/ai-platform/types'

const themeStore = useThemeStore()
const localeStore = useLocaleStore()
const aiTheme = ref<'light' | 'dark'>(themeStore.theme)
const aiLocale = ref<'zh' | 'en'>(localeStore.locale)
const modelsStore = useModelsStore()
const conversationsStore = useConversationsStore()
const loaded = ref(false)
const loadError = ref('')
const panelOpen = ref(false)
const sidebarCollapsed = ref(false)

async function init() {
  loaded.value = false
  loadError.value = ''
  try {
    await Promise.all([modelsStore.load(), conversationsStore.loadList()])
    await newConversation()
    loaded.value = true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败'
  }
}

onMounted(() => {
  document.documentElement.classList.add('ai-platform-page')
  document.body.classList.add('ai-platform-page')
  init()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('ai-platform-page')
  document.body.classList.remove('ai-platform-page')
})

const activeConv = computed(() => conversationsStore.activeConversation)
const messages = computed(() => activeConv.value?.messages ?? [])
const modelId = computed(() => activeConv.value?.modelId ?? 'claude-opus-5')
const systemPrompt = computed(() => activeConv.value?.systemPrompt || 'You are a helpful assistant.')
const params = computed(() => ({
  reasoningEffort: 'high' as const,
  maxTokens: 4096,
  ...(activeConv.value?.params ?? {}),
}))
const currentModel = computed(() => modelsStore.findById(modelId.value))

async function newConversation() {
  await conversationsStore.create(modelId.value)
}

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

function onAiThemeChange(theme: 'light' | 'dark') {
  aiTheme.value = theme
}

function onAiLocaleChange(locale: 'zh' | 'en') {
  aiLocale.value = locale
}
</script>

<template>
  <div class="ai-platform" :data-theme="aiTheme" :data-locale="aiLocale">
    <template v-if="loaded">
      <ConversationSidebar :collapsed="sidebarCollapsed" @toggle-collapse="sidebarCollapsed = !sidebarCollapsed" />
      <ChatArea
        :messages="messages"
        :model-id="modelId"
        :system-prompt="systemPrompt"
        :params="params"
        :current-model="currentModel"
        :panel-open="panelOpen"
        :sidebar-collapsed="sidebarCollapsed"
        :locale="aiLocale"
        @select-model="onSelectModel"
        @toggle-panel="panelOpen = !panelOpen"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        @new-conversation="newConversation"
        @update:messages="onUpdateMessages"
      />
      <ParameterPanel
        :open="panelOpen"
        :params="params"
        :system-prompt="systemPrompt"
        :current-model="currentModel"
        :theme="aiTheme"
        :locale="aiLocale"
        @update:theme="onAiThemeChange"
        @update:locale="onAiLocaleChange"
        @update:params="onUpdateParams"
        @update:system-prompt="onUpdateSystemPrompt"
        @select-model="onSelectModel"
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

html.ai-platform-page,
body.ai-platform-page {
  overflow: hidden;
}

body.ai-platform-page #app {
  height: 100dvh;
  overflow: hidden;
}
</style>

<style scoped lang="scss">
.ai-platform {
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  display: flex;
  background: var(--color-bg);
  color-scheme: light;

  --color-bg: #ffffff;
  --color-bg-elevated: #f7f7f8;
  --color-surface: #f7f7f8;
  --color-surface-2: #efefef;
  --color-text: #18181b;
  --color-text-muted: #71717a;
  --color-border: rgba(24, 24, 27, 0.08);
  --color-border-subtle: rgba(24, 24, 27, 0.06);
  --color-border-strong: rgba(24, 24, 27, 0.14);
  --color-accent: #0d9488;
  --color-accent-strong: #0f766e;
  --color-accent-soft: #ccfbf1;
  --color-accent-glow: rgba(13, 148, 136, 0.22);
  --color-danger: #dc2626;

  &[data-theme='dark'] {
    color-scheme: dark;
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
  }

  // Shared typography and shape tokens stay scoped to the AI page.
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
