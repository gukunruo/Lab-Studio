<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, nextTick, watch, computed } from 'vue'
import type { AiModel, AiRecommendation, ChatMessage, ChatParams, ConversationDigest, GeminiMultimodalAssistantMessage, GeminiMultimodalUserMessage, ImageAspectRatio, ImageModelId, ImageResultMessage, TextMessage } from '../types'
import { buildGeminiSubThreadHistory, controlledImageAssetId, isTextMessage, parseConversationDigest } from '../api'
import MessageBubble from './MessageBubble.vue'
import ConversationProgressRail from './ConversationProgressRail.vue'
import ModelSelector from './ModelSelector.vue'
import Composer from './Composer.vue'
import { useChat } from '../composables/useChat'
import { useImageGeneration } from '../composables/useImageGeneration'
import { useGeminiMultimodal } from '../composables/useGeminiMultimodal'
import { useModelsStore } from '../composables/useModels'
import { PhGearSix, PhLightning, PhSidebarSimple, PhNotePencil, PhArrowDown, PhListBullets, PhX } from '@phosphor-icons/vue'

const props = defineProps<{
  messages: ChatMessage[]
  modelId: string
  systemPrompt: string
  params: ChatParams
  currentModel: AiModel | undefined
  conversationKey: object | null
  panelOpen: boolean
  sidebarCollapsed: boolean
  locale: 'zh' | 'en'
  suggestions: AiRecommendation[]
  digest: ConversationDigest | null
  branchCreating: boolean
}>()

const emit = defineEmits<{
  'select-model': [model: AiModel]
  'update:params': [params: ChatParams]
  'update:systemPrompt': [prompt: string]
  'update:messages': [messages: ChatMessage[]]
  branch: [index: number]
  'update:digest': [digest: ConversationDigest]
  'digest-error': [message: string]
  'clear-digest': []
  'toggle-panel': []
  'toggle-sidebar': []
  'new-conversation': []
}>()

const messagesContainer = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof Composer> | null>(null)
const composerHeight = ref(130)
const streamingContent = ref('')
const streamingModelId = ref<string | undefined>(undefined)
const waitingForFirstToken = ref(false)
const generatingDigest = ref(false)
const digestError = ref('')
const digestMenuOpen = ref(false)
const userScrolledAway = ref(false)

const { streaming, send, abort } = useChat()
const { send: sendDigest } = useChat()
const { generating: gptImageGenerating, generate: generateImage, abort: abortImage } = useImageGeneration()
const { generating: geminiGenerating, generate: generateGemini, abort: abortGemini } = useGeminiMultimodal()
const imageGenerating = computed(() => gptImageGenerating.value || geminiGenerating.value)
const modelsStore = useModelsStore()
function isImageModelId(value: string): value is ImageModelId {
  return value === 'gpt-image-2' || value === 'gemini-3-pro-image'
}

function assistantModelName(msg: ChatMessage): string {
  if (msg.role === 'assistant' && isTextMessage(msg) && msg.modelId) {
    const model = modelsStore.findById(msg.modelId)
    if (model) return model.displayName
  }
  return props.currentModel?.displayName ?? 'Assistant'
}

const imageModels = computed(() => modelsStore.imageModels.flatMap((model) => (
  isImageModelId(model.modelId) ? [{ modelId: model.modelId, displayName: model.displayName }] : []
)))
let requestGeneration = 0
let imageRequestGeneration = 0
let geminiRequestGeneration = 0
let activeRequestConversation: object | number | null = null
let selectedReferenceConversation: object | number | null = null
const selectedReferenceImageId = ref<string | null | undefined>(undefined)
let composerObserver: ResizeObserver | null = null
let childImageLoadHandler: ((event: Event) => void) | null = null

function currentConversation(): object | number {
  return props.conversationKey ?? props.messages
}

const referenceImageId = computed(() => {
  // 显式引用：默认不带参考图。只有用户点了「作为参考 / 编辑」才会设置，
  // 点了「移除参考图」就置空并固定生效，不再自动回退到会话里最近一张图。
  if (selectedReferenceConversation !== currentConversation()) return null
  return selectedReferenceImageId.value ?? null
})

