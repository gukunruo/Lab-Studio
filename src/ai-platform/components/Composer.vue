<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ChatParams, ImageAspectRatio, ImageModelId } from '../types'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  composerSubmitMatches,
  nextTextareaHeight,
} from '../composer'
import { PhGlobe, PhImage, PhLightning, PhPaperPlaneRight, PhSparkle, PhStop, PhX } from '@phosphor-icons/vue'

const props = defineProps<{
  streaming: boolean
  imageGenerating?: boolean
  busy?: boolean
  params: ChatParams
  imageModels: Array<{ modelId: ImageModelId; displayName: string }>
  referenceImageId?: string | null
  referenceImageLabel?: string | null
}>()

const emit = defineEmits<{
  send: [content: string]
  'generate-image': [input: {
    prompt: string
    aspectRatio: ImageAspectRatio
    modelId: 'gpt-image-2'
    referenceImageId?: string
  }]
  'generate-gemini': [input: { prompt: string }]
  'clear-reference': []
  abort: []
  'abort-image': []
  'update:params': [params: ChatParams]
}>()

const mode = ref<'chat' | 'gpt-image' | 'gemini'>('chat')
const chatDraft = ref('')
const gptImageDraft = ref('')
const geminiDraft = ref('')
const imageAspectRatio = ref<ImageAspectRatio>('1:1')
const imageModelId = ref<ImageModelId>('gpt-image-2')
const composerWrapRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const currentDraft = computed({
  get: () => {
    if (mode.value === 'chat') return chatDraft.value
    return mode.value === 'gpt-image' ? gptImageDraft.value : geminiDraft.value
  },
  set: (value: string) => {
    if (mode.value === 'chat') chatDraft.value = value
    else if (mode.value === 'gpt-image') gptImageDraft.value = value
    else geminiDraft.value = value
  },
})

const selectedImageModelName = computed(() =>
  props.imageModels.find((model) => model.modelId === imageModelId.value)?.displayName
    ?? (imageModelId.value === 'gpt-image-2' ? 'GPT-Image-2' : 'Gemini 3 Pro Image'),
)
const hasReference = computed(() => Boolean(props.referenceImageId))
// 联网搜索默认开启：params 未显式记录时按开对待。
const webSearchOn = computed(() => props.params.webSearch ?? true)

function toggleWebSearch() {
  emit('update:params', { ...props.params, webSearch: !webSearchOn.value })
}
const imageMode = computed(() => mode.value !== 'chat')
const gptEditing = computed(() => mode.value === 'gpt-image' && hasReference.value)

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
  const prompt = gptImageDraft.value.trim()
  if (!prompt || props.streaming || props.busy || props.imageGenerating) return
  emit('generate-image', {
    prompt,
    aspectRatio: imageAspectRatio.value,
    modelId: 'gpt-image-2',
    ...(props.referenceImageId ? { referenceImageId: props.referenceImageId } : {}),
  })
  gptImageDraft.value = ''
  await nextTick()
  await autoResize()
}

async function generateGemini() {
  const prompt = geminiDraft.value.trim()
  if (!prompt || props.streaming || props.busy || props.imageGenerating) return
  emit('generate-gemini', { prompt })
  geminiDraft.value = ''
  await nextTick()
  await autoResize()
}

function enterImageMode() {
  if (props.streaming || props.busy || props.imageGenerating) return
  imageModelId.value = 'gpt-image-2'
  mode.value = 'gpt-image'
}

function exitImageMode() {
  mode.value = 'chat'
}

function changeImageModel() {
  mode.value = imageModelId.value === 'gemini-3-pro-image' ? 'gemini' : 'gpt-image'
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && imageMode.value) {
    event.preventDefault()
    exitImageMode()
    return
  }
  if (!composerSubmitMatches(event)) return
  event.preventDefault()
  if (mode.value === 'chat') void submit()
  else if (mode.value === 'gpt-image') void generateImage()
  else void generateGemini()
}

function restoreImageDraft(input: { prompt: string; aspectRatio: ImageAspectRatio; referenceImageId?: string }) {
  gptImageDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio
  imageModelId.value = 'gpt-image-2'
  mode.value = 'gpt-image'
}

