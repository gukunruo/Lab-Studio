<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PhCaretDown, PhX } from '@phosphor-icons/vue'
import { useModelsStore } from '../composables/useModels'
import type { AiModel, AiThemePreference, ChatParams } from '../types'

const modelsStore = useModelsStore()

const props = defineProps<{
  open: boolean
  params: ChatParams
  systemPrompt: string
  currentModel: AiModel | undefined
  theme: AiThemePreference
  resolvedTheme: 'light' | 'dark'
  locale: 'zh' | 'en'
  width: number
  dragging: boolean
}>()

const emit = defineEmits<{
  'update:params': [params: ChatParams]
  'update:systemPrompt': [prompt: string]
  'select-model': [model: AiModel]
  'update:theme': [theme: AiThemePreference]
  'update:locale': [locale: 'zh' | 'en']
  close: []
}>()

const labels = {
  zh: {
    settings: '设置',
    appearance: '外观与语言',
    appearanceHint: '调整当前 Playground 的显示方式',
    theme: '主题',
    system: '跟随系统',
    dark: '深色',
    light: '浅色',
    language: '语言',
    modelParams: '模型参数',
    modelParamsHint: '控制当前对话的模型与输出',
    currentModel: '当前模型',
    change: '更换',
    collapse: '收起',
    chatModels: '对话模型',
    reasoningModels: '推理模型',
    current: '当前',
    unavailable: '无权限',
    quota: '接口配额',
    context: '上下文',
    rpm: 'RPM',
    tpm: 'TPM',
    reasoning: '推理强度',
    maxTokens: '最大 Tokens',
    systemPrompt: 'System Prompt',
    systemPromptHint: '为当前对话设定角色与回答边界',
    promptPlaceholder: '例如：回答保持简洁，并优先给出可执行步骤。',
    close: '关闭设置',
  },
  en: {
    settings: 'Settings',
    appearance: 'Appearance & language',
    appearanceHint: 'Customize this Playground view',
    theme: 'Theme',
    system: 'System',
    dark: 'Dark',
    light: 'Light',
    language: 'Language',
    modelParams: 'Model parameters',
    modelParamsHint: 'Control the current model and output',
    currentModel: 'Current model',
    change: 'Change',
    collapse: 'Close',
    chatModels: 'Chat models',
    reasoningModels: 'Reasoning models',
    current: 'Current',
    unavailable: 'Unavailable',
    quota: 'API quota',
    context: 'context',
    rpm: 'RPM',
    tpm: 'TPM',
    reasoning: 'Reasoning effort',
    maxTokens: 'Max tokens',
    systemPrompt: 'System prompt',
    systemPromptHint: 'Set the role and boundaries for this conversation',
    promptPlaceholder: 'e.g. Keep answers concise and lead with actionable steps.',
    close: 'Close settings',
  },
} as const

const text = () => labels[props.locale]

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (modelPickerOpen.value) closeModelPicker()
    else emit('close')
  }
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerdown))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerdown)
  removeModelMenuListeners()
})

function formatStatus(model: AiModel): string {
  return model.status === 'unavailable' ? text().unavailable : text().current
}

function formatCapability(capability: string): string {
  return capability
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function setReasoningEffort(level: 'low' | 'medium' | 'high') {
  emit('update:params', { ...props.params, reasoningEffort: level })
}

function setMaxTokens(value: number) {
  emit('update:params', { ...props.params, maxTokens: value })
}

const modelPickerOpen = ref(false)
const modelTrigger = ref<HTMLElement | null>(null)
const modelMenu = ref<HTMLElement | null>(null)
const modelMenuStyle = ref<Record<string, string>>({})

function updateModelMenuPosition() {
  const trigger = modelTrigger.value
  if (!trigger || !modelPickerOpen.value) return

  const rect = trigger.getBoundingClientRect()
  const viewportPadding = 12
  const gap = 6
  const width = Math.min(Math.max(rect.width, 280), window.innerWidth - viewportPadding * 2)
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    window.innerWidth - width - viewportPadding,
  )
  const availableBelow = window.innerHeight - rect.bottom - gap - viewportPadding
  const availableAbove = rect.top - gap - viewportPadding
  const openAbove = availableBelow < 320 && availableAbove > availableBelow
  const maxHeight = Math.max(220, Math.min(520, openAbove ? availableAbove : availableBelow))

  modelMenuStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
    ...(openAbove
      ? { bottom: `${window.innerHeight - rect.top + gap}px` }
      : { top: `${rect.bottom + gap}px` }),
  }
}