function selectReferenceImage(assetId: string | null) {
  selectedReferenceConversation = currentConversation()
  selectedReferenceImageId.value = assetId
}

function isCurrentConversation(key: object | number | null): boolean {
  return key === currentConversation()
}

function invalidateRequest() {
  requestGeneration += 1
  imageRequestGeneration += 1
  geminiRequestGeneration += 1
  abort()
  abortImage()
  abortGemini()
  streamingContent.value = ''
  streamingModelId.value = undefined
  waitingForFirstToken.value = false
}

const displayMessages = computed(() => {
  const msgs = [...props.messages]
  if (streaming.value && streamingContent.value) {
    msgs.push({ role: 'assistant', content: streamingContent.value, modelId: streamingModelId.value })
  }
  return msgs
})

const showLatestButton = computed(() =>
  userScrolledAway.value && displayMessages.value.length > 0,
)

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

function onMessagesScroll() {
  if (messagesContainer.value) {
    userScrolledAway.value = !isNearBottom(messagesContainer.value)
  }
}

async function scrollToBottom(force = false) {
  await nextTick()
  const element = messagesContainer.value
  if (!element || (!force && userScrolledAway.value)) return
  element.scrollTop = element.scrollHeight
}

function jumpToLatest() {
  userScrolledAway.value = false
  void scrollToBottom(true)
}

watch(() => displayMessages.value.length, () => scrollToBottom())
watch(streamingContent, () => scrollToBottom())
watch(streaming, (value) => {
  if (value) {
    userScrolledAway.value = false
    void scrollToBottom(true)
  }
})

function onViewportChange() {
  if (!userScrolledAway.value) void scrollToBottom()
}

onMounted(() => {
  // 会话数据在挂载前已就绪（父组件 v-if="loaded"），两个 scroll watch 都不会在
  // 挂载时触发，因此刷新整页会停在顶部。这里在首帧布局后强制滚到底，
  // 与点击切换会话走 conversationKey watch 的效果保持一致。
  userScrolledAway.value = false
  void scrollToBottom(true)
  // 图片异步加载会把容器撑高，onMounted 落定时高度不足、滚不到真正底部；
  // 用捕获阶段监听容器内图片 load，加载完兜底滚到底（仅在用户未上滑时）。
  childImageLoadHandler = () => {
    if (!userScrolledAway.value) void scrollToBottom()
  }
  messagesContainer.value?.addEventListener('load', childImageLoadHandler, true)
  window.addEventListener('resize', onViewportChange)
  const element = composerRef.value?.composerWrapRef
  if (!element) return
  composerObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) {
      // 用 border-box 高度（含 padding），否则 latest-button 会低估输入区高度而重叠。
      const blockSize = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      composerHeight.value = Math.ceil(blockSize)
    }
  })
  composerObserver.observe(element)
  composerHeight.value = Math.ceil(element.getBoundingClientRect().height)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportChange)
  if (childImageLoadHandler) {
    messagesContainer.value?.removeEventListener('load', childImageLoadHandler, true)
    childImageLoadHandler = null
  }
  composerObserver?.disconnect()
})

function useSuggestion(suggestion: AiRecommendation) {
  void handleSend(suggestion.query)
}

function activeDigest(): ConversationDigest | null {
  const digest = props.digest
  return digest && digest.sourceMessageCount > 0 && digest.sourceMessageCount <= props.messages.length
    ? digest
    : null
}

