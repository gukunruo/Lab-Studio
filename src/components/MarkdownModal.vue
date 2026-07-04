<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { PhX } from '@phosphor-icons/vue'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{ source: string }>()
const emit = defineEmits<{ close: [] }>()

const i18n = useLocaleStore()

// Source is build-time bundled markdown authored in-repo (not runtime user input),
// so unsanitized v-html is acceptable here.
const html = computed(() => marked.parse(props.source, { async: false }) as string)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="md-overlay" @click.self="emit('close')">
      <div class="md-modal" role="dialog" aria-modal="true" :aria-label="i18n.t('app.doc')">
        <header class="md-modal__bar">
          <span class="md-modal__title">{{ i18n.t('app.doc') }}</span>
          <button class="md-modal__close" @click="emit('close')" :aria-label="i18n.t('app.docClose')">
            <PhX :size="18" />
          </button>
        </header>
        <div class="md-modal__body" v-html="html"></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.md-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

@supports not (backdrop-filter: blur(4px)) {
  .md-overlay {
    background: rgba(0, 0, 0, 0.6);
  }
}

.md-modal {
  width: min(680px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.md-modal__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.md-modal__title {
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.md-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.md-modal__close:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.md-modal__body {
  padding: var(--space-5) var(--space-6);
  overflow-y: auto;
  font-size: 0.92rem;
  line-height: 1.7;
  color: var(--color-text);
}

.md-modal__body :deep(h1) {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.6em;
}

.md-modal__body :deep(h2) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 1.2em 0 0.5em;
}

.md-modal__body :deep(h3) {
  font-size: 0.98rem;
  font-weight: 600;
  margin: 1em 0 0.4em;
}

.md-modal__body :deep(p) {
  margin: 0 0 0.8em;
}

.md-modal__body :deep(ul),
.md-modal__body :deep(ol) {
  margin: 0 0 0.8em;
  padding-left: 1.3em;
}

.md-modal__body :deep(li) {
  margin: 0.25em 0;
}

.md-modal__body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--color-accent-soft);
  padding: 0.15em 0.4em;
  border-radius: var(--radius-sm);
}

.md-modal__body :deep(pre) {
  background: var(--color-surface-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 0 0 0.8em;
}

.md-modal__body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.82rem;
}

.md-modal__body :deep(a) {
  color: var(--color-accent);
  text-decoration: none;
}

.md-modal__body :deep(a:hover) {
  text-decoration: underline;
}

.md-modal__body :deep(blockquote) {
  border-left: 3px solid var(--color-accent);
  padding-left: var(--space-4);
  margin: 0 0 0.8em;
  color: var(--color-text-muted);
}

.md-modal__body :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-5) 0;
}

.md-modal__body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 0.8em;
  font-size: 0.85rem;
}

.md-modal__body :deep(th),
.md-modal__body :deep(td) {
  border: 1px solid var(--color-border);
  padding: var(--space-2) var(--space-3);
  text-align: left;
}

.md-modal__body :deep(th) {
  background: var(--color-surface-2);
  font-weight: 600;
}
</style>
