<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { PhListChecks } from '@phosphor-icons/vue'
import type { ChatMessage, ToolCallTrace } from '../types'
import { isTextMessage } from '../api'
import { imageStyleName } from '../image-styles'
import { renderMarkdown } from '../message-markdown'
import GeminiMultimodalCard from './GeminiMultimodalCard.vue'
import ImageMessageCard from './ImageMessageCard.vue'

const props = defineProps<{
  message: ChatMessage
  messageIndex: number
  streaming?: boolean
  modelName?: string
  retryable?: boolean
  regenerable?: boolean
  branchable?: boolean
}>()

const emit = defineEmits<{
  retry: []
  regenerate: []
  edit: [index: number, content: string]
  branch: [index: number]
  'retry-image': []
  'edit-image': []
  'abort-image': []
  'retry-gemini': []
  'edit-gemini': []
  'abort-gemini': []
  'use-image-reference': []
}>()

const textMessage = computed(() => isTextMessage(props.message) ? props.message : null)
const toolCalls = computed(() => textMessage.value?.toolCalls ?? [])
const imageMessage = computed(() => props.message.type === 'image-request' || props.message.type === 'image-result' ? props.message : null)
const geminiUserMessage = computed(() => props.message.type === 'gemini-multimodal-user' ? props.message : null)
const geminiAssistantMessage = computed(() => props.message.type === 'gemini-multimodal-assistant' ? props.message : null)
const renderedContent = computed(() => textMessage.value ? renderMarkdown(textMessage.value.content) : '')
const isText = computed(() => Boolean(textMessage.value))
const isAssistant = computed(() => props.message.role === 'assistant')
const isStreaming = computed(() => Boolean(props.streaming))
const copied = ref(false)
const editing = ref(false)
const editedContent = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)

async function copyContent() {
  const content = textMessage.value?.content
  if (!content) return
  await navigator.clipboard.writeText(content)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function startEditing() {
  const content = textMessage.value?.content
  if (!content) return
  editedContent.value = content
  editing.value = true
  await nextTick()
  editInput.value?.focus()
}

function cancelEditing() {
  editing.value = false
  editedContent.value = ''
}

function submitEdit() {
  const content = editedContent.value.trim()
  if (!content || content === textMessage.value?.content) {
    cancelEditing()
    return
  }
  emit('edit', props.messageIndex, content)
  cancelEditing()
}

function onEditKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditing()
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submitEdit()
  }
}

const BUILTIN_TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  web_fetch: '网页抓取',
  finance_quote: '行情查询',
  agent_plan: '任务规划',
}

function prettyToolName(name: string): string {
  if (BUILTIN_TOOL_LABELS[name]) return BUILTIN_TOOL_LABELS[name]
  return name.replace(/^mcp__/, '').replace(/__/g, ' · ')
}

function hasArgs(args: Record<string, unknown> | undefined): boolean {
  return Boolean(args && Object.keys(args).length)
}

function formatArgs(args: Record<string, unknown>): string {
  try { return JSON.stringify(args, null, 2) } catch { return String(args) }
}

function truncateResult(result: string): string {
  if (!result) return '（无返回内容）'
  return result.length > 200 ? `${result.slice(0, 200)}…` : result
}

// agent_plan 在工具调用清单里「原地更新」：多次调用会在同一消息里留下多条痕迹。
// 我们只把最新一条快照渲染成任务规划卡，旧快照收起，避免刷屏；其余工具照常渲染为 details 块。
type PlanStatus = 'pending' | 'in_progress' | 'done'
interface PlanTaskItem {
  text: string
  status: PlanStatus
}

function parsePlanTasks(value: unknown): PlanTaskItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .map((t) => ({
      text: typeof t.text === 'string' ? t.text : '',
      status: (t.status === 'done' || t.status === 'in_progress' ? t.status : 'pending') as PlanStatus,
    }))
    .filter((t) => t.text)
}