async function requestReply(messages: ChatMessage[]) {
  const generation = ++requestGeneration
  const requestModelId = props.modelId
  activeRequestConversation = props.conversationKey ?? props.messages
  streamingContent.value = ''
  streamingModelId.value = requestModelId
  waitingForFirstToken.value = true

  try {
    await send(
      messages,
      requestModelId,
      props.systemPrompt,
      props.params,
      {
        onToken: (token) => {
          if (generation === requestGeneration && activeRequestConversation === (props.conversationKey ?? props.messages)) {
            waitingForFirstToken.value = false
            streamingContent.value += token
          }
        },
        onDone: (full) => {
          if (generation !== requestGeneration || activeRequestConversation !== (props.conversationKey ?? props.messages)) return
          waitingForFirstToken.value = false
          streamingModelId.value = undefined
          emit('update:messages', [...messages, { role: 'assistant', content: full, modelId: requestModelId, createdAt: new Date().toISOString() }])
          streamingContent.value = ''
        },
        onAbort: (full) => {
          if (generation !== requestGeneration || activeRequestConversation !== (props.conversationKey ?? props.messages)) return
          waitingForFirstToken.value = false
          streamingModelId.value = undefined
          const content = full || streamingContent.value
          if (content) {
            emit('update:messages', [...messages, { role: 'assistant', content, status: 'interrupted', modelId: requestModelId, createdAt: new Date().toISOString() }])
          }
          streamingContent.value = ''
        },
        onError: () => {
          if (generation !== requestGeneration || activeRequestConversation !== (props.conversationKey ?? props.messages)) return
          waitingForFirstToken.value = false
          streamingModelId.value = undefined
          emit('update:messages', [...messages, { role: 'assistant', content: '无法完成本次回复，请检查网络或稍后重试。', status: 'error', modelId: requestModelId, createdAt: new Date().toISOString() }])
          streamingContent.value = ''
        },
      },
      activeDigest()?.summary ?? '',
    )
  } finally {
    if (generation === requestGeneration) waitingForFirstToken.value = false
  }
}

async function handleSend(content: string) {
  if (streaming.value) return
  const userMsg: ChatMessage = { role: 'user', content, createdAt: new Date().toISOString() }
  const newMessages = [...props.messages, userMsg]
  emit('update:messages', newMessages)
  await requestReply(newMessages)
}

function updateImageResult(requestId: string, update: (message: ImageResultMessage) => ImageResultMessage) {
  emit('update:messages', props.messages.map((message) => (
    message.type === 'image-result' && message.requestId === requestId && message.status === 'generating'
      ? update(message)
      : message
  )))
}

async function handleGenerateImage(input: {
  prompt: string
  aspectRatio: ImageAspectRatio
  modelId: 'gpt-image-2'
  referenceImageId?: string
}) {
  if (streaming.value || generatingDigest.value || imageGenerating.value) return
  const requestId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const requestMessage: ChatMessage = {
    type: 'image-request',
    role: 'user',
    requestId,
    prompt: input.prompt,
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
    ...(input.referenceImageId ? { referenceImageId: input.referenceImageId } : {}),
    createdAt,
  }
  const resultMessage: ImageResultMessage = {
    type: 'image-result',
    role: 'assistant',
    requestId,
    prompt: input.prompt,
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
    status: 'generating',
    createdAt,
  }
  const conversation = props.conversationKey ?? props.messages
  const generation = ++imageRequestGeneration
  emit('clear-digest')
  emit('update:messages', [...props.messages, requestMessage, resultMessage])
  await generateImage(input, {
    onDone: (result) => {
      if (generation !== imageRequestGeneration || !isCurrentConversation(conversation)) return
      updateImageResult(requestId, (message) => ({
        ...message,
        modelId: result.modelId,
        status: 'completed',
        imageUrl: result.imageUrl,
        completedAt: new Date().toISOString(),
      }))
    },
    onError: (errorMessage) => {
      if (generation !== imageRequestGeneration || !isCurrentConversation(conversation)) return
      updateImageResult(requestId, (message) => ({ ...message, status: 'error', errorMessage }))
    },
    onAbort: () => {
      if (generation !== imageRequestGeneration || !isCurrentConversation(conversation)) return
      updateImageResult(requestId, (message) => ({ ...message, status: 'cancelled' }))
    },
  })
}

