<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChatParams, ImageAspectRatio, ImageModelId } from '../types'
import {
  COMPOSER_INPUT_MAX_HEIGHT,
  composerSubmitMatches,
  nextTextareaHeight,
} from '../composer'
import { IMAGE_STYLES, imageStyleName } from '../image-styles'
import { IMAGE_TEMPLATES, type ImageTemplate } from '../image-templates'
import { createImageTemplate, deleteImageTemplate, fetchImageTemplates, uploadImage } from '../api'
import { PhCaretDown, PhChats, PhCheck, PhCrop, PhFrameCorners, PhGlobe, PhImage, PhLightning, PhPalette, PhPaperPlaneRight, PhSparkle, PhSquaresFour, PhStop, PhUploadSimple } from '@phosphor-icons/vue'

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
  'generate-gemini': [input: { prompt: string; aspectRatio?: ImageAspectRatio; style?: string; referenceImageId?: string }]
  'set-reference': [input: { id: string; label: string }]
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
const openDropdown = ref<'model' | 'ratio' | 'style' | 'template' | null>(null)
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

const referenceFileInput = ref<HTMLInputElement | null>(null)
const referenceUploading = ref(false)
const referenceUploadError = ref('')
const referenceImageUrl = computed(() =>
  props.referenceImageId ? `/api/ai-platform/images/${props.referenceImageId}` : null,
)

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
      if (base64) resolve(base64)
      else reject(new Error('无法读取图片。'))
    }
    reader.onerror = () => reject(new Error('无法读取图片。'))
    reader.readAsDataURL(file)
  })
}

function pickReferenceFile() {
  referenceFileInput.value?.click()
}

async function onReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    referenceUploadError.value = '图片不能超过 8MB。'
    return
  }
  referenceUploadError.value = ''
  referenceUploading.value = true
  try {
    const base64 = await readFileAsBase64(file)
    const { id } = await uploadImage({ base64 })
    emit('set-reference', { id, label: '本地上传' })
  } catch (error) {
    referenceUploadError.value = error instanceof Error ? error.message : '图片上传失败，请稍后重试。'
  } finally {
    referenceUploading.value = false
  }
}

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
  emit('generate-gemini', { prompt, aspectRatio: imageAspectRatio.value || undefined, style: imageStyleId.value || undefined, ...(props.referenceImageId ? { referenceImageId: props.referenceImageId } : {}) })
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

function toggleDropdown(key: 'model' | 'ratio' | 'style' | 'template') {
  if (props.streaming || props.busy || props.imageGenerating) return
  const opening = openDropdown.value !== key
  openDropdown.value = opening ? key : null
  // 每次打开模板面板都拉取最新列表，保证从消息卡片「添为模板」入库后能立即看到。
  if (key === 'template' && opening) refreshTemplates()
}

