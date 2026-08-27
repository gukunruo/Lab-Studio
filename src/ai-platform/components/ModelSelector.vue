<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, type ComponentPublicInstance } from 'vue'
import { RECOMMENDED_CHAT_MODEL_IDS, useModelsStore } from '../composables/useModels'
import type { AiModel } from '../types'
import { PhCaretDown } from '@phosphor-icons/vue'

const modelsStore = useModelsStore()
const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const optionRefs = ref<HTMLButtonElement[]>([])
const emit = defineEmits<{ select: [model: AiModel] }>()
const props = defineProps<{ currentModelId: string }>()

const recommendedChatModelIdSet = new Set<string>(RECOMMENDED_CHAT_MODEL_IDS)

const allModels = () => [...modelsStore.chatModels, ...modelsStore.reasoningModels]
const recommendedModels = () => RECOMMENDED_CHAT_MODEL_IDS
  .map((modelId) => allModels().find((model) => model.modelId === modelId))
  .filter((model): model is AiModel => Boolean(model))
const otherChatModels = () => modelsStore.chatModels.filter((model) => !recommendedChatModelIdSet.has(model.modelId))

function availableModels(): AiModel[] {
  return allModels().filter((model) => model.status !== 'unavailable')
}

async function openMenu() {
  open.value = true
  await nextTick()
  const selectedIndex = availableModels().findIndex((model) => model.modelId === props.currentModelId)
  optionRefs.value[selectedIndex >= 0 ? selectedIndex : 0]?.focus()
}

function closeMenu() {
  open.value = false
  void nextTick(() => triggerRef.value?.focus())
}

function toggle() {
  if (open.value) closeMenu()
  else void openMenu()
}

function select(model: AiModel) {
  if (model.status === 'unavailable') return
  emit('select', model)
  closeMenu()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void openMenu()
  }
}

function setOptionRef(model: AiModel, element: Element | ComponentPublicInstance | null) {
  const index = availableModels().findIndex((option) => option.modelId === model.modelId)
  if (index >= 0 && element instanceof HTMLButtonElement) optionRefs.value[index] = element
}

function onOptionKeydown(event: KeyboardEvent, model: AiModel) {
  const options = availableModels()
  const index = options.findIndex((option) => option.modelId === model.modelId)
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    select(model)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    optionRefs.value[nextIndex]?.focus()
  } else if (event.key === 'Home') {
    event.preventDefault()
    optionRefs.value[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    optionRefs.value.at(-1)?.focus()
  }
}

function handleClickOutside(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (!el.closest('.model-selector') && open.value) closeMenu()
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const currentModel = () => modelsStore.findById(props.currentModelId)
</script>

<template>
  <div class="model-selector" :class="{ 'model-selector--open': open }">
    <button
      ref="triggerRef"
      class="model-selector__trigger"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-controls="ai-model-options"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="model-selector__dot" />
      <span class="model-selector__name">{{ currentModel()?.displayName ?? currentModelId }}</span>
      <span class="model-selector__vendor">{{ currentModel()?.vendor }}</span>
      <PhCaretDown class="model-selector__chevron" :size="12" weight="bold" />
    </button>
    <div v-if="open" id="ai-model-options" class="model-selector__dropdown" role="listbox" aria-label="选择模型" @keydown.esc.prevent="closeMenu">
      <div v-if="recommendedModels().length" class="model-selector__group model-selector__group--recommended">
        <div class="model-selector__group-label">推荐模型</div>
        <button
          v-for="m in recommendedModels()"
          :key="m.modelId"
          :ref="(element) => setOptionRef(m, element)"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          role="option"
          :aria-selected="m.modelId === currentModelId"
          :disabled="m.status === 'unavailable'"
          @click="select(m)"
          @keydown="onOptionKeydown($event, m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId, 'model-selector__item-dot--unavailable': m.status === 'unavailable' }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.status === 'unavailable' ? '无权限' : m.vendor }}</span>
        </button>
      </div>
      <div v-if="otherChatModels().length" class="model-selector__group">
        <div class="model-selector__group-label">其他对话模型</div>
        <button
          v-for="m in otherChatModels()"
          :key="m.modelId"
          :ref="(element) => setOptionRef(m, element)"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          role="option"
          :aria-selected="m.modelId === currentModelId"
          :disabled="m.status === 'unavailable'"
          @click="select(m)"
          @keydown="onOptionKeydown($event, m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId, 'model-selector__item-dot--unavailable': m.status === 'unavailable' }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.status === 'unavailable' ? '无权限' : m.vendor }}</span>
        </button>
      </div>
      <div v-if="modelsStore.reasoningModels.length" class="model-selector__group">
        <div class="model-selector__group-label">推理模型</div>
        <button
          v-for="m in modelsStore.reasoningModels"
          :key="m.modelId"
          :ref="(element) => setOptionRef(m, element)"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          role="option"
          :aria-selected="m.modelId === currentModelId"
          :disabled="m.status === 'unavailable'"
          @click="select(m)"
          @keydown="onOptionKeydown($event, m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId, 'model-selector__item-dot--unavailable': m.status === 'unavailable' }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.status === 'unavailable' ? '无权限' : m.vendor }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.model-selector {
  position: relative;
}

.model-selector__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 12px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.model-selector__trigger:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-2) 80%, var(--color-accent-soft));
}

.model-selector__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 8px var(--color-accent-glow);
  animation: ms-pulse 2.5s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes ms-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.model-selector__vendor {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  padding: 1px 6px;
  background: var(--color-surface);
  border-radius: var(--radius-full);
}

.model-selector__chevron {
  color: var(--color-text-muted);
  font-size: 10px;
  transition: transform 0.2s;
}

.model-selector--open .model-selector__chevron {
  transform: rotate(180deg);
}

.model-selector__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  max-width: min(420px, calc(100vw - 32px));
  max-height: min(520px, calc(100dvh - 88px));
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: color-mix(in srgb, var(--color-bg-elevated) 85%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  z-index: 100;
  padding: 6px;
  backdrop-filter: blur(16px) saturate(125%);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.model-selector__dropdown::-webkit-scrollbar {
  width: 6px;
}

.model-selector__dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.model-selector__dropdown::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-border-strong);
}

.model-selector__group-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  padding: 8px 10px 4px;
}

.model-selector__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  font-family: var(--font-sans);
  text-align: left;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.model-selector__item:hover {
  background: var(--color-surface);
}

.model-selector__item:has(.model-selector__item-dot--unavailable) {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.58;
}

.model-selector__item-dot--unavailable {
  background: var(--color-danger);
  box-shadow: none;
}

.model-selector__item--active {
  background: var(--color-accent-soft);
}

.model-selector__item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.model-selector__item-dot--active {
  background: var(--color-accent);
}

.model-selector__item-vendor {
  margin-left: auto;
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.model-selector__item-quota {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  white-space: nowrap;
}
</style>
