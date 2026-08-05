<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { marked } from 'marked'
import {
  PhSparkle,
  PhPaperPlaneRight,
  PhStop,
  PhX,
  PhTrash,
  PhWarningCircle,
} from '@phosphor-icons/vue'
import { useLocaleStore } from '@/stores/locale'
import { useAcademyStore } from '@/stores/academy'
import {
  buildSystemPrompt,
  getAiConfig,
  streamChat,
  type AiConfig,
  type ChatMessage,
} from '@/learn/ai'
import type { LessonMeta } from '@/learn/curriculum'
import type { Step } from '@/learn/walkthrough'

defineOptions({ name: 'AiTutor' })

const props = defineProps<{
  lesson: LessonMeta
  step: Step | null
  open: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const i18n = useLocaleStore()
const academy = useAcademyStore()

const config = ref<AiConfig>({ available: false, model: '', baseUrlMasked: '' })
const input = ref('')
const quotedText = ref('')
const streaming = ref(false)
const streamingText = ref('')
const error = ref('')
const listEl = ref<HTMLElement | null>(null)
const taEl = ref<HTMLTextAreaElement | null>(null)
let controller: AbortController | null = null
let userScrolled = false

const messages = computed(() => academy.getChat(props.lesson.id))
const empty = computed(() => messages.value.length === 0 && !streaming.value && !streamingText.value)

const quick = computed(() => [
  {
    label: i18n.t('academy.tutor.explain'),
    text: props.step
      ? `用前端工程师能懂的类比，帮我理解「${props.step.title}」这一节的核心概念。`
      : '帮我理解今天这课的核心概念，用前端能懂的类比。',
  },
  {
    label: i18n.t('academy.tutor.practice'),
    text: '给我一个小练习，让我动手验证今天讲的东西，别给答案太早。',
  },
  {
    label: i18n.t('academy.tutor.check'),
    text: '检查我对今天这课的理解：问我 2-3 个问题，等我答完再评判。',
  },
  {
    label: i18n.t('academy.tutor.continue'),
    text: '我准备好了，带我进入下一个知识点或步骤。',
  },
])

function renderMd(s: string): string {
  return marked.parse(s, { async: false }) as string
}

function scrollToBottom(force = false) {
  nextTick(() => {
    if (!listEl.value) return
    if (!force && userScrolled) return
    listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

function onMessagesScroll() {
  const el = listEl.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  userScrolled = !atBottom
}

function autosize() {
  const el = taEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

function quote(text: string) {
  quotedText.value = text
}

function clearQuote() {
  quotedText.value = ''
}

async function send(text: string) {
  const content = text.trim()
  const quoted = quotedText.value.trim()
  const message = quoted ? `引用内容：\n> ${quoted.replace(/\n/g, '\n> ')}\n\n${content}` : content
  const finalContent = message.trim()
  if (!finalContent || streaming.value || !config.value.available) return
  error.value = ''
  input.value = ''
  quotedText.value = ''
  const messageContent = finalContent
  nextTick(autosize)

  academy.addMessage(props.lesson.id, { role: 'user', content: messageContent })
  streaming.value = true
  streamingText.value = ''
  userScrolled = false
  scrollToBottom(true)

  controller = new AbortController()
  const system = buildSystemPrompt(props.lesson, props.step)
  try {
    await streamChat({
      messages: [...academy.getChat(props.lesson.id)],
      system,
      onToken: (t) => {
        streamingText.value += t
        scrollToBottom()
      },
      onDone: (full) => {
        academy.addMessage(props.lesson.id, { role: 'assistant', content: full || streamingText.value })
        streamingText.value = ''
        streaming.value = false
        scrollToBottom()
      },
      signal: controller.signal,
    })
  } catch (e) {
    if (streamingText.value) {
      academy.addMessage(props.lesson.id, { role: 'assistant', content: streamingText.value })
    }
    streamingText.value = ''
    streaming.value = false
    const err = e as Error
    if (err.name !== 'AbortError') {
      error.value = err.message || String(e)
    }
  } finally {
    controller = null
  }
}

function stop() {
  controller?.abort()
}

function clearChat() {
  controller?.abort()
  streaming.value = false
  streamingText.value = ''
  error.value = ''
  userScrolled = false
  academy.clearChat(props.lesson.id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send(input.value)
  }
}

function sendPrompt(text: string) {
  if (!config.value.available || streaming.value) return
  send(text)
}

defineExpose({ sendPrompt, quote })

watch(
  () => props.open,
  (o) => {
    if (o) {
      scrollToBottom()
      nextTick(() => taEl.value?.focus())
    }
  },
)

watch(
  () => props.lesson.id,
  () => {
    controller?.abort()
    streaming.value = false
    streamingText.value = ''
    error.value = ''
    nextTick(scrollToBottom)
  },
)

watch(streamingText, () => scrollToBottom())

onMounted(async () => {
  config.value = await getAiConfig()
  scrollToBottom()
})

onUnmounted(() => {
  controller?.abort()
})
</script>

<template>
  <aside class="tutor" :class="{ 'tutor--on': open }" aria-label="AI Tutor">
    <button
      v-if="open"
      type="button"
      class="tutor__scrim"
      aria-label="关闭助教"
      @click="emit('close')"
    />

    <div class="tutor__panel">
      <header class="tutor__head">
        <div class="tutor__head-id">
          <PhSparkle :size="16" weight="fill" class="tutor__head-spark" />
          <span class="tutor__head-title">{{ i18n.t('academy.tutor.title') }}</span>
          <span v-if="config.available" class="tutor__head-model">{{ config.model }}</span>
        </div>
        <div class="tutor__head-actions">
          <button
            v-if="messages.length"
            type="button"
            class="tutor__icon-btn"
            :aria-label="i18n.t('academy.tutor.clear')"
            @click="clearChat"
          >
            <PhTrash :size="16" />
          </button>
          <button
            type="button"
            class="tutor__icon-btn"
            aria-label="关闭"
            @click="emit('close')"
          >
            <PhX :size="18" />
          </button>
        </div>
      </header>

      <div v-if="!config.available" class="tutor__unavailable">
        <PhWarningCircle :size="22" weight="duotone" />
        <p>{{ i18n.t('academy.tutor.unavailable') }}</p>
      </div>

      <template v-else>
        <div ref="listEl" class="tutor__messages" @scroll.passive="onMessagesScroll">
          <div v-if="empty" class="tutor__empty">
            <div class="tutor__empty-icon"><PhSparkle :size="20" weight="duotone" /></div>
            <p class="tutor__empty-text">{{ i18n.t('academy.tutor.empty') }}</p>
            <div class="tutor__quick">
              <button
                v-for="q in quick"
                :key="q.label"
                type="button"
                class="tutor__chip"
                :disabled="streaming"
                @click="send(q.text)"
              >
                {{ q.label }}
              </button>
            </div>
          </div>

          <div
            v-for="(m, i) in messages"
            :key="i"
            class="msg"
            :class="m.role === 'user' ? 'msg--user' : 'msg--assistant'"
          >
            <div v-if="m.role === 'assistant'" class="msg__avatar" aria-hidden="true">
              <PhSparkle :size="13" weight="fill" />
            </div>
            <div
              class="msg__bubble"
              :class="{ 'msg__bubble--user': m.role === 'user' }"
              v-html="renderMd(m.content)"
            />
          </div>

          <div v-if="streaming || streamingText" class="msg msg--assistant">
            <div class="msg__avatar" aria-hidden="true">
              <PhSparkle :size="13" weight="fill" />
            </div>
            <div class="msg__bubble msg__bubble--streaming">
              <span v-if="streamingText" v-html="renderMd(streamingText)" />
              <span v-if="streaming && !streamingText" class="tutor__typing">{{ i18n.t('academy.tutor.streamHint') }}</span>
              <span v-if="streaming" class="tutor__caret" aria-hidden="true" />
            </div>
          </div>

          <p v-if="error" class="tutor__error">
            <PhWarningCircle :size="14" weight="bold" />
            {{ error }}
          </p>
        </div>

        <div class="tutor__input">
          <div v-if="quotedText" class="tutor__quote">
            <div class="tutor__quote-head">
              <span>引用内容</span>
              <button type="button" aria-label="移除引用" @click="clearQuote"><PhX :size="13" /></button>
            </div>
            <p>{{ quotedText }}</p>
          </div>
          <textarea
            ref="taEl"
            v-model="input"
            class="tutor__ta"
            rows="1"
            :placeholder="i18n.t('academy.tutor.placeholder')"
            :disabled="streaming"
            @input="autosize"
            @keydown="onKeydown"
          />
          <button
            v-if="!streaming"
            type="button"
            class="tutor__send"
            :disabled="!input.trim()"
            @click="send(input)"
          >
            <PhPaperPlaneRight :size="17" weight="fill" />
          </button>
          <button v-else type="button" class="tutor__send tutor__send--stop" @click="stop">
            <PhStop :size="16" weight="fill" />
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.tutor {
  position: relative;
  height: 100%;
  min-height: 0;
}

.tutor__scrim {
  display: none;
}

.tutor__panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-bg);
}

.tutor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 60px;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.tutor__head-id {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.tutor__head-spark {
  color: var(--color-accent);
  flex-shrink: 0;
}

.tutor__head-title {
  font-size: 0.86rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.tutor__head-model {
  margin-left: 0.25rem;
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  text-transform: lowercase;
}

.tutor__head-actions {
  display: inline-flex;
  gap: 0.25rem;
}

.tutor__icon-btn {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tutor__icon-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.tutor__unavailable {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-muted);
}

.tutor__unavailable svg {
  color: var(--color-accent);
}

.tutor__unavailable p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.6;
  max-width: 18rem;
}

.tutor__messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4) var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  scrollbar-width: none;
}

.tutor__messages::-webkit-scrollbar {
  display: none;
}

.tutor__empty {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  text-align: center;
}

.tutor__empty-icon {
  color: var(--color-accent);
  opacity: 0.85;
}

.tutor__empty-text {
  margin: 0 0 0.4rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  max-width: 16rem;
  line-height: 1.5;
}

.tutor__quick {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  max-width: 16rem;
}

.tutor__chip {
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 0.78rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.tutor__chip:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.tutor__chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  max-width: 100%;
}

.msg--user {
  flex-direction: row-reverse;
}

.msg__avatar {
  flex-shrink: 0;
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
  margin-top: 0.15rem;
}

.msg__bubble {
  min-width: 0;
  max-width: calc(100% - 28px);
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 0.84rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.msg__bubble--user {
  background: var(--color-accent-soft);
  border-color: transparent;
  color: var(--color-text);
}

.msg__bubble--streaming {
  display: flex;
  align-items: flex-end;
  gap: 0.2rem;
}

.msg__bubble :deep(p) {
  margin: 0 0 0.5em;
}

.msg__bubble :deep(p:last-child) {
  margin-bottom: 0;
}

.msg__bubble :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.msg__bubble :deep(pre) {
  overflow: auto;
  padding: 0.6rem 0.75rem;
  margin: 0.4rem 0;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  font-size: 0.78rem;
}

.msg__bubble :deep(pre code) {
  padding: 0;
  background: transparent;
}

.msg__bubble :deep(ul),
.msg__bubble :deep(ol) {
  padding-left: 1.1rem;
  margin: 0.3rem 0;
}

.msg__bubble :deep(li) {
  margin: 0.15rem 0;
}

.msg__bubble :deep(h1),
.msg__bubble :deep(h2),
.msg__bubble :deep(h3) {
  font-size: 0.9rem;
  margin: 0.5rem 0 0.3rem;
}

.tutor__typing {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.tutor__caret {
  display: inline-block;
  width: 6px;
  height: 1em;
  background: var(--color-accent);
  border-radius: 1px;
  animation: tutor-blink 1s steps(2, start) infinite;
}

@keyframes tutor-blink {
  to {
    opacity: 0;
  }
}

.tutor__error {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-radius: var(--radius-sm);
  background: rgba(220, 100, 60, 0.12);
  color: #c2560f;
  font-size: 0.76rem;
  line-height: 1.4;
}

.tutor__input {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.4rem;
  min-height: 60px;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  flex-shrink: 0;
}

.tutor__quote {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border-left: 2px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
}

.tutor__quote-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-accent);
  font-size: 0.7rem;
  font-weight: 650;
}

.tutor__quote-head button {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.tutor__quote p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.74rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.tutor__ta {
  flex: 1;
  min-height: 40px;
  max-height: 160px;
  resize: none;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.15s;
  scrollbar-width: none;
}

.tutor__ta::-webkit-scrollbar {
  display: none;
}

.tutor__ta:focus {
  border-color: var(--color-accent);
}

.tutor__ta::placeholder {
  color: var(--color-text-muted);
}

.tutor__ta:disabled {
  opacity: 0.6;
}

.tutor__send {
  flex-shrink: 0;
  display: inline-flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
  cursor: pointer;
  transition: background 0.15s, transform 0.12s;
}

.tutor__send:hover:not(:disabled) {
  background: var(--color-accent-strong);
}

.tutor__send:active:not(:disabled) {
  transform: scale(0.94);
}

.tutor__send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tutor__send--stop {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.tutor__send--stop:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

@media (max-width: 900px) {
  .tutor {
    position: static;
  }

  .tutor__scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 55;
    border: none;
    background: rgba(0, 0, 0, 0.35);
  }

  .tutor__panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    width: min(92vw, 420px);
    border-left: 1px solid var(--color-border);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
    transform: translateX(105%);
    transition: transform 0.22s ease;
  }

  .tutor--on .tutor__panel {
    transform: translateX(0);
  }

  .tutor:not(.tutor--on) .tutor__scrim {
    display: none;
  }
}
</style>