async function refreshTemplates() {
  customTemplates.value = await fetchImageTemplates()
}
function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && openDropdown.value) openDropdown.value = null
}
function selectModel(modelId: ImageModelId) {
  imageModelId.value = modelId
  changeImageModel()
  openDropdown.value = null
}
function selectAspectRatio(ratio: ImageAspectRatio | '') {
  imageAspectRatio.value = ratio
  openDropdown.value = null
}
function selectStyle(id: string) {
  imageStyleId.value = id
  openDropdown.value = null
}
function onDocumentClick(event: MouseEvent) {
  if (!openDropdown.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.img-opt__panel, .template-panel')) return
  const opt = target?.closest?.('.img-opt') as HTMLElement | null
  if (!opt || opt.dataset.drop !== openDropdown.value) openDropdown.value = null
}

function applyTemplate(t: ImageTemplate) {
  if (mode.value === 'gemini') geminiDraft.value = t.prompt
  else gptImageDraft.value = t.prompt
  imageAspectRatio.value = t.aspectRatio ?? ''
  imageStyleId.value = t.style ?? ''
  openDropdown.value = null
  templateFormOpen.value = false
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
  if (event.key === 'Escape') {
    if (openDropdown.value) {
      openDropdown.value = null
      return
    }
    if (imageMode.value) {
      event.preventDefault()
      exitImageMode()
      return
    }
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
watch(openDropdown, (key) => { if (key !== 'template') templateFormOpen.value = false })
onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('keydown', onWindowKeydown)
  void autoResize()
  customTemplates.value = await fetchImageTemplates()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('keydown', onWindowKeydown)
})
defineExpose({ composerWrapRef, restoreImageDraft, restoreGeminiDraft, refreshTemplates })
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
          <template v-else>
            <div class="img-opt" :data-drop="'model'">
              <button type="button" class="img-opt__trigger" :class="{ 'img-opt__trigger--open': openDropdown === 'model' }" :disabled="streaming || busy || imageGenerating" :aria-expanded="openDropdown === 'model'" @click="toggleDropdown('model')">
                <PhSparkle :size="13" weight="regular" />
                <span class="img-opt__label">模型</span>
                <span class="img-opt__value">{{ selectedImageModelName }}</span>
                <PhCaretDown :size="11" weight="bold" class="img-opt__caret" />
              </button>
              <div v-if="openDropdown === 'model'" class="img-opt__panel img-opt__panel--list">
                <button v-for="m in imageModels" :key="m.modelId" type="button" class="img-opt__option" :class="{ 'img-opt__option--active': imageModelId === m.modelId }" @click="selectModel(m.modelId)">
                  <span class="img-opt__option-label">{{ m.displayName }}</span>
                  <PhCheck v-if="imageModelId === m.modelId" :size="13" weight="bold" />
                </button>
              </div>
            </div>

            <div class="img-opt" :data-drop="'ratio'">
              <button type="button" class="img-opt__trigger" :class="{ 'img-opt__trigger--open': openDropdown === 'ratio' }" :disabled="streaming || busy || imageGenerating" :aria-expanded="openDropdown === 'ratio'" @click="toggleDropdown('ratio')">
                <PhCrop :size="13" weight="regular" />
                <span class="img-opt__label">比例</span>
                <span class="img-opt__value">{{ imageAspectRatio || '自动' }}</span>
                <PhCaretDown :size="11" weight="bold" class="img-opt__caret" />
              </button>
              <div v-if="openDropdown === 'ratio'" class="img-opt__panel img-opt__panel--grid">
                <div class="img-opt__grid">
                  <button type="button" class="ratio-tile" :class="{ 'ratio-tile--active': imageAspectRatio === '' }" @click="selectAspectRatio('')">
                    <span class="ratio-tile__box ratio-tile__box--auto"><PhFrameCorners :size="15" weight="bold" /></span>
                    <span class="ratio-tile__label">自动</span>
                  </button>
                  <button v-for="ratio in IMAGE_ASPECT_RATIO_OPTIONS" :key="ratio" type="button" class="ratio-tile" :class="{ 'ratio-tile--active': imageAspectRatio === ratio }" @click="selectAspectRatio(ratio)">
                    <span class="ratio-tile__box" :class="`ratio-tile__box--${ratio.replace(':', '-')}`"></span>
                    <span class="ratio-tile__label">{{ ratio }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="img-opt" :data-drop="'style'">
              <button type="button" class="img-opt__trigger" :class="{ 'img-opt__trigger--open': openDropdown === 'style' }" :disabled="streaming || busy || imageGenerating" :aria-expanded="openDropdown === 'style'" @click="toggleDropdown('style')">
                <PhPalette :size="13" weight="regular" />
                <span class="img-opt__label">风格</span>
                <span v-if="imageStyleName(imageStyleId)" class="img-opt__value">{{ imageStyleName(imageStyleId) }}</span>
                <PhCaretDown :size="11" weight="bold" class="img-opt__caret" />
              </button>
              <div v-if="openDropdown === 'style'" class="img-opt__panel img-opt__panel--styles">
                <div class="img-opt__style-grid">
                  <button v-for="s in IMAGE_STYLES" :key="s.id" type="button" class="style-tile" :class="{ 'style-tile--active': imageStyleId === s.id }" @click="selectStyle(s.id)">
                    <span class="style-tile__box">
                      <img v-if="s.image" :src="s.image" :alt="s.name" loading="lazy" />
                      <PhCheck v-if="imageStyleId === s.id" :size="12" weight="bold" class="style-tile__check" />
                    </span>
                    <span class="style-tile__label">{{ s.name }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="img-opt" :data-drop="'template'">
              <button type="button" class="img-opt__trigger" :class="{ 'img-opt__trigger--open': openDropdown === 'template' }" :disabled="streaming || busy || imageGenerating" :aria-expanded="openDropdown === 'template'" @click="toggleDropdown('template')">
                <PhSquaresFour :size="13" weight="regular" />
                <span class="img-opt__label">模板</span>
                <PhCaretDown :size="11" weight="bold" class="img-opt__caret" />
              </button>
            </div>

            <div class="img-opt">
              <button type="button" class="img-opt__trigger" :class="{ 'img-opt__trigger--open': hasReference }" :disabled="streaming || busy || imageGenerating || referenceUploading" :aria-expanded="hasReference" @click="pickReferenceFile">
                <PhUploadSimple :size="13" weight="regular" />
                <span class="img-opt__label">{{ referenceUploading ? '上传中' : '参考图' }}</span>
              </button>
              <input ref="referenceFileInput" type="file" accept="image/*" class="composer__file-input" hidden @change="onReferenceFileChange" />
            </div>

            <span v-if="hasReference" class="composer__reference">
              <img v-if="referenceImageUrl" class="composer__reference-thumb" :src="referenceImageUrl" alt="参考图" />
              {{ referenceImageLabel ?? '基于上一张图片' }}
              <button type="button" @click="emit('clear-reference')">移除参考图</button>
            </span>
            <span v-if="referenceUploadError" class="composer__reference composer__reference--error">{{ referenceUploadError }}</span>
          </template>
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
      <div v-if="openDropdown === 'template'" class="template-panel">
        <div class="template-panel__header">
          <span class="template-panel__title"><PhSquaresFour :size="14" weight="regular" /> 模板中心</span>
          <div class="template-panel__header-actions">
            <button type="button" class="composer__template-action composer__template-action--primary" @click="templateFormOpen = !templateFormOpen">＋ 添加模板</button>
          </div>
        </div>
        <div class="template-panel__scroll">
          <div class="template-panel__grid">
            <div v-for="t in IMAGE_TEMPLATES" :key="t.id" class="template-card" role="button" tabindex="0" @click="applyTemplate(t)" @keydown.enter="applyTemplate(t)">
              <div class="template-card__media">
                <img class="template-card__img" :src="t.image" :alt="t.name" loading="lazy" />
                <span v-if="t.aspectRatio" class="template-card__ratio">{{ t.aspectRatio }}</span>
                <span class="template-card__cta">做同款</span>
              </div>
              <div class="template-card__body">
                <strong class="template-card__name">{{ t.name }}</strong>
                <p class="template-card__prompt">{{ t.prompt }}</p>
              </div>
            </div>
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
          <template v-if="customTemplates.length">
            <div class="template-panel__section">我的模板</div>
            <div class="template-panel__custom">
              <div v-for="t in customTemplates" :key="t.id" class="custom-template-card">
                <div class="custom-template-card__info">
                  <strong>{{ t.name }}</strong>
                  <span class="custom-template-card__tags">{{ [t.aspectRatio, imageStyleName(t.style)].filter(Boolean).join(' · ') }}</span>
                  <p>{{ t.prompt }}</p>
                </div>
                <div class="custom-template-card__actions">
                  <button type="button" class="composer__template-action" @click="applyTemplate(t)">同款</button>
                  <button type="button" class="composer__template-action composer__template-action--danger" @click="removeTemplate(Number(t.id))">删除</button>
                </div>
              </div>
            </div>
          </template>
        </div>
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
.composer__reference { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--color-text-muted); font-size: 11px; white-space: nowrap; }
.composer__reference button { border: 0; background: transparent; color: var(--color-accent-strong); cursor: pointer; font: inherit; font-size: 11px; padding: 0; }
.composer__reference button:hover { text-decoration: underline; }
.composer__reference-thumb { width: 26px; height: 26px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--color-border-subtle); flex-shrink: 0; }
.composer__reference--error { color: var(--color-danger); font-weight: 600; }
.composer__file-input { display: none; }
.img-opt { position: relative; display: inline-flex; }
.img-opt__trigger { height: 28px; padding: 0 10px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); font-size: 11px; font-family: var(--font-sans); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.img-opt__trigger:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent-strong); }
.img-opt__trigger:disabled { cursor: not-allowed; opacity: .45; }
.img-opt__trigger--open { border-color: var(--color-accent); color: var(--color-accent-strong); background: var(--color-accent-soft); }
.img-opt__label { color: var(--color-text); }
.img-opt__value { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-muted); }
.img-opt__caret { color: var(--color-text-muted); flex-shrink: 0; }
.img-opt__panel { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 20; min-width: 180px; max-height: min(320px, 40vh); overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-2); box-shadow: 0 -12px 32px rgba(0,0,0,.28); padding: 6px; }
.img-opt__panel--grid { min-width: 208px; }
.img-opt__option { width: 100%; display: flex; align-items: center; gap: 8px; border: 0; background: transparent; color: var(--color-text); font: inherit; font-size: 12px; text-align: left; padding: 7px 8px; border-radius: var(--radius-sm); cursor: pointer; }
.img-opt__option:hover { background: var(--color-accent-soft); }
.img-opt__option--active { color: var(--color-accent); }
.img-opt__option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.img-opt__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.img-opt__panel--styles { min-width: 240px; max-height: min(360px, 48vh); }
.img-opt__style-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.style-tile { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 6px 4px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-muted); font: inherit; font-size: 10.5px; cursor: pointer; }
.style-tile:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.style-tile--active { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent); }
.style-tile__box { position: relative; width: 52px; height: 52px; border-radius: 6px; overflow: hidden; }
.style-tile__box img { display: block; width: 100%; height: 100%; object-fit: cover; }
.style-tile__check { position: absolute; right: 4px; top: 4px; color: var(--color-accent); background: var(--color-surface); border-radius: 50%; padding: 2px; }
.ratio-tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.ratio-tile:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.ratio-tile--active { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent); }
.ratio-tile__box { height: 22px; aspect-ratio: 1 / 1; width: auto; border: 1.5px solid currentColor; border-radius: 4px; }
.ratio-tile__box--4-3 { aspect-ratio: 4 / 3; }
.ratio-tile__box--3-4 { aspect-ratio: 3 / 4; }
.ratio-tile__box--16-9 { aspect-ratio: 16 / 9; }
.ratio-tile__box--9-16 { aspect-ratio: 9 / 16; }
.ratio-tile__box--auto { border-style: dashed; display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; }
.ratio-tile__label { white-space: nowrap; }
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
@media (max-width: 640px) { .composer-wrap { padding-inline: 12px; } }
.composer__chip-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.composer__chip-label { color: var(--color-text-muted); font-size: 11px; flex-shrink: 0; }
.composer__chip { height: 22px; padding: 0 9px; border-radius: var(--radius-full); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-muted); font-size: 11px; font-family: var(--font-sans); cursor: pointer; }
.composer__chip:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.composer__chip--active { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }
.template-panel { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); z-index: 30; display: flex; flex-direction: column; max-height: min(600px, 62vh); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); box-shadow: 0 -18px 48px rgba(0,0,0,.32); overflow: hidden; animation: template-panel-in .18s cubic-bezier(.16,1,.3,1); }
.template-panel__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--color-border-subtle); }
.template-panel__title { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text); }
.template-panel__header-actions { display: flex; align-items: center; gap: 8px; }
.template-panel__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px 18px; }
.template-panel__grid { columns: 2; column-gap: 12px; }
.template-panel__grid > * { break-inside: avoid; }
@media (max-width: 520px) { .template-panel__grid { columns: 1; } }
.template-card { margin-bottom: 12px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-surface); overflow: hidden; cursor: pointer; transition: border-color .15s, box-shadow .18s, transform .18s; }
.template-card:hover, .template-card:focus-visible { border-color: var(--color-accent); box-shadow: 0 6px 18px rgba(0,0,0,.14); transform: translateY(-1px); outline: none; }
.template-card__media { position: relative; overflow: hidden; }
.template-card__img { display: block; width: 100%; height: auto; }
.template-card__ratio { position: absolute; top: 8px; left: 8px; padding: 2px 7px; border-radius: var(--radius-full); background: rgba(0,0,0,.55); color: #fff; font-size: 10.5px; font-family: var(--font-mono); }
.template-card__cta { position: absolute; left: 8px; bottom: 8px; padding: 4px 10px; border-radius: var(--radius-full); background: var(--color-accent); color: #fff; font-size: 11px; font-weight: 600; opacity: 0; transform: translateY(4px); transition: opacity .15s, transform .15s; }
.template-card:hover .template-card__cta, .template-card:focus-visible .template-card__cta { opacity: 1; transform: translateY(0); }
.template-card__body { padding: 8px 10px 10px; }
.template-card__name { display: block; font-size: 12.5px; color: var(--color-text); }
.template-card__prompt { margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted); line-height: 1.4; line-clamp: 2; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.template-panel__section { margin: 4px 0 8px; font-size: 12px; font-weight: 600; color: var(--color-text-muted); }
.template-panel__custom { display: grid; gap: 6px; }
.custom-template-card { display: flex; gap: 8px; align-items: flex-start; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); background: var(--color-surface); padding: 8px 10px; }
.custom-template-card__info { min-width: 0; }
.custom-template-card__info strong { font-size: 12px; color: var(--color-text); display: block; }
.custom-template-card__tags { font-size: 10.5px; color: var(--color-text-muted); }
.custom-template-card__info p { margin: 3px 0 0; font-size: 11px; color: var(--color-text-muted); line-clamp: 2; -webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.custom-template-card__actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.composer__template-action { border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: 600 11px var(--font-sans); padding: 4px 8px; }
.composer__template-action--primary { border-color: var(--color-accent); background: var(--color-accent); color: #fff; }
.composer__template-action--danger { color: var(--color-danger); }
.composer__template-form { display: grid; gap: 6px; padding: 8px 0; }
.composer__template-input { border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); font: inherit; font-size: 12px; padding: 6px 8px; outline: none; }
.composer__template-input:focus { border-color: var(--color-accent); }
.composer__template-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
@keyframes template-panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
</style>