function parsePlanFromResult(result: string): PlanTaskItem[] {
  const tasks: PlanTaskItem[] = []
  for (const line of result.split('\n')) {
    const match = line.match(/^([✓◐○])\s*\d+\.\s*(.+)$/)
    if (match) {
      tasks.push({
        text: match[2] ?? '',
        status: match[1] === '✓' ? 'done' : match[1] === '◐' ? 'in_progress' : 'pending',
      })
    }
  }
  return tasks
}

function planMark(status: PlanStatus): string {
  return status === 'done' ? '✓' : status === 'in_progress' ? '◐' : '○'
}

const planTrace = computed<ToolCallTrace | null>(() => {
  const traces = toolCalls.value
  for (let i = traces.length - 1; i >= 0; i--) {
    const trace = traces[i] as ToolCallTrace | undefined
    if (trace && trace.name === 'agent_plan') return trace
  }
  return null
})
const otherTraces = computed(() => toolCalls.value.filter((tc) => tc.name !== 'agent_plan'))
const planTasks = computed<PlanTaskItem[]>(() => {
  if (!planTrace.value) return []
  const fromArgs = parsePlanTasks(planTrace.value.arguments?.tasks)
  return fromArgs.length ? fromArgs : parsePlanFromResult(planTrace.value.result ?? '')
})
</script>

<template>
  <div class="message" :class="`message--${message.role}`">
    <div class="message__body">
      <template v-if="geminiUserMessage">
        <div class="message__content"><div class="message__plain">{{ geminiUserMessage.content }}</div></div>
        <div v-if="geminiUserMessage.aspectRatio || geminiUserMessage.style" class="message__meta-tags">
          <span v-if="geminiUserMessage.aspectRatio">{{ geminiUserMessage.aspectRatio }}</span>
          <span v-if="geminiUserMessage.style">{{ imageStyleName(geminiUserMessage.style) }}</span>
        </div>
      </template>
      <template v-else-if="geminiAssistantMessage">
        <GeminiMultimodalCard
          :message="geminiAssistantMessage"
          @retry="emit('retry-gemini')"
          @edit="emit('edit-gemini')"
          @abort="emit('abort-gemini')"
          @use-as-reference="emit('use-image-reference')"
        />
      </template>
      <template v-else-if="!isText">
        <ImageMessageCard
          v-if="imageMessage"
          :message="imageMessage"
          @retry="emit('retry-image')"
          @edit="emit('edit-image')"
          @abort="emit('abort-image')"
          @use-as-reference="emit('use-image-reference')"
        />
      </template>
      <template v-else>
        <div v-if="isAssistant" class="message__role">{{ modelName ?? 'Assistant' }}</div>
        <div v-if="textMessage?.status === 'error'" class="message__status message__status--error" role="alert">
          <strong>回复失败</strong>
          <p>{{ textMessage.content }}</p>
          <button v-if="retryable" class="message__retry" type="button" @click="emit('retry')">重新发送</button>
        </div>
        <div v-else class="message__content">
          <template v-if="editing">
            <textarea
              ref="editInput"
              v-model="editedContent"
              class="message__edit-input"
              aria-label="编辑消息"
              @keydown="onEditKeydown"
            />
            <div class="message__edit-actions">
              <span class="message__edit-hint">⌘/Ctrl + Enter 发送</span>
              <button class="message__edit-button" type="button" @click="cancelEditing">取消</button>
              <button class="message__edit-button message__edit-button--primary" type="button" @click="submitEdit">保存并重新发送</button>
            </div>
          </template>
          <template v-else>
            <div v-if="toolCalls.length" class="message__toolcalls" role="list" aria-label="工具调用">
              <div v-if="planTasks.length" class="message__plan" role="list" aria-label="任务规划">
                <div class="message__plan-heading"><PhListChecks :size="14" weight="bold" /> 任务规划<span class="message__plan-progress">{{ planTasks.filter((t) => t.status === 'done').length }}/{{ planTasks.length }}</span></div>
                <ul class="message__plan-list">
                  <li
                    v-for="(task, i) in planTasks"
                    :key="i"
                    class="message__plan-task"
                    :class="`message__plan-task--${task.status}`"
                  >
                    <span class="message__plan-mark" aria-hidden="true">{{ planMark(task.status) }}</span>
                    <span class="message__plan-text">{{ task.text }}</span>
                  </li>
                </ul>
              </div>
              <details
                v-for="(tc, i) in otherTraces"
                :key="i"
                class="message__toolcall"
                :class="`message__toolcall--${tc.status ?? 'done'}`"
                :open="i === otherTraces.length - 1 || tc.status === 'running'"
              >
                <summary class="message__toolcall-summary">
                  <span v-if="tc.status === 'running'" class="message__toolcall-spinner" />
                  <span v-else class="message__toolcall-dot" />
                  <span class="message__toolcall-name">{{ prettyToolName(tc.name) }}</span>
                  <span class="message__toolcall-hint">{{ tc.status === 'running' ? '正在调用…' : '工具已调用' }}</span>
                </summary>
                <div class="message__toolcall-body">
                  <div v-if="hasArgs(tc.arguments)" class="message__toolcall-row">
                    <span class="message__toolcall-label">入参</span>
                    <code class="message__toolcall-code">{{ formatArgs(tc.arguments) }}</code>
                  </div>
                  <div v-if="tc.status !== 'running'" class="message__toolcall-row">
                    <span class="message__toolcall-label">返回</span>
                    <code class="message__toolcall-code">{{ truncateResult(tc.result) }}</code>
                  </div>
                </div>
              </details>
            </div>
            <div v-if="isAssistant" class="message__markdown" v-html="renderedContent" />
            <div v-else class="message__plain">{{ textMessage?.content }}</div>
            <span v-if="isStreaming" class="message__cursor" />
            <div v-if="textMessage?.status === 'interrupted'" class="message__interrupted">已停止生成</div>
          </template>
        </div>
        <div v-if="!streaming && textMessage?.status !== 'error' && !editing" class="message__actions">
          <button class="message__action" type="button" @click="copyContent">{{ copied ? '已复制' : '复制' }}</button>
          <button v-if="!isAssistant" class="message__action" type="button" @click="startEditing">编辑</button>
          <button v-if="regenerable" class="message__action" type="button" @click="emit('regenerate')">重新生成</button>
          <button v-if="branchable" class="message__action" type="button" @click="emit('branch', messageIndex)">从这里分支</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.message {
  width: min(100%, 780px);
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  gap: 16px;
}