function updateGeminiResult(requestId: string, update: (message: GeminiMultimodalAssistantMessage) => GeminiMultimodalAssistantMessage) {
  emit('update:messages', props.messages.map((message) => (
    message.type === 'gemini-multimodal-assistant' && message.requestId === requestId && message.status === 'generating'
      ? update(message)
      : message
  )))
}

async function handleGenerateGemini(input: { prompt: string; referenceImageId?: string | null }) {
  if (streaming.value || generatingDigest.value || imageGenerating.value) return
  // 携带本会话连续 Gemini 子线程作为上下文，让语言追问（"背景改暖一点"）能延续；
  // 视觉延续仍靠参考图。在 push 新消息前读取，正好取到「先前的」子线程。
  const history = buildGeminiSubThreadHistory(props.messages)
  const requestId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const reference = input.referenceImageId === undefined ? referenceImageId.value : input.referenceImageId
  const userMessage: GeminiMultimodalUserMessage = {
    type: 'gemini-multimodal-user',
    role: 'user',
    requestId,
    content: input.prompt,
    ...(reference ? { referenceImageId: reference } : {}),
    createdAt,
  }
  const assistantMessage: GeminiMultimodalAssistantMessage = {
    type: 'gemini-multimodal-assistant',
    role: 'assistant',
    requestId,
    content: '',
    status: 'generating',
    createdAt,
  }
  const conversation = currentConversation()
  const generation = ++geminiRequestGeneration
  emit('clear-digest')
  emit('update:messages', [...props.messages, userMessage, assistantMessage])
  await generateGemini({
    prompt: input.prompt,
    ...(reference ? { referenceImageId: reference } : {}),
    ...(history.length ? { history } : {}),
  }, {
    onDone: (result) => {
      if (generation !== geminiRequestGeneration || !isCurrentConversation(conversation)) return
      updateGeminiResult(requestId, (message) => ({
        ...message,
        content: result.content,
        ...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
        status: 'completed',
        completedAt: new Date().toISOString(),
      }))
    },
    onError: (errorMessage) => {
      if (generation !== geminiRequestGeneration || !isCurrentConversation(conversation)) return
      updateGeminiResult(requestId, (message) => ({ ...message, status: 'error', errorMessage }))
    },
    onAbort: () => {
      if (generation !== geminiRequestGeneration || !isCurrentConversation(conversation)) return
      updateGeminiResult(requestId, (message) => ({ ...message, status: 'cancelled' }))
    },
  })
}

function abortImageGeneration() {
  abortImage()
  abortGemini()
}

function imageRequestForResult(result: ImageResultMessage) {
  const request = props.messages.find((message) => (
    message.type === 'image-request' && message.requestId === result.requestId
  ))
  return request?.type === 'image-request' ? request : null
}

function retryImage(index: number) {
  const result = props.messages[index]
  if (!result || result.type !== 'image-result' || imageGenerating.value) return
  const request = imageRequestForResult(result)
  if (!request || request.modelId !== 'gpt-image-2') return
  void handleGenerateImage({
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    modelId: 'gpt-image-2',
    ...(request.referenceImageId ? { referenceImageId: request.referenceImageId } : {}),
  })
}

function editImage(index: number) {
  const result = props.messages[index]
  if (!result || result.type !== 'image-result') return
  const request = imageRequestForResult(result)
  if (!request) return
  if (request.modelId !== 'gpt-image-2') return
  // 编辑的对象就是这张结果图本身，用它作为参考；不能沿用请求的上一张参考。
  selectReferenceImage(controlledImageAssetId(result.imageUrl))
  composerRef.value?.restoreImageDraft({
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
  })
}

function geminiUserForResult(result: GeminiMultimodalAssistantMessage) {
  const request = props.messages.find((message) => (
    message.type === 'gemini-multimodal-user' && message.requestId === result.requestId
  ))
  return request?.type === 'gemini-multimodal-user' ? request : null
}

function retryGemini(index: number) {
  const result = props.messages[index]
  if (!result || result.type !== 'gemini-multimodal-assistant' || imageGenerating.value) return
  const request = geminiUserForResult(result)
  if (!request) return
  void handleGenerateGemini({
    prompt: request.content,
    referenceImageId: request.referenceImageId ?? null,
  })
}

