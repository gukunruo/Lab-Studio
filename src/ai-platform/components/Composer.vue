<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ChatParams, ImageAspectRatio, ImageModelId } from '../types'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  composerSubmitMatches,
  nextTextareaHeight,
} from '../composer'
import { IMAGE_STYLES, imageStyleName } from '../image-styles'
import { IMAGE_TEMPLATES, type ImageTemplate } from '../image-templates'
import { createImageTemplate, deleteImageTemplate, fetchImageTemplates } from '../api'
import { PhChats, PhGlobe, PhImage, PhLightning, PhPaperPlaneRight, PhSparkle, PhStop } from '@phosphor-icons/vue'

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
    aspectRatio?: ImageAspectRatio
    modelId: 'gpt-image-2'
    style?: string
    referenceImageId?: string
  }]
  'generate-gemini': [input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string }]
  'clear-reference': []
  abort: []
  'abort-image': []
  'update:params': [params: ChatParams]
}>()

const mode = ref<'chat' | 'gpt-image' | 'gemini'>('chat')
const chatDraft = ref('')
const gptImageDraft = ref('')
const geminiDraft = ref('')
const imageAspectRatio = ref<ImageAspectRatio | ''>('')
const imageStyleId = ref<string>('')
const imageModelId = ref<ImageModelId>('gpt-image-2')
const composerWrapRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const IMAGE_ASPECT_RATIO_OPTIONS: ImageAspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16']
const templatesOpen = ref(false)
const customTemplates = ref<ImageTemplate[]>([])
const templateFormOpen = ref(false)
const templateForm = ref<{ name: string; prompt: string; aspectRatio: ImageAspectRatio | ''; style: string }>({
  name: '', prompt: '', aspectRatio: '', style: '',
})

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

const REASONING_EFFORTS: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
function cycleReasoning() {
  const current = props.params.reasoningEffort ?? 'low'
  const next = REASONING_EFFORTS[(REASONING_EFFORTS.indexOf(current) + 1) % REASONING_EFFORTS.length]
  emit('update:params', { ...props.params, reasoningEffort: next })
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
    aspectRatio: imageAspectRatio.value || undefined,
    modelId: 'gpt-image-2',
    style: imageStyleId.value || undefined,
    ...(props.referenceImageId ? { referenceImageId: props.referenceImageId } : {}),
  })
  gptImageDraft.value = ''
  await nextTick()
  await autoResize()
}

async function generateGemini() {
  const prompt = geminiDraft.value.trim()
  if (!prompt || props.streaming || props.busy || props.imageGenerating) return
  emit('generate-gemini', { prompt, aspectRatio: imageAspectRatio.value || undefined, style: imageStyleId.value || undefined })
  geminiDraft.value = ''
  await nextTick()
  await autoResize()
}

function setMode(tab: 'chat' | 'gpt-image' | 'gemini') {
  if (props.streaming || props.busy || props.imageGenerating) return
  if (tab === 'chat') {
    mode.value = 'chat'
  } else if (tab === 'gpt-image') {
    imageModelId.value = 'gpt-image-2'
    mode.value = 'gpt-image'
  } else {
    imageModelId.value = 'gemini-3-pro-image'
    mode.value = 'gemini'
  }
}

function exitImageMode() {
  mode.value = 'chat'
}

function changeImageModel() {
  mode.value = imageModelId.value === 'gemini-3-pro-image' ? 'gemini' : 'gpt-image'
}

function applyTemplate(t: ImageTemplate) {
  if (mode.value === 'gemini') geminiDraft.value = t.prompt
  else gptImageDraft.value = t.prompt
  imageAspectRatio.value = t.aspectRatio ?? ''
  imageStyleId.value = t.style ?? ''
  templatesOpen.value = false
}
async function saveTemplate() {
  const name = templateForm.value.name.trim()
  const prompt = templateForm.value.prompt.trim()
  if (!name || !prompt) return
  await createImageTemplate({
    name,
    prompt,
    ...(templateForm.value.aspectRatio ? { aspectRatio: templateForm.value.aspectRatio } : {}),
    ...(templateForm.value.style ? { style: templateForm.value.style } : {}),
  })
  customTemplates.value = await fetchImageTemplates()
  templateForm.value = { name: '', prompt: '', aspectRatio: '', style: '' }
  templateFormOpen.value = false
}
async function removeTemplate(id: number) {
  await deleteImageTemplate(id)
  customTemplates.value = await fetchImageTemplates()
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

function restoreImageDraft(input: { prompt: string; aspectRatio?: ImageAspectRatio; referenceImageId?: string; style?: string }) {
  gptImageDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio ?? ''
  imageStyleId.value = input.style ?? ''
  imageModelId.value = 'gpt-image-2'
  mode.value = 'gpt-image'
}

function restoreGeminiDraft(input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string }) {
  geminiDraft.value = input.prompt
  imageAspectRatio.value = input.aspectRatio ?? ''
  imageStyleId.value = input.style ?? ''
  imageModelId.value = 'gemini-3-pro-image'
  mode.value = 'gemini'
}

