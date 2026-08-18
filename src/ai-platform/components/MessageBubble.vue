<script setup lang="ts">
import { ref } from 'vue'
import type { ChatMessage } from '../types'

const props = defineProps<{
  message: ChatMessage
  streaming?: boolean
}>()

const copied = ref(false)

async function copyContent() {
  await navigator.clipboard.writeText(props.message.content)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="message" :class="`message--${message.role}`">
    <div class="message__avatar" :class="`message__avatar--${message.role}`">
      {{ message.role === 'user' ? '我' : 'AI' }}
    </div>
    <div class="message__body">
      <div class="message__role">{{ message.role === 'user' ? '我' : 'Assistant' }}</div>
      <div class="message__content">
        {{ message.content }}<span v-if="streaming" class="message__cursor" />
      </div>
      <div v-if="!streaming" class="message__actions">
        <button class="message__action" type="button" @click="copyContent">
          {{ copied ? '已复制' : '复制' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message {
  max-width: 780px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  gap: 16px;
}

.message__avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.message__avatar--user {
  background: linear-gradient(135deg, #6366f1, #818cf8);
  color: #fff;
}

.message__avatar--assistant {
  background: linear-gradient(135deg, var(--color-accent), #0f766e);
  color: var(--color-bg);
}

.message__body {
  flex: 1;
  min-width: 0;
}

.message__role {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.message__content {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.message__cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  background: var(--color-accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: msg-blink 1s steps(2) infinite;
  border-radius: 1px;
}

@keyframes msg-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message__actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message:hover .message__actions {
  opacity: 1;
}

.message__action {
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.message__action:hover {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}
</style>