function editGemini(index: number) {
  const result = props.messages[index]
  if (!result || result.type !== 'gemini-multimodal-assistant') return
  const request = geminiUserForResult(result)
  if (!request) return
  // 优先用结果图自身作为参考延续视觉，其次回退到请求的参考图。
  selectReferenceImage(controlledImageAssetId(result.imageUrl) ?? request.referenceImageId ?? null)
  composerRef.value?.restoreGeminiDraft({ prompt: request.content })
}

function useImageReference(index: number) {
  const message = props.messages[index]
  if (!message || (message.type !== 'image-result' && message.type !== 'gemini-multimodal-assistant')) return
  const assetId = controlledImageAssetId(message.imageUrl)
  if (!assetId) return
  selectReferenceImage(assetId)
  composerRef.value?.restoreGeminiDraft({ prompt: '' })
}

async function retryMessage(index: number) {
  if (streaming.value || imageGenerating.value) return
  const messages = props.messages.slice(0, index)
  const previousUserMessage = [...messages].reverse().find((message) => isTextMessage(message) && message.role === 'user')
  if (!previousUserMessage) return
  emit('update:messages', messages)
  await requestReply(messages)
}

async function regenerateMessage(index: number) {
  if (streaming.value || imageGenerating.value) return
  const messages = props.messages.slice(0, index)
  const previousUserMessage = [...messages].reverse().find((message) => isTextMessage(message) && message.role === 'user')
  if (!previousUserMessage) return
  emit('update:messages', messages)
  await requestReply(messages)
}

async function editMessage(index: number, content: string) {
  const original = props.messages[index]
  if (streaming.value || imageGenerating.value || generatingDigest.value || !original || !isTextMessage(original) || original.role !== 'user') return
  invalidateRequest()
  const messages: ChatMessage[] = [
    ...props.messages.slice(0, index),
    { ...original, content, createdAt: new Date().toISOString() },
  ]
  emit('clear-digest')
  emit('update:messages', messages)
  await requestReply(messages)
}

async function generateDigest() {
  if (streaming.value || imageGenerating.value || generatingDigest.value || props.messages.length < 2) return
  generatingDigest.value = true
  digestError.value = ''
  let content = ''
  try {
    await sendDigest(
      props.messages,
      props.modelId,
      `${props.systemPrompt}\n\n请整理这段对话，不要回答对话内容。只输出 JSON，不要使用 Markdown 代码块：{"summary":"不超过 500 字的关键上下文与结论","outline":[{"messageIndex":0,"title":"不超过 30 字标题","detail":"不超过 120 字说明"}]}。outline 仅列出 3 到 8 个关键节点，messageIndex 必须是原消息的 0 起始索引。`,
      props.params,
      {
        onToken: (token) => { content += token },
        onDone: (full) => { content = full || content },
        onAbort: () => { digestError.value = '已取消对话整理。' },
        onError: () => { digestError.value = '生成对话整理失败，请稍后重试。' },
      },
    )
    if (!digestError.value) {
      const digest = parseConversationDigest(content, props.messages.length)
      if (!digest) digestError.value = '未能解析对话整理结果，请稍后重试。'
      else emit('update:digest', digest)
    }
  } finally {
    generatingDigest.value = false
    if (digestError.value) emit('digest-error', digestError.value)
  }
}

function scrollToMessage(index: number) {
  const target = messagesContainer.value?.querySelector<HTMLElement>(`[data-message-index="${index}"]`)
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  digestMenuOpen.value = false
}

function toggleDigestMenu() {
  digestMenuOpen.value = !digestMenuOpen.value
}

function clearDigest() {
  digestMenuOpen.value = false
  emit('clear-digest')
}

defineExpose({ generateDigest, scrollToMessage, isDigestGenerating: generatingDigest })

function canRegenerate(index: number, message: ChatMessage): boolean {
  return isTextMessage(message)
    && message.role === 'assistant'
    && !message.status
    && index === props.messages.length - 1
}