.message--user {
  justify-content: flex-end;
}

.message--user .message__body {
  flex: 0 1 auto;
  max-width: min(78%, 620px);
}

.message--user .message__role,
.message--user .message__content,
.message--user .message__plain {
  text-align: left;
}

.message--user .message__content {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px 4px 16px 16px;
  background: var(--color-accent-soft);
}

.message--user .message__actions {
  justify-content: flex-end;
}

.message--assistant .message__body {
  min-width: 0;
}

.message__body {
  flex: 1;
  min-width: 0;
}

.message__role {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.message__content {
  font-size: 14px;
  color: var(--color-text-muted);
  line-height: 1.7;
  word-break: break-word;
}

.message__plain { white-space: pre-wrap; }

.message__meta-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.message__meta-tags span { height: 18px; padding: 0 7px; border-radius: var(--radius-full); background: var(--color-accent-soft); color: var(--color-accent-strong); font-size: 10px; line-height: 18px; }

.message__toolcalls {
  display: grid;
  gap: 6px;
  margin-bottom: 8px;
}

.message__plan {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  padding: 9px 11px;
}

.message__plan-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-accent-strong);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.message__plan-progress {
  margin-left: auto;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
}

.message__plan-list {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.message__plan-task {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.message__plan-task--done .message__plan-text { text-decoration: line-through; color: var(--color-text-muted); opacity: 0.65; }
.message__plan-task--in_progress .message__plan-text { color: var(--color-text); font-weight: 600; }
.message__plan-task--done .message__plan-mark { color: var(--color-accent); }
.message__plan-task--in_progress .message__plan-mark { color: var(--color-accent-strong); }

.message__plan-mark {
  flex-shrink: 0;
  width: 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.message__plan-text { flex: 1; min-width: 0; word-break: break-word; }

.message__toolcall {
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.message__toolcall-summary {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  cursor: pointer;
  list-style: none;
  color: var(--color-text);
  font-size: 12px;
  user-select: none;
}

.message__toolcall-summary::-webkit-details-marker { display: none; }

.message__toolcall-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-accent);
}

.message__toolcall-spinner {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong, var(--color-border));
  border-top-color: var(--color-accent);
  animation: message__toolcall-spin 0.7s linear infinite;
}

.message__toolcall--running {
  border-color: var(--color-accent);
}

.message__toolcall--running .message__toolcall-name {
  color: var(--color-accent);
}

@keyframes message__toolcall-spin {
  to { transform: rotate(360deg); }
}

.message__toolcall-name {
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 12px;
}

.message__toolcall-hint {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 11px;
}

.message__toolcall-body {
  display: grid;
  gap: 6px;
  padding: 0 10px 10px;
}

.message__toolcall-row {
  display: grid;
  gap: 3px;
}

.message__toolcall-label {
  color: var(--color-text-muted);
  font-size: 11px;
}

.message__toolcall-code {
  display: block;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.55;
  color: var(--color-text);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
}

.message__edit-input {
  display: block;
  width: 100%;
  min-height: 92px;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  line-height: 1.6;
  outline: none;
  padding: 10px 12px;
}

.message__edit-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.message__edit-hint {
  margin-right: auto;
  color: var(--color-text-muted);
  font-size: 11px;
}

.message__edit-button {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 9px;
}

.message__edit-button--primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.message__edit-button:hover { border-color: var(--color-accent); }

.message__status {
  max-width: 520px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.message__status--error {
  border-color: color-mix(in srgb, var(--color-danger) 55%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-surface));
  color: var(--color-text);
}

.message__status p {
  margin: 5px 0 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.message__retry {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 5px 9px;
}

.message__retry:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.message__interrupted {
  width: fit-content;
  margin-top: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
}

.message__markdown :deep(p) { margin: 0 0 0.8em; }
.message__markdown :deep(p:last-child) { margin-bottom: 0; }
.message__markdown :deep(h1),
.message__markdown :deep(h2),
.message__markdown :deep(h3) { margin: 1.1em 0 0.55em; color: var(--color-text); line-height: 1.35; }
.message__markdown :deep(h1) { font-size: 1.35em; }
.message__markdown :deep(h2) { font-size: 1.2em; }
.message__markdown :deep(h3) { font-size: 1.08em; }
.message__markdown :deep(ul),
.message__markdown :deep(ol) { margin: 0.55em 0 0.8em; padding-left: 1.5em; }
.message__markdown :deep(li + li) { margin-top: 0.25em; }
.message__markdown :deep(blockquote) { margin: 0.8em 0; padding: 0.2em 0 0.2em 1em; border-left: 3px solid var(--color-accent); color: var(--color-text-muted); background: var(--color-surface); }
.message__markdown :deep(hr) { margin: 1em 0; border: 0; border-top: 1px solid var(--color-border); }
.message__markdown :deep(a) { color: var(--color-accent-strong); text-decoration: underline; text-underline-offset: 2px; }
.message__markdown :deep(code) { padding: 0.12em 0.35em; border: 1px solid var(--color-border); border-radius: 5px; background: var(--color-surface-2); color: var(--color-accent-strong); font-family: var(--font-mono); font-size: 0.88em; }
.message__markdown :deep(pre) { margin: 0.8em 0; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-2); padding: 12px 14px; }
.message__markdown :deep(pre code) { display: block; padding: 0; border: 0; background: transparent; color: var(--color-text); font-size: 12px; line-height: 1.65; white-space: pre; }
.message__markdown :deep(table) { width: 100%; margin: 0.8em 0; border-collapse: collapse; font-size: 0.92em; }
.message__markdown :deep(th),
.message__markdown :deep(td) { padding: 7px 9px; border: 1px solid var(--color-border); text-align: left; }
.message__markdown :deep(th) { color: var(--color-text); background: var(--color-surface); }

.message__cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  background: var(--color-accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: msg-blink 1s steps(2) infinite;
  border-radius: 1px;
}

@keyframes msg-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.message__actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message:hover .message__actions { opacity: 1; }

.message__action {
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.message__action:hover {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}
</style>
