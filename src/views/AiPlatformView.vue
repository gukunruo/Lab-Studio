<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { useModelsStore } from '@/ai-platform/composables/useModels'
import { useConversationsStore } from '@/ai-platform/composables/useConversations'
import { fetchAiPreferences, fetchRecommendations, updateAiPreferences } from '@/ai-platform/api'
import ConversationSidebar from '@/ai-platform/components/ConversationSidebar.vue'
import ChatArea from '@/ai-platform/components/ChatArea.vue'
import ParameterPanel from '@/ai-platform/components/ParameterPanel.vue'
import ResizeGutter from '@/components/ResizeGutter.vue'

const SIDEBAR_MIN = 224
const SIDEBAR_MAX = 360
const SIDEBAR_DEFAULT = 264
const sidebarWidth = ref(SIDEBAR_DEFAULT)
const sidebarDragging = ref(false)

const PANEL_MIN = 280
const PANEL_MAX = 480
const PANEL_DEFAULT = 300
const panelWidth = ref(PANEL_DEFAULT)
const panelDragging = ref(false)

function onSidebarResize(width: number) {
  sidebarWidth.value = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)))
}

function onSidebarDragStart() {
  sidebarDragging.value = true
}

function onSidebarDragEnd() {
  sidebarDragging.value = false
}

function onPanelResize(width: number) {
  panelWidth.value = Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(width)))
}

function onPanelDragStart() {
  panelDragging.value = true
}

function onPanelDragEnd() {
  panelDragging.value = false
}
import type { AiModel, AiRecommendation, AiThemePreference, ChatMessage, ChatParams, ConversationDigest } from '@/ai-platform/types'

function normalizeRecommendations(generated: AiRecommendation[]): AiRecommendation[] {
  const unique = generated.filter(
    (item, index, list) =>
      item.title.trim() &&
      item.query.trim() &&
      list.findIndex((candidate) => candidate.query === item.query) === index,
  )
  const news = unique.find((item) => item.category === '资讯' || item.title.startsWith('资讯：'))
  const ordered = news ? [news, ...unique.filter((item) => item !== news)] : unique
  return ordered.slice(0, 4)
}

const themeStore = useThemeStore()
const localeStore = useLocaleStore()
const route = useRoute()
const router = useRouter()
const aiThemePreference = ref<AiThemePreference>(themeStore.theme)
const aiSystemDark = ref(false)
const aiLocale = ref<'zh' | 'en'>(localeStore.locale)
const aiTheme = computed<'light' | 'dark'>(() => aiThemePreference.value === 'system'
  ? (aiSystemDark.value ? 'dark' : 'light')
  : aiThemePreference.value)
let systemThemeMedia: MediaQueryList | null = null

function syncSystemTheme(event?: MediaQueryListEvent) {
  aiSystemDark.value = event?.matches ?? systemThemeMedia?.matches ?? false
}

function setSystemThemeListener() {
  systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
  syncSystemTheme()
  systemThemeMedia.addEventListener('change', syncSystemTheme)
}

function removeSystemThemeListener() {
  systemThemeMedia?.removeEventListener('change', syncSystemTheme)
  systemThemeMedia = null
}
const modelsStore = useModelsStore()
const conversationsStore = useConversationsStore()
const loaded = ref(false)
const loadError = ref('')
const panelOpen = ref(false)
const sidebarCollapsed = ref(false)
const suggestions = ref<AiRecommendation[]>([])
const chatActionError = ref('')
const branchCreating = ref(false)
let creatingConversation = false