function textMessageFailed(message: ChatMessage): boolean {
  return isTextMessage(message) && message.status === 'error'
}

function isImageResult(message: ChatMessage): message is ImageResultMessage {
  return message.type === 'image-result'
}

watch(() => props.conversationKey, (key, previousKey) => {
  if ((streaming.value || imageGenerating.value) && key !== previousKey) invalidateRequest()
  if (key !== previousKey) {
    // 切换会话后回到最下方，迎接当前会话的最新内容（而不是停在顶部）。
    userScrolledAway.value = false
    selectedReferenceConversation = null
    selectedReferenceImageId.value = undefined
    void nextTick(() => scrollToBottom(true))
  }
}, { flush: 'sync' })

onBeforeUnmount(() => invalidateRequest())
</script>

<template>
  <main class="chat" :style="{ '--composer-height': `${composerHeight}px` }">
    <header class="chat__header">
      <div class="chat__header-left">
        <button class="chat__icon-btn" type="button" :title="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'" :aria-label="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'" @click="emit('toggle-sidebar')">
          <PhSidebarSimple :size="16" weight="regular" />
        </button>
        <button class="chat__icon-btn" type="button" title="新对话" aria-label="新对话" @click="emit('new-conversation')">
          <PhNotePencil :size="16" weight="regular" />
        </button>
        <ModelSelector :current-model-id="modelId" @select="emit('select-model', $event)" />
      </div>
      <div class="chat__header-right">
        <div class="chat__digest">
          <button
            class="chat__icon-btn"
            :class="{ 'chat__icon-btn--active': digestMenuOpen || digest }"
            type="button"
            title="对话整理"
            aria-label="对话整理"
            :aria-expanded="digestMenuOpen"
            :disabled="generatingDigest || imageGenerating"
            @click="toggleDigestMenu"
          >
            <PhListBullets :size="16" weight="regular" />
          </button>
          <section v-if="digestMenuOpen" class="chat__digest-menu" aria-label="对话整理">
            <div class="chat__digest-menu-header">
              <div>
                <strong>对话整理</strong>
                <p>摘要和大纲不会替代原始消息。</p>
              </div>
              <button class="chat__digest-close" type="button" aria-label="关闭对话整理" @click="digestMenuOpen = false">
                <PhX :size="15" weight="regular" />
              </button>
            </div>
            <div class="chat__digest-actions">
              <button
                class="chat__digest-button"
                type="button"
                :disabled="messages.length < 2 || generatingDigest || imageGenerating"
                :aria-busy="generatingDigest"
                @click="generateDigest"
              >
                {{ generatingDigest ? '整理中…' : digest ? '更新整理' : '生成整理' }}
              </button>
              <button v-if="digest" class="chat__digest-button chat__digest-button--secondary" type="button" @click="clearDigest">
                清除整理
              </button>
            </div>
            <p v-if="messages.length < 2" class="chat__digest-note">至少需要两条消息才能生成整理。</p>
            <template v-else-if="digest">
              <p class="chat__digest-covered">已整理至第 {{ digest.sourceMessageCount }} 条消息</p>
              <p class="chat__digest-summary">{{ digest.summary }}</p>
              <div class="chat__digest-outline">
                <span>会话大纲</span>
                <button
                  v-for="item in digest.outline"
                  :key="`${item.messageIndex}-${item.title}`"
                  class="chat__digest-outline-item"
                  type="button"
                  :disabled="item.messageIndex >= messages.length"
                  @click="scrollToMessage(item.messageIndex)"
                >
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.detail }}</small>
                </button>
              </div>
            </template>
          </section>
        </div>
        <button
          class="chat__icon-btn"
          :class="{ 'chat__icon-btn--active': panelOpen }"
          type="button"
          title="参数面板"
          aria-label="参数面板"
          @click="emit('toggle-panel')"
        >
          <PhGearSix :size="16" weight="regular" />
        </button>
      </div>
    </header>

    <div class="chat__messages-area">
      <ConversationProgressRail :messages="messages" :container-el="messagesContainer" />
      <div ref="messagesContainer" class="chat__messages" :class="{ 'chat__messages--empty': !messages.length && !streaming }" @scroll.passive="onMessagesScroll">
        <div v-if="!messages.length && !streaming" class="chat__empty">
        <div class="chat__empty-icon"><PhLightning :size="28" weight="duotone" /></div>
        <h2 class="chat__empty-title">开始新的对话</h2>
        <p class="chat__empty-subtitle">选择下方推荐话题，或直接输入你想了解的内容</p>
      </div>

      <MessageBubble
        v-for="(msg, i) in displayMessages"
        :key="`${msg.createdAt ?? 'streaming'}-${i}`"
        :message="msg"
        :message-index="i"
        :model-name="assistantModelName(msg)"
        :data-message-index="i"
        :retryable="textMessageFailed(msg) && !streaming && !generatingDigest && !imageGenerating"
        :regenerable="canRegenerate(i, msg) && !streaming && !generatingDigest"
        :branchable="i < messages.length && !streaming && !imageGenerating && !generatingDigest && !branchCreating"
        :streaming="streaming && i === displayMessages.length - 1 && msg.role === 'assistant'"
        @retry="retryMessage(i)"
        @retry-image="retryImage(i)"
        @edit-image="editImage(i)"
        @abort-image="abortImageGeneration"
        @retry-gemini="retryGemini(i)"
        @edit-gemini="editGemini(i)"
        @abort-gemini="abortImageGeneration"
        @use-image-reference="useImageReference(i)"
        @regenerate="regenerateMessage(i)"
        @edit="editMessage"
        @branch="emit('branch', $event)"
      />

      <div v-if="waitingForFirstToken" class="chat__assistant-loading" aria-live="polite" aria-label="AI 正在思考">
        <div class="chat__assistant-loading-role">{{ currentModel?.displayName ?? 'Assistant' }}</div>
        <div class="chat__assistant-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
    </div>

    <button
      v-if="showLatestButton"
      class="chat__latest-button"
      :class="{ 'chat__latest-button--streaming': streaming }"
      type="button"
      :aria-label="locale === 'zh' ? '跳转到最新消息' : 'Jump to latest message'"
      @click="jumpToLatest"
    >
      <PhArrowDown :size="16" weight="bold" />
    </button>

    <Composer
      ref="composerRef"
      :streaming="streaming"
      :image-generating="imageGenerating"
      :busy="generatingDigest"
      :params="params"
      :image-models="imageModels"
      :reference-image-id="referenceImageId"
      :reference-image-label="referenceImageId ? '基于上一张图片' : null"
      @send="handleSend"
      @generate-image="handleGenerateImage"
      @generate-gemini="handleGenerateGemini"
      @clear-reference="selectReferenceImage(null)"
      @abort="abort"
      @abort-image="abortImageGeneration"
      @update:params="emit('update:params', $event)"
    >
      <template #suggestions>
        <div v-if="!messages.length && !streaming" class="chat__suggestions" aria-label="推荐话题">
          <div class="chat__suggestions-label">为你推荐</div>
          <button
            v-for="s in suggestions"
            :key="s.query"
            class="chat__suggestion"
            type="button"
            @click="useSuggestion(s)"
          >
            <span class="chat__suggestion-title">{{ s.title }}</span>
          </button>
        </div>
      </template>
    </Composer>

  </main>
