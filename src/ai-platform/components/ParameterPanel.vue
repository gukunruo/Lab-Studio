<script setup lang="ts">
import { computed } from 'vue'
import { useModelsStore } from '../composables/useModels'
import type { AiModel, ChatParams } from '../types'

const modelsStore = useModelsStore()

const props = defineProps<{
  open: boolean
  params: ChatParams
  systemPrompt: string
  currentModel: AiModel | undefined
}>()

const emit = defineEmits<{
  'update:params': [params: ChatParams]
  'update:systemPrompt': [prompt: string]
  'select-model': [model: AiModel]
}>()

function setReasoningEffort(level: 'low' | 'medium' | 'high') {
  emit('update:params', { ...props.params, reasoningEffort: level })
}

function setMaxTokens(value: number) {
  emit('update:params', { ...props.params, maxTokens: value })
}

const selectableModels = computed(() => [...modelsStore.chatModels, ...modelsStore.reasoningModels])

function selectModel(modelId: string) {
  const model = selectableModels.value.find((item) => item.modelId === modelId)
  if (model) emit('select-model', model)
}
</script>

<template>
  <aside class="param-panel" :class="{ 'param-panel--open': open }">
    <div class="param-panel__inner">
      <div class="param-panel__title">模型参数</div>

      <div class="param-panel__group">
        <label class="param-panel__label">当前模型</label>
        <select
          class="param-panel__select"
          :value="currentModel?.modelId"
          @change="selectModel(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="model in selectableModels" :key="model.modelId" :value="model.modelId">
            {{ model.displayName }}
          </option>
        </select>
        <div v-if="currentModel" class="param-panel__badge">
          <span class="param-panel__badge-dot" />
          {{ currentModel.vendor }} · {{ currentModel.contextWindow ? `${Math.round(currentModel.contextWindow / 1000)}k context` : 'context' }}
        </div>
      </div>

      <div class="param-panel__group">
        <label class="param-panel__label">推理强度</label>
        <div class="param-panel__pills">
          <button
            v-for="level in ['low', 'medium', 'high'] as const"
            :key="level"
            class="param-panel__pill"
            :class="{ 'param-panel__pill--active': params.reasoningEffort === level }"
            type="button"
            @click="setReasoningEffort(level)"
          >
            {{ level }}
          </button>
        </div>
      </div>

      <div class="param-panel__group">
        <label class="param-panel__label">
          最大 Tokens
          <span class="param-panel__value">{{ params.maxTokens ?? 4096 }}</span>
        </label>
        <input
          type="range"
          class="param-panel__slider"
          min="256"
          max="16384"
          step="256"
          :value="params.maxTokens ?? 4096"
          @input="setMaxTokens(Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <div class="param-panel__group">
        <label class="param-panel__label">System Prompt</label>
        <textarea
          class="param-panel__textarea"
          placeholder="输入系统提示词…"
          :value="systemPrompt"
          @input="emit('update:systemPrompt', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.param-panel {
  width: 0;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  background: var(--color-bg-elevated);
  border-left: 1px solid var(--color-border-subtle);
  overflow: hidden;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.param-panel--open {
  width: 300px;
}

.param-panel__inner {
  width: 300px;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 20px;
  opacity: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
  transition: opacity 0.3s 0.1s;
}

.param-panel--open .param-panel__inner {
  opacity: 1;
}

.param-panel__title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--color-text);
}

.param-panel__group {
  margin-bottom: 20px;
}

.param-panel__select {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 13px;
  font-family: var(--font-sans);
  outline: none;
  transition: border-color 0.2s;
}

.param-panel__select:focus {
  border-color: var(--color-accent);
}

.param-panel__select option {
  background: var(--color-bg-elevated);
  color: var(--color-text);
}


.param-panel__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.param-panel__badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
}

.param-panel__label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.param-panel__value {
  font-family: var(--font-mono);
  color: var(--color-accent);
  text-transform: none;
}

.param-panel__pills {
  display: flex;
  gap: 6px;
}

.param-panel__pill {
  flex: 1;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.15s;
}

.param-panel__pill:hover {
  border-color: var(--color-border-strong);
}

.param-panel__pill--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.param-panel__slider {
  width: 100%;
  -webkit-appearance: none;
  height: 4px;
  background: var(--color-surface-2);
  border-radius: var(--radius-full);
  outline: none;
}

.param-panel__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-accent);
  cursor: pointer;
  box-shadow: 0 0 8px var(--color-accent-soft);
  transition: transform 0.15s;
}

.param-panel__slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.param-panel__textarea {
  width: 100%;
  min-height: 80px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 10px 12px;
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
  line-height: 1.5;
}

.param-panel__textarea:focus {
  border-color: var(--color-accent);
}
</style>
