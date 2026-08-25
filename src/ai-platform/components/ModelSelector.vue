<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useModelsStore } from '../composables/useModels'
import type { AiModel } from '../types'
import { PhCaretDown } from '@phosphor-icons/vue'

const modelsStore = useModelsStore()
const open = ref(false)
const emit = defineEmits<{ select: [model: AiModel] }>()
const props = defineProps<{ currentModelId: string }>()

const recommendedModelIds = [
  'glm-5.2',
  'doubao-seed-2.0-mini',
  'claude-opus-5',
  'gpt-5.6-sol',
  'deepseek-v4-pro',
  'kimi-k3',
]

const recommendedChatModels = computed(() => recommendedModelIds
  .map((modelId) => modelsStore.chatModels.find((model) => model.modelId === modelId))
  .filter((model): model is AiModel => Boolean(model)))

const otherChatModels = computed(() => modelsStore.chatModels
  .filter((model) => !recommendedModelIds.includes(model.modelId)))

function toggle() {
  open.value = !open.value
}

function select(model: AiModel) {
  emit('select', model)
  open.value = false
}

function handleClickOutside(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (!el.closest('.model-selector')) open.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

const currentModel = () => modelsStore.findById(props.currentModelId)
</script>

<template>
  <div class="model-selector" :class="{ 'model-selector--open': open }">
    <button class="model-selector__trigger" type="button" @click="toggle">
      <span class="model-selector__dot" />
      <span class="model-selector__name">{{ currentModel()?.displayName ?? currentModelId }}</span>
      <span class="model-selector__vendor">{{ currentModel()?.vendor }}</span>
      <PhCaretDown class="model-selector__chevron" :size="12" weight="bold" />
    </button>
    <div v-if="open" class="model-selector__dropdown">
      <div v-if="recommendedChatModels.length" class="model-selector__group">
        <div class="model-selector__group-label">推荐模型</div>
        <button
          v-for="m in recommendedChatModels"
          :key="m.modelId"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          @click="select(m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.vendor }}</span>
        </button>
      </div>
      <div v-if="otherChatModels.length" class="model-selector__group">
        <div class="model-selector__group-label">对话模型</div>
        <button
          v-for="m in otherChatModels"
          :key="m.modelId"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          @click="select(m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.vendor }}</span>
        </button>
      </div>
      <div v-if="modelsStore.reasoningModels.length" class="model-selector__group">
        <div class="model-selector__group-label">推理模型</div>
        <button
          v-for="m in modelsStore.reasoningModels"
          :key="m.modelId"
          class="model-selector__item"
          :class="{ 'model-selector__item--active': m.modelId === currentModelId }"
          type="button"
          @click="select(m)"
        >
          <span class="model-selector__item-dot" :class="{ 'model-selector__item-dot--active': m.modelId === currentModelId }" />
          {{ m.displayName }}
          <span class="model-selector__item-vendor">{{ m.vendor }}</span>
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
  background: color-mix(in srgb, var(--color-bg-elevated) 85%, transparent);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  z-index: 50;
  padding: 6px;
  backdrop-filter: blur(16px) saturate(125%);
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
</style>