function addModelMenuListeners() {
  window.addEventListener('resize', updateModelMenuPosition)
  window.addEventListener('scroll', updateModelMenuPosition, true)
}

function removeModelMenuListeners() {
  window.removeEventListener('resize', updateModelMenuPosition)
  window.removeEventListener('scroll', updateModelMenuPosition, true)
}

async function openModelPicker() {
  modelPickerOpen.value = true
  await nextTick()
  updateModelMenuPosition()
  addModelMenuListeners()
}

function closeModelPicker() {
  modelPickerOpen.value = false
  modelMenuStyle.value = {}
  removeModelMenuListeners()
}

function toggleModelPicker() {
  if (modelPickerOpen.value) closeModelPicker()
  else void openModelPicker()
}

function onModelMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    closeModelPicker()
    modelTrigger.value?.focus()
  }
}

function onModelMenuPointerdown(event: PointerEvent) {
  event.stopPropagation()
}

function onDocumentPointerdown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!modelPickerOpen.value || modelTrigger.value?.contains(target) || modelMenu.value?.contains(target)) return
  closeModelPicker()
}

function selectModel(model: AiModel) {
  if (model.status === 'unavailable') return
  emit('select-model', model)
  closeModelPicker()
}

function formatContext(value: number | null | undefined): string {
  if (!value) return '—'
  return value >= 1_000_000 ? `${value / 1_000_000}M` : `${Math.round(value / 1000)}k`
}

function formatQuota(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? `— ${unit}` : `${value.toLocaleString()} ${unit}`
}

</script>

