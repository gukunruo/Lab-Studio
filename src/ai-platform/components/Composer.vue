<script setup lang="ts">
import { ref, nextTick } from 'vue'
import type { ChatParams } from '../types'
import { PhLightning, PhPaperPlaneRight, PhStop } from '@phosphor-icons/vue'

const props = defineProps<{
  streaming: boolean
  params: ChatParams
}>()

const emit = defineEmits<{
  send: [content: string]
  abort: []
}>()

const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

async function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

async function submit() {
  const content = text.value.trim()
  if (!content || props.streaming) return
  emit('send', content)
  text.value = ''
  await nextTick()
  await autoResize()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="composer-wrap">
    <div class="composer">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer__input"
        placeholder="输入消息，按 Enter 发送…"
        rows="1"
        @input="autoResize"
        @keydown="onKeydown"
      />
      <div class="composer__bar">
        <div class="composer__tools">
          <span v-if="params.reasoningEffort" class="composer__tool composer__tool--active">
            <PhLightning :size="12" weight="fill" /> {{ params.reasoningEffort }}
          </span>
          <span v-if="params.maxTokens" class="composer__tool">
            max {{ params.maxTokens }}
          </span>
        </div>
        <button
          v-if="!streaming"
          class="composer__send"
          type="button"
          :disabled="!text.trim()"
          title="发送"
          @click="submit"
        >
          <PhPaperPlaneRight :size="15" weight="fill" />
        </button>
        <button
          v-else
          class="composer__send composer__send--stop"
          type="button"
          title="停止"
          @click="emit('abort')"
        >
          <PhStop :size="14" weight="fill" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.composer-wrap {
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex-shrink: 0;
  padding: 16px 24px 20px;
  background: linear-gradient(to bottom, transparent, var(--color-bg) 28%);
}

.composer {
  max-width: 780px;
  margin: 0 auto;
  position: relative;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-lg);
    padding: 1px;
    background: linear-gradient(135deg, var(--color-accent), transparent 50%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }
}

.composer:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft), 0 8px 32px rgba(0, 0, 0, 0.3);

  &::before {
    opacity: 1;
  }
}

.composer__input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  padding: 14px 18px 0;
  resize: none;
  min-height: 24px;
  max-height: 200px;
}

.composer__input::placeholder {
  color: var(--color-text-muted);
}

.composer__bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px 10px 18px;
}

.composer__tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.composer__tool {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 11px;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  gap: 4px;
}

.composer__tool--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.composer__send {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  border: none;
  color: var(--color-bg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 0 12px var(--color-accent-glow);
}

.composer__send:hover:not(:disabled) {
  background: var(--color-accent-strong);
  transform: scale(1.05);
}

.composer__send:active:not(:disabled) {
  transform: scale(0.95);
}

.composer__send:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.composer__send--stop {
  background: var(--color-danger);
}
</style>