</template>

<style scoped lang="scss">
.chat {
  --composer-height: 112px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.chat__header {
  position: relative;
  z-index: 20;
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 80%, transparent);
  backdrop-filter: blur(12px);
}

.chat__header-left,
.chat__header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat__digest {
  position: relative;
}

.chat__digest-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  width: min(360px, calc(100vw - 32px));
  max-height: min(560px, calc(100dvh - 86px));
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
}

.chat__digest-menu-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat__digest-menu-header strong {
  color: var(--color-text);
  font-size: 13px;
}

.chat__digest-menu-header p,
.chat__digest-note,
.chat__digest-covered {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.chat__digest-covered {
  color: var(--color-accent-strong);
}

.chat__digest-close {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.chat__digest-close:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.chat__digest-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.chat__digest-button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
  font: 600 12px var(--font-sans);
}

.chat__digest-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.chat__digest-button--secondary {
  border-color: var(--color-border-strong);
  background: transparent;
  color: var(--color-text);
}

.chat__digest-summary {
  margin: 12px 0 0;
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.chat__digest-outline {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-subtle);
}

.chat__digest-outline > span {
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
}

.chat__digest-outline-item {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.chat__digest-outline-item:hover:not(:disabled) {
  background: var(--color-accent-soft);
}

.chat__digest-outline-item:disabled {
  cursor: default;
  opacity: 0.45;
}

.chat__digest-outline-item strong {
  font-size: 12px;
}

.chat__digest-outline-item small {
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.45;
}

.chat__icon-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
}

.chat__icon-btn:hover,
.chat__icon-btn--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.chat__messages-area {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: stretch;
}

.chat__messages {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.chat__messages--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.chat__messages::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.chat__messages::-webkit-scrollbar-track { background: transparent; }

.chat__messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--color-border-strong);
}