<template>
  <aside
    class="param-panel"
    :class="{ 'param-panel--open': open, 'param-panel--dragging': dragging }"
    :style="{ '--param-panel-width': `${width}px` }"
    :aria-hidden="!open"
    @keydown="onPanelKeydown"
  >
    <div class="param-panel__inner">
      <div class="param-panel__titlebar">
        <div>
          <div class="param-panel__eyebrow">PLAYGROUND</div>
          <h2 class="param-panel__title">{{ text().settings }}</h2>
        </div>
        <button class="param-panel__close" type="button" :aria-label="text().close" :title="text().close" @click="emit('close')">
          <PhX :size="16" weight="regular" />
        </button>
      </div>

      <section class="param-panel__section">
        <div class="param-panel__section-heading">
          <div>
            <h3 class="param-panel__section-title">{{ text().appearance }}</h3>
            <p>{{ text().appearanceHint }}</p>
          </div>
          <span class="param-panel__section-index">01</span>
        </div>
        <div class="param-panel__group">
          <label class="param-panel__label">{{ text().theme }}</label>
          <div class="param-panel__pills">
            <button class="param-panel__pill" :class="{ 'param-panel__pill--active': theme === 'system' }" :aria-pressed="theme === 'system'" type="button" @click="emit('update:theme', 'system')">
              {{ text().system }}
            </button>
            <button class="param-panel__pill" :class="{ 'param-panel__pill--active': theme === 'dark' }" :aria-pressed="theme === 'dark'" type="button" @click="emit('update:theme', 'dark')">
              {{ text().dark }}
            </button>
            <button class="param-panel__pill" :class="{ 'param-panel__pill--active': theme === 'light' }" :aria-pressed="theme === 'light'" type="button" @click="emit('update:theme', 'light')">
              {{ text().light }}
            </button>
          </div>
        </div>
        <div class="param-panel__group">
          <label class="param-panel__label">{{ text().language }}</label>
          <div class="param-panel__pills">
            <button class="param-panel__pill" :class="{ 'param-panel__pill--active': locale === 'zh' }" :aria-pressed="locale === 'zh'" type="button" @click="emit('update:locale', 'zh')">
              中文
            </button>
            <button class="param-panel__pill" :class="{ 'param-panel__pill--active': locale === 'en' }" :aria-pressed="locale === 'en'" type="button" @click="emit('update:locale', 'en')">
              English
            </button>
          </div>
        </div>
      </section>

      <section class="param-panel__section param-panel__section--model">
        <div class="param-panel__section-heading">
          <div>
            <h3 class="param-panel__section-title">{{ text().modelParams }}</h3>
            <p>{{ text().modelParamsHint }}</p>
          </div>
          <span class="param-panel__section-index">02</span>
        </div>
        <div class="param-panel__group">
          <label class="param-panel__label">{{ text().currentModel }}</label>
          <div class="param-panel__model-picker" :class="{ 'param-panel__model-picker--open': modelPickerOpen }">
            <button
              ref="modelTrigger"
              class="param-panel__model-trigger"
              type="button"
              :aria-expanded="modelPickerOpen"
              @click="toggleModelPicker"
            >
              <span class="param-panel__model-trigger-main">
                <span class="param-panel__badge-dot" />
                <span>
                  <strong>{{ currentModel?.displayName ?? '—' }}</strong>
                  <small>{{ currentModel?.vendor ?? '—' }} · {{ formatContext(currentModel?.contextWindow) }} {{ text().context }}</small>
                </span>
              </span>
              <span class="param-panel__model-trigger-action">{{ modelPickerOpen ? text().collapse : text().change }} <PhCaretDown :size="12" weight="bold" /></span>
            </button>

            <Teleport to="body">
              <div
                v-if="modelPickerOpen"
                ref="modelMenu"
                class="param-panel__model-menu"
                :data-theme="resolvedTheme"
                :style="modelMenuStyle"
                role="listbox"
                :aria-label="text().currentModel"
                tabindex="-1"
                @keydown="onModelMenuKeydown"
              >
                <div v-for="group in [
                  { label: text().chatModels, models: modelsStore.chatModels },
                  { label: text().reasoningModels, models: modelsStore.reasoningModels },
                ]" :key="group.label" class="param-panel__model-group">
                  <div v-if="group.models.length" class="param-panel__model-group-label">{{ group.label }}</div>
                  <button
                    v-for="model in group.models"
                    :key="model.modelId"
                    class="param-panel__model-option"
                    :class="{
                      'param-panel__model-option--active': model.modelId === currentModel?.modelId,
                      'param-panel__model-option--unavailable': model.status === 'unavailable',
                    }"
                    type="button"
                    role="option"
                    :aria-selected="model.modelId === currentModel?.modelId"
                    :disabled="model.status === 'unavailable'"
                    @click="selectModel(model)"
                  >
                    <span class="param-panel__model-option-head">
                      <span class="param-panel__model-option-name">{{ model.displayName }}</span>
                      <span v-if="model.modelId === currentModel?.modelId" class="param-panel__model-option-current">{{ text().current }}</span>
                      <span v-else-if="model.status === 'unavailable'" class="param-panel__model-option-current">{{ text().unavailable }}</span>
                    </span>
                    <span class="param-panel__model-option-meta">
                      <span>{{ model.vendor }}</span>
                      <span>{{ formatContext(model.contextWindow) }} {{ text().context }}</span>
                      <span>{{ formatQuota(model.rpmLimit, text().rpm) }}</span>
                      <span>{{ formatQuota(model.tpmLimit, text().tpm) }}</span>
                    </span>
                    <span v-if="model.capabilities.length" class="param-panel__model-option-capabilities">
                      <span v-for="capability in model.capabilities.slice(0, 4)" :key="capability">{{ formatCapability(capability) }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </Teleport>
          </div>
          <div v-if="currentModel" class="param-panel__model-summary" :class="{ 'param-panel__model-summary--muted': modelPickerOpen }">
            <span>{{ text().quota }}</span>
            <div class="param-panel__quota-values">
              <span><strong>{{ currentModel.rpmLimit ?? '—' }}</strong> {{ text().rpm }}</span>
              <span><strong>{{ currentModel.tpmLimit ?? '—' }}</strong> {{ text().tpm }}</span>
            </div>
          </div>
        </div>

        <div class="param-panel__group">
          <label class="param-panel__label">{{ text().reasoning }}</label>
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
            {{ text().maxTokens }}
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
          <div class="param-panel__label-row">
            <label class="param-panel__label">{{ text().systemPrompt }}</label>
            <span class="param-panel__field-hint">{{ text().systemPromptHint }}</span>
          </div>
          <textarea
            class="param-panel__textarea"
            :placeholder="text().promptPlaceholder"
            :value="systemPrompt"
            @input="emit('update:systemPrompt', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.param-panel {
  width: 0;
  flex: 0 0 0;
  height: 100%;
  min-height: 0;
  background: var(--color-bg-elevated);
  border-left: 1px solid var(--color-border-subtle);
  overflow: hidden;
  overscroll-behavior: contain;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), flex-basis 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.param-panel--open {
  width: var(--param-panel-width);
  min-width: var(--param-panel-width);
  flex: 0 0 var(--param-panel-width);
}

.param-panel--dragging {
  transition: none;
}

.param-panel__inner {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 16px 28px;
  opacity: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
  transition: opacity 0.3s 0.1s;
}

.param-panel--open .param-panel__inner {
  opacity: 1;
}

.param-panel__titlebar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 0 2px 20px;
}