function restoreGeminiDraft(input: { prompt: string }) {
  geminiDraft.value = input.prompt
  imageModelId.value = 'gemini-3-pro-image'
  mode.value = 'gemini'
}

watch([mode, currentDraft], () => void nextTick(autoResize))
onMounted(() => void autoResize())
defineExpose({ composerWrapRef, restoreImageDraft, restoreGeminiDraft })
</script>

<template>
  <div ref="composerWrapRef" class="composer-wrap">
    <div v-if="$slots.suggestions && mode === 'chat'" class="composer-suggestions">
      <slot name="suggestions" />
    </div>
    <div class="composer" :class="{ 'composer--image': imageMode, 'composer--gemini': mode === 'gemini' }">
      <div v-if="imageMode" class="composer__image-mode">
        <span class="composer__image-label">
          <PhSparkle v-if="mode === 'gemini'" :size="15" weight="fill" />
          <PhImage v-else :size="15" weight="fill" />
          {{ mode === 'gemini' ? 'Gemini 创作对话' : (gptEditing ? '编辑图片' : '生图') }}
        </span>
        <label class="composer__model-select">
          <span class="sr-only">图片模型</span>
          <select v-model="imageModelId" aria-label="图片模型" @change="changeImageModel">
            <option v-for="model in imageModels" :key="model.modelId" :value="model.modelId">
              {{ model.displayName }}
            </option>
          </select>
        </label>
        <span v-if="hasReference" class="composer__reference">
          {{ referenceImageLabel ?? '基于上一张图片' }}
          <button type="button" @click="emit('clear-reference')">移除参考图</button>
        </span>
        <span class="composer__image-hint">Enter {{ mode === 'gemini' ? '发送' : (gptEditing ? '编辑' : '生成') }}</span>
        <button class="composer__image-exit" type="button" aria-label="退出图片模式" title="退出图片模式" @click="exitImageMode">
          <PhX :size="15" weight="bold" />
        </button>
      </div>
      <textarea
        ref="textareaRef"
        v-model="currentDraft"
        class="composer__input"
        :aria-label="imageMode ? '图片创作输入框，按 Enter 发送，Shift 加 Enter 换行' : '消息输入框，按 Enter 发送，Shift 加 Enter 换行'"
        :placeholder="mode === 'chat'
          ? '输入消息，Enter 发送，Shift+Enter 换行'
          : mode === 'gemini'
            ? '描述你想创作或优化的内容，Enter 发送'
            : (gptEditing ? '描述如何编辑这张图片，Enter 编辑' : `描述你想生成的图片 · ${selectedImageModelName}`)"
        rows="1"
        @input="autoResize"
        @keydown="onKeydown"
      />
      <div class="composer__bar">
        <div class="composer__tools">
          <template v-if="mode === 'chat'">
            <button
              class="composer__tool composer__tool--button"
              :class="{ 'composer__tool--active': webSearchOn }"
              type="button"
              :disabled="streaming || busy || imageGenerating"
              :title="webSearchOn ? '联网搜索已开启，需最新/实时信息时 AI 会联网' : '联网搜索已关闭'"
              :aria-pressed="webSearchOn"
              @click="toggleWebSearch"
            >
              <PhGlobe :size="13" weight="regular" /> 联网
            </button>
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
          title="停止图片创作"
          aria-label="停止图片创作"
          @click="emit('abort-image')"
        >
          <PhStop :size="14" weight="fill" />
        </button>
        <button
          v-else
          class="composer__send"
          type="button"
          :disabled="!currentDraft.trim() || busy"
          :title="mode === 'chat' ? '发送' : (mode === 'gemini' ? '发送创作指令' : (gptEditing ? '编辑图片' : '生成图片'))"
          :aria-label="mode === 'chat' ? '发送消息' : (mode === 'gemini' ? '发送创作指令' : (gptEditing ? '编辑图片' : '生成图片'))"
          @click="mode === 'chat' ? submit() : (mode === 'gemini' ? generateGemini() : generateImage())"
        >
          <PhImage v-if="mode === 'gpt-image'" :size="16" weight="fill" />
          <PhSparkle v-else-if="mode === 'gemini'" :size="16" weight="fill" />
          <PhPaperPlaneRight v-else :size="15" weight="fill" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.composer-wrap { --composer-height: 112px; position: sticky; bottom: 0; z-index: 2; flex-shrink: 0; padding: 10px 24px 20px; background: linear-gradient(to bottom, transparent, var(--color-bg) 18%); }
