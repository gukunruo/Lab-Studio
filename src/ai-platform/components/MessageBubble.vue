<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'
import type { ChatMessage } from '../types'

marked.use({
  gfm: true,
  breaks: true,
})

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const markdownRenderer = new marked.Renderer()
markdownRenderer.html = ({ text }) => escapeHtml(text)
markdownRenderer.link = ({ href, title, text }) => {
  const safeHref = /^(https?:|mailto:|#)/i.test(href) ? href : '#'
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(safeHref)}"${titleAttribute} target="_blank" rel="noreferrer">${text}</a>`
}

const props = defineProps<{
  message: ChatMessage
  streaming?: boolean
  modelName?: string
}>()

function renderMarkdown(value: string): string {
  return marked.parse(value, {
    async: false,
    renderer: markdownRenderer,
  }) as string
}

const renderedContent = computed(() => renderMarkdown(props.message.content))
const isAssistant = computed(() => props.message.role === 'assistant')
const isStreaming = computed(() => Boolean(props.streaming))
const copied = ref(false)

async function copyContent() {
  await navigator.clipboard.writeText(props.message.content)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="message" :class="`message--${message.role}`">
    <div class="message__body">
      <div class="message__role">{{ message.role === 'user' ? '我' : (modelName ?? 'Assistant') }}</div>
      <div class="message__content">
        <div v-if="isAssistant" class="message__markdown" v-html="renderedContent" />
        <div v-else class="message__plain">{{ message.content }}</div>
        <span v-if="isStreaming" class="message__cursor" />
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
  width: min(100%, 780px);
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  gap: 16px;
}

.message--user {
  justify-content: flex-end;
}

.message--user .message__body {
  flex: 0 1 auto;
  max-width: min(78%, 620px);
}

.message--user .message__role,
.message--user .message__content {
  text-align: right;
}

.message--user .message__content {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px 4px 16px 16px;
  background: var(--color-accent-soft);
}

.message--user .message__actions {
  justify-content: flex-end;
}

.message--assistant .message__body {
  min-width: 0;
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
  word-break: break-word;
}

.message__plain { white-space: pre-wrap; }
.message__markdown :deep(p) { margin: 0 0 0.8em; }
.message__markdown :deep(p:last-child) { margin-bottom: 0; }
.message__markdown :deep(h1),
.message__markdown :deep(h2),
.message__markdown :deep(h3) { margin: 1.1em 0 0.55em; color: var(--color-text); line-height: 1.35; }
.message__markdown :deep(h1) { font-size: 1.35em; }
.message__markdown :deep(h2) { font-size: 1.2em; }
.message__markdown :deep(h3) { font-size: 1.08em; }
.message__markdown :deep(ul),
.message__markdown :deep(ol) { margin: 0.55em 0 0.8em; padding-left: 1.5em; }
.message__markdown :deep(li + li) { margin-top: 0.25em; }
.message__markdown :deep(blockquote) { margin: 0.8em 0; padding: 0.2em 0 0.2em 1em; border-left: 3px solid var(--color-accent); color: var(--color-text-muted); background: var(--color-surface); }
.message__markdown :deep(hr) { margin: 1em 0; border: 0; border-top: 1px solid var(--color-border); }
.message__markdown :deep(a) { color: var(--color-accent-strong); text-decoration: underline; text-underline-offset: 2px; }
.message__markdown :deep(code) { padding: 0.12em 0.35em; border: 1px solid var(--color-border); border-radius: 5px; background: var(--color-surface-2); color: var(--color-accent-strong); font-family: var(--font-mono); font-size: 0.88em; }
.message__markdown :deep(pre) { margin: 0.8em 0; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: #09090b; padding: 12px 14px; }
.message__markdown :deep(pre code) { display: block; padding: 0; border: 0; background: transparent; color: var(--color-text); font-size: 12px; line-height: 1.65; white-space: pre; }
.message__markdown :deep(table) { width: 100%; margin: 0.8em 0; border-collapse: collapse; font-size: 0.92em; }
.message__markdown :deep(th),
.message__markdown :deep(td) { padding: 7px 9px; border: 1px solid var(--color-border); text-align: left; }
.message__markdown :deep(th) { color: var(--color-text); background: var(--color-surface); }

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

.message:hover .message__actions { opacity: 1; }

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