.param-panel__eyebrow,
.param-panel__section-index {
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.param-panel__title {
  margin: 4px 0 0;
  color: var(--color-text);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.param-panel__close {
  width: 30px;
  height: 30px;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  margin-top: 2px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.param-panel__close:hover,
.param-panel__close:focus-visible {
  border-color: var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
  outline: none;
}

.param-panel__section {
  margin-bottom: 16px;
  padding: 14px 12px 4px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-surface) 42%, transparent);
}

.param-panel__section--model {
  margin-bottom: 0;
  padding-bottom: 4px;
}


.param-panel__section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
}

.param-panel__section-title {
  margin: 0;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.param-panel__section-heading p {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.param-panel__section-index {
  flex-shrink: 0;
  padding-top: 1px;
  opacity: 0.72;
}

.param-panel__group {
  margin-bottom: 18px;
}

.param-panel__section .param-panel__group:last-child {
  margin-bottom: 14px;
}

.param-panel__label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.param-panel__field-hint {
  color: var(--color-text-muted);
  font-size: 9px;
  line-height: 1.35;
  text-align: right;
}

.param-panel__label-row .param-panel__label {
  margin-bottom: 0;
}

.param-panel__pill:focus-visible,
.param-panel__model-option:focus-visible,
.param-panel__model-trigger:focus-visible,
.param-panel__slider:focus-visible,
.param-panel__textarea:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .param-panel--open {
    position: absolute;
    inset: 0 0 0 auto;
    z-index: 40;
    box-shadow: -18px 0 48px rgba(0, 0, 0, 0.22);
  }
}

.param-panel__model-picker {
  position: relative;
}

.param-panel__model-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.param-panel__model-trigger:hover,
.param-panel__model-trigger:focus-visible {
  border-color: var(--color-accent);
  outline: none;
}

.param-panel__model-trigger-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.param-panel__model-trigger-main > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.param-panel__model-trigger strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.param-panel__model-trigger small {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.param-panel__model-trigger-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: var(--color-accent);
  font-size: 10px;
}

.param-panel__model-trigger-action :deep(svg) {
  transition: transform 0.2s;
}

.param-panel__model-trigger[aria-expanded='true'] .param-panel__model-trigger-action :deep(svg) {
  transform: rotate(180deg);
}

.param-panel__badge-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 8px var(--color-accent-glow);
}