watch([mode, currentDraft], () => void nextTick(autoResize))
onMounted(async () => {
  void autoResize()
  customTemplates.value = await fetchImageTemplates()
})
defineExpose({ composerWrapRef, restoreImageDraft, restoreGeminiDraft })
</script>

<template>
  <div ref="composerWrapRef" class="composer-wrap">
    <div v-if="$slots.suggestions && mode === 'chat'" class="composer-suggestions">
      <slot name="suggestions" />
    </div>
    <div class="composer" :class="{ 'composer--image': imageMode, 'composer--gemini': mode === 'gemini' }">
      <div class="composer__modes">
        <button
          class="composer__mode"
          :class="{ 'composer__mode--active': mode === 'chat' }"
          type="button"
          :disabled="streaming || busy || imageGenerating"
          @click="setMode('chat')"
        >
          <PhChats :size="13" weight="regular" /> 对话
        </button>
        <button
          class="composer__mode"
          :class="{ 'composer__mode--active': mode === 'gpt-image' }"
          type="button"
          :disabled="streaming || busy || imageGenerating"
          @click="setMode('gpt-image')"
        >
          <PhImage :size="13" weight="regular" /> 生图
        </button>
        <button
          class="composer__mode"
          :class="{ 'composer__mode--active': mode === 'gemini' }"
          type="button"
          :disabled="streaming || busy || imageGenerating"
          @click="setMode('gemini')"
        >
          <PhSparkle :size="13" weight="regular" /> Gemini 创作
        </button>
      </div>
      <div v-if="imageMode" class="composer__image-mode">
        <span class="composer__image-label">
          <PhSparkle v-if="mode === 'gemini'" :size="15" weight="fill" />
          <PhImage v-else :size="15" weight="fill" />
          {{ mode === 'gemini' ? 'Gemini 创作对话' : (gptEditing ? '编辑图片' : '生图') }}
        </span>
        <label class="composer__select composer__select--model">
          <span class="sr-only">图片模型</span>
          <select v-model="imageModelId" aria-label="图片模型" @change="changeImageModel">
            <option v-for="model in imageModels" :key="model.modelId" :value="model.modelId">
              {{ model.displayName }}
            </option>
          </select>
        </label>
        <label class="composer__select">
          <span class="sr-only">图片比例</span>
          <select v-model="imageAspectRatio" aria-label="图片比例">
            <option value="">自动</option>
            <option v-for="ratio in IMAGE_ASPECT_RATIO_OPTIONS" :key="ratio" :value="ratio">{{ ratio }}</option>
          </select>
        </label>
        <label class="composer__select">
          <span class="sr-only">图片风格</span>
          <select v-model="imageStyleId" aria-label="图片风格">
            <option value="">默认</option>
            <option v-for="style in IMAGE_STYLES" :key="style.id" :value="style.id">{{ style.name }}</option>
          </select>
        </label>
        <button type="button" class="composer__tool composer__tool--button" :class="{ 'composer__tool--active': templatesOpen }" @click="templatesOpen = !templatesOpen">模板</button>
        <span v-if="hasReference" class="composer__reference">
          {{ referenceImageLabel ?? '基于上一张图片' }}
          <button type="button" @click="emit('clear-reference')">移除参考图</button>
        </span>
        <span class="composer__image-hint">Enter {{ mode === 'gemini' ? '发送' : (gptEditing ? '编辑' : '生成') }}</span>
      </div>

      <div v-if="imageMode && templatesOpen" class="composer__template-panel">
        <div v-if="IMAGE_TEMPLATES.length || customTemplates.length" class="composer__template-grid">
          <template v-for="t in [...IMAGE_TEMPLATES, ...customTemplates]" :key="t.id">
            <div class="composer__template-card">
              <div class="composer__template-info">
                <strong>{{ t.name }}</strong>
                <span class="composer__template-tags">{{ [t.aspectRatio, imageStyleName(t.style)].filter(Boolean).join(' · ') }}</span>
                <p>{{ t.prompt }}</p>
              </div>
              <div class="composer__template-actions">
                <button type="button" class="composer__template-action" @click="applyTemplate(t)">同款</button>
                <button v-if="customTemplates.includes(t)" type="button" class="composer__template-action composer__template-action--danger" @click="removeTemplate(Number(t.id))">删除</button>
              </div>
            </div>
          </template>
        </div>
        <div v-if="templateFormOpen" class="composer__template-form">
          <input v-model="templateForm.name" placeholder="模板名称" class="composer__template-input" />
          <input v-model="templateForm.prompt" placeholder="示例 prompt（这里的一句话会被原样填进输入框）" class="composer__template-input" />
          <div class="composer__chip-row">
            <button v-for="ratio in IMAGE_ASPECT_RATIO_OPTIONS" :key="ratio" type="button" class="composer__chip" :class="{ 'composer__chip--active': templateForm.aspectRatio === ratio }" @click="templateForm.aspectRatio = templateForm.aspectRatio === ratio ? '' : ratio">{{ ratio }}</button>
          </div>
          <div class="composer__chip-row">
            <button v-for="style in IMAGE_STYLES" :key="style.id" type="button" class="composer__chip" :class="{ 'composer__chip--active': templateForm.style === style.id }" @click="templateForm.style = templateForm.style === style.id ? '' : style.id">{{ style.name }}</button>
          </div>
          <div class="composer__template-form-actions">
            <button type="button" class="composer__template-action" @click="templateFormOpen = false">取消</button>
            <button type="button" class="composer__template-action composer__template-action--primary" :disabled="!templateForm.name.trim() || !templateForm.prompt.trim()" @click="saveTemplate">保存模板</button>
          </div>
        </div>
        <button v-else type="button" class="composer__template-action composer__template-action--primary" @click="templateFormOpen = true">＋ 添加模板</button>
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
              v-if="params.reasoningEffort"
              class="composer__badge composer__badge--button"
              type="button"
              :title="`推理强度：${params.reasoningEffort}（点击切换）`"
              :aria-pressed="params.reasoningEffort === 'high'"
              @click="cycleReasoning"
            >
              <PhLightning :size="11" weight="regular" /> {{ params.reasoningEffort }}
            </button>
            <span v-if="params.maxTokens" class="composer__badge">max {{ params.maxTokens }}</span>
          </template>
          <span v-else class="composer__badge">{{ selectedImageModelName }}</span>
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
.composer__image-mode { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 38px; padding: 8px 12px 0 18px; color: var(--color-text-muted); font-size: 12px; }
.composer__image-label, .composer__reference { display: inline-flex; align-items: center; gap: 5px; }
.composer__image-label { color: var(--color-accent-strong); font-weight: 600; white-space: nowrap; }
.composer__select select { appearance: none; border: 1px solid var(--color-border); border-radius: var(--radius-full); outline: none; background: var(--color-surface); color: var(--color-text); cursor: pointer; font: inherit; font-size: 11px; padding: 5px 24px 5px 9px; }
.composer__select select:focus { border-color: var(--color-accent); }
.composer__select--model select { max-width: 172px; }
.composer__reference { min-width: 0; color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
.composer__reference button { border: 0; background: transparent; color: var(--color-accent-strong); cursor: pointer; font: inherit; font-size: 11px; padding: 0; }
.composer__reference button:hover { text-decoration: underline; }
.composer__image-hint { margin-left: auto; color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
.composer__modes { display: flex; align-items: center; gap: 2px; padding: 10px 12px 0 18px; }
.composer__mode { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 0; border-radius: var(--radius-full); background: transparent; color: var(--color-text-muted); font-size: 11px; font-family: var(--font-sans); cursor: pointer; transition: color .15s, background .15s; }
.composer__mode:hover:not(:disabled) { color: var(--color-text); background: var(--color-surface); }
.composer__mode--active { color: var(--color-accent-strong); background: var(--color-accent-soft); }
.composer__mode:disabled { cursor: not-allowed; opacity: .45; }
.composer__mode--active:disabled { opacity: 1; }
.composer__badge { height: 22px; padding: 0 8px; border-radius: var(--radius-full); background: transparent; color: var(--color-text-muted); font-size: 10.5px; font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 4px; opacity: .75; white-space: nowrap; }
.composer__badge--button { border: 0; cursor: pointer; }
.composer__badge--button:hover { background: var(--color-accent-soft); color: var(--color-accent-strong); opacity: 1; }
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
.composer__image-options { display: grid; gap: 6px; padding: 10px 18px 0; }
.composer__chip-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.composer__chip-label { color: var(--color-text-muted); font-size: 11px; flex-shrink: 0; }
.composer__chip { height: 22px; padding: 0 9px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); font-size: 11px; font-family: var(--font-sans); cursor: pointer; }
.composer__chip:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.composer__chip--active { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }
.composer__template-panel { border-top: 1px solid var(--color-border); margin-top: 8px; padding: 10px 18px; }
.composer__template-grid { display: grid; gap: 8px; max-height: 260px; overflow: auto; }
.composer__template-card { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface); padding: 8px 10px; }
.composer__template-info { min-width: 0; }
.composer__template-info strong { font-size: 12px; color: var(--color-text); display: block; }
.composer__template-tags { font-size: 10.5px; color: var(--color-text-muted); }
.composer__template-info p { margin: 3px 0 0; font-size: 11px; color: var(--color-text-muted); line-clamp: 2; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.composer__template-actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.composer__template-action { border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: 600 11px var(--font-sans); padding: 4px 8px; }
.composer__template-action--primary { border-color: var(--color-accent); background: var(--color-accent); color: #fff; }
.composer__template-action--danger { color: var(--color-danger); }
.composer__template-form { display: grid; gap: 6px; padding: 8px 0; }
.composer__template-input { border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 12px; padding: 6px 8px; outline: none; }
.composer__template-input:focus { border-color: var(--color-accent); }
.composer__template-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
</style>