.composer-suggestions { max-width: 780px; margin: 0 auto 14px; padding: 0 4px; }
.composer { max-width: 780px; margin: 0 auto; position: relative; background: var(--color-surface-2); border: 1px solid var(--color-border); border-radius: var(--radius-lg); transition: border-color .2s cubic-bezier(.16,1,.3,1); }
.composer:focus-within { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-soft), 0 8px 32px rgba(0,0,0,.3); }
.composer--image { border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-border)); }
.composer--gemini { border-color: color-mix(in srgb, #8b5cf6 48%, var(--color-border)); }
.composer__image-mode { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 12px 0 18px; color: var(--color-text-muted); font-size: 12px; }
.composer__image-label, .composer__reference { display: inline-flex; align-items: center; gap: 5px; }
.composer__image-label { color: var(--color-accent-strong); font-weight: 600; white-space: nowrap; }
.composer__model-select select { max-width: 190px; appearance: none; border: 1px solid var(--color-border); border-radius: var(--radius-full); outline: none; background: var(--color-surface); color: var(--color-text); cursor: pointer; font: inherit; font-size: 11px; padding: 5px 24px 5px 9px; }
.composer__model-select select:focus { border-color: var(--color-accent); }
.composer__reference { min-width: 0; color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
.composer__reference button { border: 0; background: transparent; color: var(--color-accent-strong); cursor: pointer; font: inherit; font-size: 11px; padding: 0; }
.composer__reference button:hover { text-decoration: underline; }
.composer__image-hint { margin-left: auto; color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
.composer__image-exit { display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: var(--radius-full); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.composer__image-exit:hover { background: var(--color-surface); color: var(--color-text); }
.composer__input { width: 100%; box-sizing: border-box; background: transparent; border: none; outline: none; color: var(--color-text); font-family: var(--font-sans); font-size: 14px; line-height: 1.6; padding: 14px 18px 0; resize: none; min-height: 24px; max-height: 160px; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent; }
.composer__input::-webkit-scrollbar { width: 7px; }
.composer__input::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: var(--radius-full); background: var(--color-border-strong); background-clip: padding-box; }
.composer__input::-webkit-scrollbar-track { background: transparent; }
.composer__input::placeholder { color: var(--color-text-muted); }
.composer__bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px 10px 18px; }
.composer__tools { display: flex; align-items: center; gap: 6px; }
.composer__tool { height: 28px; padding: 0 10px; border-radius: var(--radius-full); background: transparent; border: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 11px; font-family: var(--font-mono); display: flex; align-items: center; gap: 4px; }
.composer__tool--active { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }
.composer__tool--button { cursor: pointer; font-family: var(--font-sans); }
.composer__tool--button:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent-strong); }
.composer__tool--button:disabled { cursor: not-allowed; opacity: .45; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.composer__send { width: 32px; height: 32px; border-radius: var(--radius-sm); background: var(--color-accent); border: none; color: var(--color-bg); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all .2s cubic-bezier(.16,1,.3,1); box-shadow: 0 0 12px var(--color-accent-glow); }
.composer__send:hover:not(:disabled) { background: var(--color-accent-strong); transform: scale(1.05); }
.composer__send:active:not(:disabled) { transform: scale(.95); }
.composer__send:disabled { opacity: .3; cursor: not-allowed; }
.composer__send--stop { background: var(--color-danger); }
@media (max-width: 640px) { .composer-wrap { padding-inline: 12px; } .composer__image-mode { flex-wrap: wrap; } .composer__image-hint { display: none; } }
</style>