.param-panel__model-menu {
  --color-bg-elevated: #111113;
  --color-surface: rgba(255, 255, 255, 0.045);
  --color-surface-2: rgba(255, 255, 255, 0.07);
  --color-text: #f4f4f5;
  --color-text-muted: #a1a1aa;
  --color-border-strong: rgba(255, 255, 255, 0.13);
  --color-accent: #2dd4bf;
  --color-accent-soft: rgba(45, 212, 191, 0.12);
  --radius-md: 14px;
  --radius-sm: 10px;
  --radius-full: 9999px;
  position: fixed;
  z-index: 1000;
  max-width: calc(100vw - 24px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  padding: 6px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.param-panel__model-menu[data-theme='light'] {
  --color-bg-elevated: #f7f7f8;
  --color-surface: #f7f7f8;
  --color-surface-2: #efefef;
  --color-text: #18181b;
  --color-text-muted: #71717a;
  --color-border-strong: rgba(24, 24, 27, 0.14);
  --color-accent: #0d9488;
  --color-accent-soft: #ccfbf1;
  box-shadow: 0 18px 48px rgba(24, 24, 27, 0.18);
}

.param-panel__model-menu :deep(.param-panel__model-option) {
  display: block;
}

.param-panel__model-menu :deep(.param-panel__model-option:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.param-panel__model-menu :deep(.param-panel__model-option:disabled) {
  cursor: not-allowed;
}

.param-panel__model-menu::-webkit-scrollbar {
  width: 6px;
}

.param-panel__model-menu::-webkit-scrollbar-thumb {
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
}

.param-panel__model-menu::-webkit-scrollbar-track {
  background: transparent;
}

.param-panel__model-menu .param-panel__model-group + .param-panel__model-group {
  margin-top: 6px;
}

.param-panel__model-menu .param-panel__model-group-label {
  padding: 7px 8px 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.param-panel__model-menu .param-panel__model-option {
  display: block;
  width: 100%;
  padding: 9px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.param-panel__model-menu .param-panel__model-option:hover:not(:disabled) {
  background: var(--color-surface);
}

.param-panel__model-menu .param-panel__model-option--active {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
}

.param-panel__model-menu .param-panel__model-option--unavailable {
  opacity: 0.55;
  cursor: not-allowed;
}

.param-panel__model-menu .param-panel__model-option-head,
.param-panel__model-menu .param-panel__model-option-meta,
.param-panel__model-menu .param-panel__model-option-capabilities {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-panel__model-menu .param-panel__model-option-head {
  justify-content: space-between;
  gap: 8px;
}

.param-panel__model-menu .param-panel__model-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.param-panel__model-menu .param-panel__model-option-current {
  flex-shrink: 0;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__model-menu .param-panel__model-option-meta {
  flex-wrap: wrap;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__model-menu .param-panel__model-option-meta span + span::before {
  content: '·';
  margin-right: 6px;
  color: var(--color-border-strong);
}

.param-panel__model-menu .param-panel__model-option-capabilities {
  flex-wrap: wrap;
  margin-top: 6px;
}

.param-panel__model-menu .param-panel__model-option-capabilities span {
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: 9px;
}

.param-panel__model-menu .param-panel__model-option:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

@media (max-height: 680px) {
  .param-panel__model-menu {
    max-height: min(390px, calc(100dvh - 150px));
  }
}

@media (max-width: 720px) {
  .param-panel__model-menu {
    max-width: calc(100vw - 24px);
    max-height: min(440px, calc(100dvh - 190px));
  }
}

.param-panel__model-picker--open .param-panel__model-trigger {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.param-panel__model-summary--muted {
  opacity: 0.45;
}

.param-panel__model-option:disabled {
  cursor: not-allowed;
}

@media (max-height: 680px) {
  .param-panel__model-menu {
    max-height: min(390px, calc(100dvh - 150px));
  }
}

@media (max-width: 720px) {
  .param-panel__model-menu {
    max-height: min(440px, calc(100dvh - 190px));
  }
}

.param-panel__model-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding: 9px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface) 76%, transparent);
  color: var(--color-text-muted);
  font-size: 10px;
}

.param-panel__quota-values {
  display: flex;
  gap: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__quota-values strong {
  color: var(--color-text);
  font-size: 10px;
  font-weight: 550;
}

.param-panel__model-summary > span {
  font-size: 9px;
}

.param-panel__model-summary strong {
  color: var(--color-text);
  font-weight: 500;
  text-align: right;
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

.param-panel__quota { display: none; }

.param-panel__model-menu::-webkit-scrollbar {
  width: 6px;
}

.param-panel__model-menu::-webkit-scrollbar-thumb {
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
}

.param-panel__model-menu::-webkit-scrollbar-track {
  background: transparent;
}

.param-panel__model-picker--open .param-panel__model-trigger {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.param-panel__model-summary--muted {
  opacity: 0.45;
}

.param-panel__model-option:disabled {
  cursor: not-allowed;
}

@media (max-height: 680px) {
  .param-panel__model-menu {
    max-height: min(390px, calc(100dvh - 150px));
  }
}

@media (max-width: 720px) {
  .param-panel__model-menu {
    max-height: min(440px, calc(100dvh - 190px));
  }
}

.param-panel__model-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 9px;
  padding: 9px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface) 76%, transparent);
  color: var(--color-text-muted);
  font-size: 10px;
}

.param-panel__quota-values {
  display: flex;
  gap: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__quota-values strong {
  color: var(--color-text);
  font-size: 10px;
  font-weight: 550;
}

.param-panel__model-summary > span {
  font-size: 9px;
}

.param-panel__model-summary strong {
  color: var(--color-text);
  font-weight: 500;
  text-align: right;
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

.param-panel__quota { display: none; }

.param-panel__model-group + .param-panel__model-group {
  margin-top: 6px;
}

.param-panel__model-group-label {
  padding: 7px 8px 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.param-panel__model-option {
  display: block;
  width: 100%;
  padding: 9px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.param-panel__model-option:hover:not(:disabled) {
  background: var(--color-surface);
}

.param-panel__model-option--active {
  background: var(--color-accent-soft);
  border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
}

.param-panel__model-option--unavailable {
  opacity: 0.55;
  cursor: not-allowed;
}

.param-panel__model-option-head,
.param-panel__model-option-meta,
.param-panel__model-option-capabilities {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-panel__model-option-head {
  justify-content: space-between;
  gap: 8px;
}

.param-panel__model-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.param-panel__model-option-current {
  flex-shrink: 0;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__model-option-meta {
  flex-wrap: wrap;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
}

.param-panel__model-option-meta span + span::before {
  content: '·';
  margin-right: 6px;
  color: var(--color-border-strong);
}

.param-panel__model-option-capabilities {
  flex-wrap: wrap;
  margin-top: 6px;
}

.param-panel__model-option-capabilities span {
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  font-size: 9px;
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

.param-panel__quota { display: none; }

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
