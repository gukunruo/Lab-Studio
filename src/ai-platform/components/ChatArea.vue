<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import type { AiModel, ChatMessage, ChatParams } from '../types'
import MessageBubble from './MessageBubble.vue'
import ModelSelector from './ModelSelector.vue'
import Composer from './Composer.vue'
import { useChat } from '../composables/useChat'
import { PhGearSix, PhX, PhLightning } from '@phosphor-icons/vue'

const props = defineProps<{
  messages: ChatMessage[]
  modelId: string
  systemPrompt: string
  params: ChatParams
  currentModel: AiModel | undefined
  panelOpen: boolean
}>()

const emit = defineEmits<{
  'select-model': [model: AiModel]
  'update:params': [params: ChatParams]
  'update:systemPrompt': [prompt: string]
  'update:messages': [messages: ChatMessage[]]
  'toggle-panel': []
  'clear-messages': []
}>()

const messagesContainer = ref<HTMLElement | null>(null)
const streamingContent = ref('')

const { streaming, send, abort } = useChat()

const displayMessages = computed(() => {
  const msgs = [...props.messages]
  if (streaming.value && streamingContent.value) {
    msgs.push({ role: 'assistant', content: streamingContent.value })
  }
  return msgs
})

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(() => displayMessages.value.length, scrollToBottom)
watch(streamingContent, scrollToBottom)

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
      <ModelSelector :current-model-id="modelId" @select="emit('select-model', $event)" />
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
          <PhX :size="16" weight="regular" />
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

    <div v-else ref="messagesContainer" class="chat__messages">
      <MessageBubble
        v-for="(msg, i) in displayMessages"
        :key="i"
        :message="msg"
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

.chat__header-right {
  display: flex;
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
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
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
