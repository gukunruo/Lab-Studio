<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ChatParams, ImageAspectRatio, ImageModelId } from '../types'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  imageShortcutMatches,
  nextTextareaHeight,
} from '../composer'
import { PhImage, PhLightning, PhPaperPlaneRight, PhStop, PhX } from '@phosphor-icons/vue'

const props = defineProps<{
  streaming: boolean
  imageGenerating?: boolean
  busy?: boolean
  params: ChatParams
  imageModels: Array<{ modelId: ImageModelId; displayName: string }>
}>()

const emit = defineEmits<{
  send: [content: string]
  'generate-image': [input: { prompt: string; aspectRatio: ImageAspectRatio; modelId: ImageModelId }]
  abort: []
  'abort-image': []
}>()

const mode = ref<'chat' | 'image'>('chat')
const chatDraft = ref('')
const imageDraft = ref('')
const imageAspectRatio = ref<ImageAspectRatio>('1:1')
const imageModelId = ref<ImageModelId>('gpt-image-2')
const composerWrapRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const currentDraft = computed({
  get: () => mode.value === 'chat' ? chatDraft.value : imageDraft.value,
  set: (value: string) => {
    if (mode.value === 'chat') chatDraft.value = value
    else imageDraft.value = value
  },
})

const selectedImageModelName = computed(() =>
  props.imageModels.find((model) => model.modelId === imageModelId.value)?.displayName ?? 'GPT-Image-2',
)

async function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${nextTextareaHeight(el.scrollHeight)}px`
  el.style.overflowY = el.scrollHeight > COMPOSER_INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
}

async function submit() {
  const content = chatDraft.value.trim()
  if (!content || props.streaming || props.busy || props.imageGenerating) return
  emit('send', content)
  chatDraft.value = ''
  await nextTick()
  await autoResize()
  textareaRef.value?.focus()
}

async function generateImage() {
  const prompt = imageDraft.value.trim()
  if (!prompt || props.streaming || props.busy || props.imageGenerating) return
  emit('generate-image', { prompt, aspectRatio: imageAspectRatio.value, modelId: imageModelId.value })
  imageDraft.value = ''
  await nextTick()
  await autoResize()
}

function enterImageMode() {
  if (props.streaming || props.busy || props.imageGenerating) return
  mode.value = 'image'
}

function exitImageMode() {
  mode.value = 'chat'
}

function onKeydown(event: KeyboardEvent) {
  if (mode.value === 'image') {
    if (event.key === 'Escape') {
      event.preventDefault()
      exitImageMode()
    } else if (imageShortcutMatches(event)) {
      event.preventDefault()
      void generateImage()
    }
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void submit()
  }
}

function restoreImageDraft(input: { prompt: string; aspectRatio: ImageAspectRatio; modelId: ImageModelId }) {
  imageDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio
  imageModelId.value = input.modelId
  mode.value = 'image'
}

watch([mode, currentDraft], () => void nextTick(autoResize))
onMounted(() => void autoResize())
defineExpose({ composerWrapRef, restoreImageDraft })
</script>

<template>
  <div ref="composerWrapRef" class="composer-wrap">
    <div v-if="$slots.suggestions && mode === 'chat'" class="composer-suggestions">
      <slot name="suggestions" />
    </div>
    <div class="composer" :class="{ 'composer--image': mode === 'image' }">
      <div v-if="mode === 'image'" class="composer__image-mode">
        <span class="composer__image-label"><PhImage :size="15" weight="fill" /> 生图</span>
        <label class="composer__model-select">
          <span class="sr-only">图片模型</span>
          <select v-model="imageModelId" aria-label="图片模型">
            <option v-for="model in imageModels" :key="model.modelId" :value="model.modelId">
              {{ model.displayName }}
            </option>
          </select>
        </label>
        <span class="composer__image-hint">⌘/Ctrl + Enter 生成</span>
        <button class="composer__image-exit" type="button" aria-label="退出生图模式" title="退出生图模式" @click="exitImageMode">
          <PhX :size="15" weight="bold" />
        </button>
      </div>
      <textarea
        ref="textareaRef"
        v-model="currentDraft"
        class="composer__input"
        :aria-label="mode === 'image' ? '图片描述输入框，按 Command 或 Ctrl 加 Enter 生成' : '消息输入框，按 Enter 发送，Shift 加 Enter 换行'"
        :placeholder="mode === 'image' ? `描述你想生成的图片 · ${selectedImageModelName}` : '输入消息，Enter 发送，Shift+Enter 换行'"
        rows="1"
        @input="autoResize"
        @keydown="onKeydown"
      />
      <div class="composer__bar">
        <div class="composer__tools">
          <template v-if="mode === 'chat'">
            <button
              class="composer__tool composer__tool--button"
              type="button"
              :disabled="streaming || busy || imageGenerating"
              @click="enterImageMode"
            >
              <PhImage :size="13" weight="regular" /> 生图
            </button>
            <span v-if="params.reasoningEffort" class="composer__tool composer__tool--active">
              <PhLightning :size="12" weight="fill" /> {{ params.reasoningEffort }}
            </span>
            <span v-if="params.maxTokens" class="composer__tool">max {{ params.maxTokens }}</span>
          </template>
          <span v-else class="composer__tool composer__tool--active">{{ selectedImageModelName }}</span>
        </div>
        <button
          v-if="streaming"
          class="composer__send composer__send--stop"
          type="button"
          title="停止"
          aria-label="停止生成"
          @click="emit('abort')"
        >
          <PhStop :size="14" weight="fill" />
        </button>
        <button
          v-else-if="imageGenerating"
          class="composer__send composer__send--stop"
          type="button"
          title="停止生成图片"
          aria-label="停止生成图片"
          @click="emit('abort-image')"
        >
          <PhStop :size="14" weight="fill" />
        </button>
        <button
          v-else
          class="composer__send"
          type="button"
          :disabled="!currentDraft.trim() || busy"
          :title="mode === 'image' ? '生成图片' : '发送'"
          :aria-label="mode === 'image' ? '生成图片' : '发送消息'"
          @click="mode === 'image' ? generateImage() : submit()"
        >
          <PhImage v-if="mode === 'image'" :size="16" weight="fill" />
          <PhPaperPlaneRight v-else :size="15" weight="fill" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.composer-wrap {
  --composer-height: 112px;
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex-shrink: 0;
  padding: 10px 24px 20px;
  background: linear-gradient(to bottom, transparent, var(--color-bg) 18%);
}

.composer-suggestions {
  max-width: 780px;
  margin: 0 auto 14px;
  padding: 0 4px;
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

.composer--image {
  border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
}

.composer__image-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 12px 0 18px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.composer__image-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-accent-strong);
  font-weight: 600;
}

.composer__model-select select {
  max-width: 190px;
  appearance: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  outline: none;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  padding: 5px 24px 5px 9px;
}

.composer__model-select select:focus {
  border-color: var(--color-accent);
}

.composer__image-hint {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 11px;
}

.composer__image-exit {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.composer__image-exit:hover {
  background: var(--color-surface);
  color: var(--color-text);
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
  max-height: 160px;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.composer__input::-webkit-scrollbar {
  width: 7px;
}

.composer__input::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
  background-clip: padding-box;
}

.composer__input::-webkit-scrollbar-track {
  background: transparent;
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

.composer__tool--button {
  cursor: pointer;
  font-family: var(--font-sans);
}

.composer__tool--button:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.composer__tool--button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