async function init() {
  loaded.value = false
  loadError.value = ''
  suggestions.value = []
  try {
    const [modelsResult, conversationsResult, recommendationsResult, preferencesResult] = await Promise.allSettled([
      modelsStore.load(),
      conversationsStore.loadList(),
      fetchRecommendations(),
      fetchAiPreferences(),
    ])

    if (modelsResult.status === 'rejected') throw modelsResult.reason
    if (conversationsResult.status === 'rejected') throw conversationsResult.reason
    if (recommendationsResult.status === 'fulfilled') {
      suggestions.value = normalizeRecommendations(recommendationsResult.value)
    }
    if (preferencesResult.status === 'fulfilled') {
      aiThemePreference.value = preferencesResult.value.theme
    } else {
      console.warn('[ai-platform] preferences unavailable', preferencesResult.reason)
    }
    await restoreSelectedConversation()
    loaded.value = true
    if (recommendationsResult.status === 'rejected') {
      console.warn('[ai-platform] recommendations unavailable', recommendationsResult.reason)
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'AI 页面加载失败，请重试'
  }
}

onMounted(() => {
  document.documentElement.classList.add('ai-platform-page')
  document.body.classList.add('ai-platform-page')
  setSystemThemeListener()
  init()
})

onBeforeUnmount(() => {
  removeSystemThemeListener()
  document.documentElement.classList.remove('ai-platform-page')
  document.body.classList.remove('ai-platform-page')
})

const activeConv = computed(() => conversationsStore.activeConversation)
const chatArea = ref<InstanceType<typeof ChatArea> | null>(null)
const messages = computed(() => activeConv.value?.messages ?? [])
const digest = computed(() => activeConv.value?.digest ?? null)
const modelId = computed(() => activeConv.value?.modelId ?? 'glm-5.2')
const systemPrompt = computed(() => activeConv.value?.systemPrompt || 'You are a helpful assistant.')
const params = computed(() => ({
  reasoningEffort: 'high' as const,
  maxTokens: 4096,
  ...(activeConv.value?.params ?? {}),
}))
const currentModel = computed(() => modelsStore.findById(modelId.value))

async function newConversation() {
  if (creatingConversation) return
  creatingConversation = true
  try {
    await conversationsStore.create(modelId.value)
  } finally {
    creatingConversation = false
  }
}

async function restoreSelectedConversation() {
  const requested = Number(route.query.c)
  const exists = Number.isInteger(requested) && requested > 0
    && conversationsStore.conversations.some((item) => item.id === requested)
  if (!exists) {
    await newConversation()
    return
  }
  try {
    await conversationsStore.select(requested)
  } catch (error) {
    console.warn('[ai-platform] failed to restore conversation from url', error)
    await newConversation()
  }
}

watch(() => conversationsStore.activeId, (id) => {
  const unchanged = id === null ? route.query.c === undefined : String(route.query.c ?? '') === String(id)
  if (unchanged) return
  const query = { ...route.query }
  if (id === null) delete query.c
  else query.c = String(id)
  void router.replace({ query })
})

function onSelectModel(model: AiModel) {
  conversationsStore.updateActiveModel(model.modelId)
  conversationsStore.persistActive()
}

async function onUpdateMessages(msgs: ChatMessage[]) {
  conversationsStore.setActiveMessages(msgs)
  if (msgs.length === 1 || (activeConv.value?.id === 0 && msgs.length === 2)) {
    await conversationsStore.ensurePersisted()
  } else {
    conversationsStore.persistActive()
  }
}

function onUpdateParams(p: ChatParams) {
  conversationsStore.updateActiveParams(p)
  conversationsStore.persistActive()
}

function onUpdateSystemPrompt(prompt: string) {
  conversationsStore.updateActiveSystemPrompt(prompt)
  conversationsStore.persistActive()
}

async function onCreateBranch(messageIndex: number) {
  if (branchCreating.value) return
  branchCreating.value = true
  chatActionError.value = ''
  try {
    const branch = await conversationsStore.createBranch(messageIndex)
    if (!branch) chatActionError.value = '请先发送一条消息后再创建分支。'
  } catch (error) {
    console.warn('[ai-platform] failed to create conversation branch', error)
    chatActionError.value = '创建分支失败，请稍后重试。'
  } finally {
    branchCreating.value = false
  }
}

function onClearDigest() {
  conversationsStore.clearActiveDigest()
}

function onUpdateDigest(value: ConversationDigest) {
  conversationsStore.updateActiveDigest(value)
}

function onDigestError(message: string) {
  chatActionError.value = message
}

async function onAiThemeChange(theme: AiThemePreference) {
  const previousTheme = aiThemePreference.value
  aiThemePreference.value = theme
  try {
    aiThemePreference.value = (await updateAiPreferences({ theme })).theme
  } catch (error) {
    aiThemePreference.value = previousTheme
    console.warn('[ai-platform] failed to save theme preference', error)
  }
}

function onAiLocaleChange(locale: 'zh' | 'en') {
  aiLocale.value = locale
  localeStore.setLocale(locale)
}

watch(aiTheme, (resolved) => {
  if (themeStore.theme !== resolved) themeStore.theme = resolved
})
</script>

<template>
  <div
    class="ai-platform"
    :class="{ 'ai-platform--dragging': panelDragging || sidebarDragging }"
    :data-theme="aiTheme"
    :data-locale="aiLocale"
  >

    <template v-if="loaded">
      <ConversationSidebar
        :collapsed="sidebarCollapsed"
        :width="sidebarWidth"
        :theme="aiTheme"
        @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
        @new-conversation="newConversation"
      />
      <ResizeGutter
        v-if="!sidebarCollapsed"
        class="ai-platform__sidebar-gutter"
        :min="SIDEBAR_MIN"
        :max="SIDEBAR_MAX"
        :value="sidebarWidth"
        @resize="onSidebarResize"
        @dragstart="onSidebarDragStart"
        @dragend="onSidebarDragEnd"
      />
      <ChatArea
        ref="chatArea"
        :messages="messages"
        :model-id="modelId"
        :system-prompt="systemPrompt"
        :params="params"
        :current-model="currentModel"
        :conversation-key="activeConv"
        :panel-open="panelOpen"
        :sidebar-collapsed="sidebarCollapsed"
        :locale="aiLocale"
        :suggestions="suggestions"
        :digest="digest"
        :branch-creating="branchCreating"
        @select-model="onSelectModel"
        @toggle-panel="panelOpen = !panelOpen"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
        @new-conversation="newConversation"
        @update:messages="onUpdateMessages"
        @branch="onCreateBranch"
        @update:digest="onUpdateDigest"
        @digest-error="onDigestError"
        @clear-digest="onClearDigest"
      />
      <p v-if="chatActionError" class="ai-platform__chat-error" role="alert">{{ chatActionError }}</p>
      <ResizeGutter
        v-if="panelOpen"
        class="ai-platform__panel-gutter"
        :min="PANEL_MIN"
        :max="PANEL_MAX"
        :value="panelWidth"
        reverse
        @resize="onPanelResize"
        @dragstart="onPanelDragStart"
        @dragend="onPanelDragEnd"
      />
      <ParameterPanel
        :open="panelOpen"
        :width="panelWidth"
        :dragging="panelDragging"
        :params="params"
        :system-prompt="systemPrompt"
        :current-model="currentModel"
        :theme="aiThemePreference"
        :resolved-theme="aiTheme"
        :locale="aiLocale"
        @update:theme="onAiThemeChange"
        @update:locale="onAiLocaleChange"
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

  &.ai-platform--dragging {
    cursor: col-resize;
  }

  &.ai-platform--dragging .ai-platform__sidebar-gutter,
  &.ai-platform--dragging .ai-platform__panel-gutter {
    z-index: 50;
  }

  &.ai-platform--dragging :deep(.chat),
  &.ai-platform--dragging :deep(.sidebar) {
    pointer-events: none;
  }

  &.ai-platform--dragging :deep(.sidebar),
  &.ai-platform--dragging :deep(.param-panel) {
    transition: none;
  }

  .ai-platform__sidebar-gutter,
  .ai-platform__panel-gutter {
    flex: 0 0 8px;
  }

  @media (max-width: 720px) {
    .ai-platform__sidebar-gutter,
    .ai-platform__panel-gutter {
      display: none;
    }
  }

  --param-panel-width: 300px;

  --color-bg: #ffffff;
  --color-bg-elevated: #ffffff;
  --color-surface: #ffffff;
  --color-surface-2: #fafafa;
  --color-text: #171717;
  --color-text-muted: #555555;
  --color-border: rgba(23, 23, 23, 0.09);
  --color-border-subtle: rgba(23, 23, 23, 0.06);
  --color-border-strong: rgba(23, 23, 23, 0.16);
  --color-accent: #0d9488;
  --color-accent-strong: #087d73;
  --color-accent-soft: #e8f8f5;
  --color-accent-glow: rgba(13, 148, 136, 0.18);
  --color-danger: #c9352b;

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

.ai-platform__chat-error {
  position: fixed;
  z-index: 100;
  right: 24px;
  bottom: 24px;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  font-size: 13px;
  padding: 10px 12px;
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