.chat__messages::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }

.chat__assistant-loading {
  width: min(100%, 780px);
  margin: 0 auto;
  padding: 12px 24px;
}

.chat__assistant-loading-role {
  margin-bottom: 7px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

.chat__assistant-loading-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 20px;
}

.chat__assistant-loading-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: assistant-loading-dot 1.2s ease-in-out infinite;
}

.chat__assistant-loading-dots span:nth-child(2) { animation-delay: 0.15s; }
.chat__assistant-loading-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes assistant-loading-dot {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

.chat__latest-button {
  position: absolute;
  left: 50%;
  bottom: calc(var(--composer-height) + 12px);
  transform: translateX(-50%);
  z-index: 5;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-bg-elevated) 92%, transparent);
  color: var(--color-text);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px);
}

.chat__latest-button:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.chat__latest-button--streaming {
  border-color: transparent;
  animation: latest-pulse 1.8s ease-in-out infinite;
}

.chat__latest-button--streaming::before {
  content: '';
  position: absolute;
  inset: -1px;
  z-index: 0;
  border-radius: inherit;
  padding: 1px;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    var(--color-accent) 90deg,
    transparent 180deg,
    var(--color-accent-strong) 270deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  animation: latest-border-spin 1.2s linear infinite;
}

.chat__latest-button--streaming :deep(svg) {
  position: relative;
  z-index: 1;
}

@keyframes latest-border-spin {
  to { transform: rotate(360deg); }
}

@keyframes latest-pulse {
  0%, 100% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24), 0 0 0 0 var(--color-accent-glow); }
  50% { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24), 0 0 0 5px transparent; }
}

.chat__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px;
}

.chat__empty-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-accent-soft), transparent);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  margin-bottom: 24px;
  position: relative;
  color: var(--color-accent-strong);

  :deep(svg) {
    position: relative;
    z-index: 1;
  }

  &::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-lg);
    padding: 1px;
    background: linear-gradient(135deg, var(--color-accent), transparent 60%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }
}

.chat__empty-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
  color: var(--color-text);
}

.chat__empty-subtitle {
  font-size: 14px;
  color: var(--color-text-muted);
  margin-bottom: 32px;
  max-width: 420px;
}

.chat__suggestions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.chat__suggestions-label {
  padding-left: 3px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1;
  opacity: 0.68;
}

.chat__suggestion {
  display: block;
  width: fit-content;
  max-width: min(100%, 640px);
  min-height: 40px;
  padding: 9px 14px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 78%, transparent);
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;
}

.chat__suggestion:hover {
  background: var(--color-surface-2);
  border-color: var(--color-border-strong);
  color: var(--color-text);
  transform: translateX(2px);
}

.chat__suggestion-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.55;
}
</style>
