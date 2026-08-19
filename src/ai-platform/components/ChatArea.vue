<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, nextTick, watch, computed } from 'vue'
import type { AiModel, ChatMessage, ChatParams } from '../types'
import MessageBubble from './MessageBubble.vue'
import ModelSelector from './ModelSelector.vue'
import Composer from './Composer.vue'
import { useChat } from '../composables/useChat'
import { PhGearSix, PhLightning, PhTrashSimple, PhSidebarSimple, PhPlus } from '@phosphor-icons/vue'

const props = defineProps<{
  messages: ChatMessage[]
  modelId: string
  systemPrompt: string
  params: ChatParams
  currentModel: AiModel | undefined
  panelOpen: boolean
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  'select-model': [model: AiModel]
  'update:params': [params: ChatParams]
  'update:systemPrompt': [prompt: string]
  'update:messages': [messages: ChatMessage[]]
  'toggle-panel': []
  'clear-messages': []
  'toggle-sidebar': []
  'new-conversation': []
}>()

const messagesContainer = ref<HTMLElement | null>(null)
const streamingContent = ref('')
const userScrolledAway = ref(false)

const { streaming, send, abort } = useChat()

const displayMessages = computed(() => {
  const msgs = [...props.messages]
  if (streaming.value && streamingContent.value) {
    msgs.push({ role: 'assistant', content: streamingContent.value })
  }
  return msgs
})

const showLatestButton = computed(() =>
  userScrolledAway.value && displayMessages.value.length > 0,
)

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

function onMessagesScroll() {
  if (messagesContainer.value) {
    userScrolledAway.value = !isNearBottom(messagesContainer.value)
  }
}

async function scrollToBottom(force = false) {
  await nextTick()
  const element = messagesContainer.value
  if (!element || (!force && userScrolledAway.value)) return
  element.scrollTop = element.scrollHeight
}

function jumpToLatest() {
  userScrolledAway.value = false
  void scrollToBottom(true)
}

watch(() => displayMessages.value.length, () => scrollToBottom())
watch(streamingContent, () => scrollToBottom())
watch(streaming, (value) => {
  if (value) {
    userScrolledAway.value = false
    void scrollToBottom(true)
  }
})

function onViewportChange() {
  if (!userScrolledAway.value) void scrollToBottom()
}

onMounted(() => window.addEventListener('resize', onViewportChange))
onBeforeUnmount(() => window.removeEventListener('resize', onViewportChange))

const suggestions = [
  { title: '解释多模型架构', desc: '统一代理层如何工作' },
  { title: '对比模型能力', desc: '不同模型的推理差异' },
  { title: '写一段代码', desc: '流式 SSE 解析器' },
  { title: '设计 prompt 模板', desc: 'reasoning_effort 研究' },
]

function useSuggestion(text: string) {
  handleSend(text)
}

async function handleSend(content: string) {
  const userMsg: ChatMessage = { role: 'user', content, createdAt: new Date().toISOString() }
  const newMessages = [...props.messages, userMsg]
  emit('update:messages', newMessages)

  streamingContent.value = ''

  await send(
    newMessages,
    props.modelId,
    props.systemPrompt,
    props.params,
    {
      onToken: (token) => {
        streamingContent.value += token
      },
      onDone: (full) => {
        const assistantMsg: ChatMessage = { role: 'assistant', content: full, createdAt: new Date().toISOString() }
        emit('update:messages', [...newMessages, assistantMsg])
        streamingContent.value = ''
      },
      onError: (err) => {
        const errorMsg: ChatMessage = { role: 'assistant', content: `错误: ${err}`, createdAt: new Date().toISOString() }
        emit('update:messages', [...newMessages, errorMsg])
        streamingContent.value = ''
      },
    },
  )
}
</script>

<template>
  <main class="chat">
    <header class="chat__header">
      <div class="chat__header-left">
        <button class="chat__icon-btn" type="button" :title="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'" :aria-label="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'" @click="emit('toggle-sidebar')">
          <PhSidebarSimple :size="16" weight="regular" />
        </button>
        <button class="chat__icon-btn" type="button" title="新对话" aria-label="新对话" @click="emit('new-conversation')">
          <PhPlus :size="16" weight="regular" />
        </button>
        <ModelSelector :current-model-id="modelId" @select="emit('select-model', $event)" />
      </div>
      <div class="chat__header-right">
        <button
          class="chat__icon-btn"
          :class="{ 'chat__icon-btn--active': panelOpen }"
          type="button"
          title="参数面板"
          aria-label="参数面板"
          @click="emit('toggle-panel')"
        >
          <PhGearSix :size="16" weight="regular" />
        </button>
        <button
          class="chat__icon-btn"
          type="button"
          title="清空对话"
          aria-label="清空对话"
          @click="emit('clear-messages')"
        >
          <PhTrashSimple :size="16" weight="regular" />
        </button>
      </div>
    </header>

    <div v-if="!messages.length && !streaming" class="chat__empty">
      <div class="chat__empty-icon"><PhLightning :size="28" weight="duotone" /></div>
      <h2 class="chat__empty-title">开始对话</h2>
      <p class="chat__empty-subtitle">选择模型，输入消息开始与 AI 对话</p>
      <div class="chat__suggestions">
        <button
          v-for="s in suggestions"
          :key="s.title"
          class="chat__suggestion"
          type="button"
          @click="useSuggestion(s.title)"
        >
          <div class="chat__suggestion-title">{{ s.title }}</div>
          <div class="chat__suggestion-desc">{{ s.desc }}</div>
        </button>
      </div>
    </div>

    <div v-else ref="messagesContainer" class="chat__messages" @scroll.passive="onMessagesScroll">
      <button
        v-if="showLatestButton"
        class="chat__latest-button"
        :class="{ 'chat__latest-button--streaming': streaming }"
        type="button"
        @click="jumpToLatest"
      >
        {{ streaming ? '正在生成 · 跳转到最新' : '跳转到最新消息' }}
      </button>
      <MessageBubble
        v-for="(msg, i) in displayMessages"
        :key="i"
        :message="msg"
        :model-name="currentModel?.displayName"
        :streaming="streaming && i === displayMessages.length - 1 && msg.role === 'assistant'"
      />
    </div>

    <Composer
      :streaming="streaming"
      :params="params"
      @send="handleSend"
      @abort="abort"
    />

  </main>
</template>

<style scoped lang="scss">
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.chat__header {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
  backdrop-filter: blur(12px);
}

.chat__header-left,
.chat__header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat__icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
}

.chat__icon-btn:hover,
.chat__icon-btn--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.chat__messages {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.chat__messages::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.chat__messages::-webkit-scrollbar-track { background: transparent; }

.chat__messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-border-strong);
}

.chat__messages::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }

.chat__latest-button {
  position: sticky;
  top: 8px;
  z-index: 3;
  display: block;
  margin: -12px auto 12px;
  padding: 7px 13px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-bg-elevated) 92%, transparent);
  color: var(--color-text);
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px);
}

.chat__latest-button:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.chat__latest-button--streaming {
  border-color: var(--color-accent);
  animation: latest-pulse 1.8s ease-in-out infinite;
}

@keyframes latest-pulse {
  0%, 100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24), 0 0 0 0 var(--color-accent-glow); }
  50% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24), 0 0 0 5px transparent; }
}

.chat__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
}

.chat__empty-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-accent-soft), transparent);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 24px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-lg);
    padding: 1px;
    background: linear-gradient(135deg, var(--color-accent), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }
}

.chat__empty-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
  color: var(--color-text);
}

.chat__empty-subtitle {
  font-size: 14px;
  color: var(--color-text-muted);
  margin-bottom: 32px;
  max-width: 420px;
}

.chat__suggestions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-width: 520px;
  width: 100%;
}

.chat__suggestion {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}

.chat__suggestion:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
  transform: translateY(-1px);
}

.chat__suggestion-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 4px;
}

.chat__suggestion-desc {
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
