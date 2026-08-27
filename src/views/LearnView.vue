<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import {
  PhHighlighter,
  PhClipboardText,
  PhX,
  PhDotsThree,
  PhSparkle,
  PhBookOpen,
  PhFlowArrow,
  PhPencilSimple,
  PhFloppyDisk,
  PhArrowCounterClockwise,
  PhCopy,
  PhChatText,
} from '@phosphor-icons/vue'
import { useLocaleStore } from '@/stores/locale'
import { useAcademyStore } from '@/stores/academy'
import { useUiStore, TUTOR_MIN, TUTOR_MAX } from '@/stores/ui'
import {
  guideSources,
  lessonById,
  lessonSource,
  lessons,
  phases,
  type LessonMeta,
} from '@/learn/curriculum'
import { parseWalkthrough, type Step, type StepKind } from '@/learn/walkthrough'
import { buildSystemPrompt, streamChat, type TutorAdapter } from '@/learn/ai'
import AiTutor from '@/components/AiTutor.vue'
import ResizeGutter from '@/components/ResizeGutter.vue'
import ReaderShell from '@/components/reader/ReaderShell.vue'
import ReaderFooter from '@/components/reader/ReaderFooter.vue'

defineOptions({ name: 'LearnView' })

type Pane = 'lesson' | 'readme' | 'profile' | 'resume'
type Mode = 'walk' | 'scroll'
const GUIDE_IDS: readonly string[] = ['readme', 'profile', 'resume']

const BOOK_TITLE = { zh: 'AI 应用工程', en: 'AI App Engineering' }

const i18n = useLocaleStore()
const route = useRoute()
const router = useRouter()
const academy = useAcademyStore()
const ui = useUiStore()

const mode = ref<Mode>('walk')
const readerEl = ref<HTMLElement | null>(null)
const tutorRef = ref<{ sendPrompt: (t: string) => void; quote: (t: string) => void } | null>(null)
const copied = ref(false)
const menuOpen = ref(false)
const editing = ref(false)
const draft = ref('')
const savedContent = ref<string | null>(null)
const savingDocument = ref(false)
const documentStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'
type Annotation = {
  id: string
  quote: string
  prefix?: string
  suffix?: string
  color: AnnotationColor
  createdAt: string
  updatedAt?: string
  stale?: boolean
}
const annotations = ref<Annotation[]>([])
const selectionToolbar = ref<{ text: string; x: number; y: number } | null>(null)
const editorSelectionToolbar = ref<{ x: number; y: number } | null>(null)
const colorMenuOpen = ref(false)
const annotationSaving = ref(false)
const selectedText = ref('')
const annotationColors: Array<{ value: AnnotationColor; label: string }> = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'pink', label: '粉色' },
  { value: 'purple', label: '紫色' },
]
const aiEditOpen = ref(false)
const aiEditInstruction = ref('')
const aiEditLoading = ref(false)
const aiEditError = ref('')
const aiEditResult = ref('')
const aiEditSelection = ref('')
const editorEl = ref<HTMLTextAreaElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const editorScrollLock = ref(false)
const aiEditPosition = ref({ x: 0, y: 0 })
const aiEditDragging = ref(false)
const aiEditDragOffset = ref({ x: 0, y: 0 })
const dragging = ref(false)

const routeState = computed(() => {
  const s = String(route.query.s ?? '')
  if (GUIDE_IDS.includes(s)) return { pane: s as Exclude<Pane, 'lesson'>, lessonId: null }
  if (s && lessonById(s)) return { pane: 'lesson' as const, lessonId: s }
  return { pane: 'lesson' as const, lessonId: academy.lastOpened ?? academy.todayLesson.id }
})
const pane = computed<Pane>(() => routeState.value.pane)
const activeId = computed(() => routeState.value.lessonId ?? academy.todayLesson.id)

const activeLesson = computed(() => lessonById(activeId.value) ?? academy.todayLesson)
const activeIndex = computed(() => lessons.findIndex((l) => l.id === activeLesson.value.id))
const isGuide = computed(() => pane.value !== 'lesson')
const effectiveMode = computed<Mode>(() => (isGuide.value ? 'scroll' : mode.value))
const hasNext = computed(() => pane.value === 'lesson' && activeIndex.value < lessons.length - 1)
const isDone = computed(() => academy.isDone(activeLesson.value.id))

const groups = computed(() => [
  {
    id: 'guides',
    title: { zh: '前言', en: 'Front matter' },
    items: (['readme', 'profile', 'resume'] as const).map((id) => ({
      id,
      label: i18n.t(`academy.guide.${id}`),
      active: pane.value === id,
    })),
  },
  ...phases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    items: lessons
      .filter((l) => l.phase === phase.id)
      .map((lesson) => ({
        id: lesson.id,
        badge: String(lesson.day).padStart(2, '0'),
        label: i18n.tl(lesson.title),
        done: academy.isDone(lesson.id),
        active: pane.value === 'lesson' && lesson.id === activeLesson.value.id,
      })),
  })),
])

const baseMarkdownSource = computed(() => {
  if (pane.value === 'readme') return guideSources.readme
  if (pane.value === 'profile') return guideSources.profile
  if (pane.value === 'resume') return guideSources.resume
  return lessonSource(activeLesson.value)
})

const markdownSource = computed(() => editing.value ? draft.value : (savedContent.value ?? baseMarkdownSource.value))

const editableDocument = computed(() => pane.value === 'lesson')

function loadDocumentOverride() {
  if (!editableDocument.value) return
  const lessonId = encodeURIComponent(activeLesson.value.id)
  void Promise.all([
    fetch(`/api/lesson-documents/${lessonId}`, { credentials: 'include' }),
    fetch(`/api/lesson-annotations/${lessonId}`, { credentials: 'include' }),
  ])
    .then(async ([documentRes, annotationRes]) => {
      const documentData = documentRes.ok ? await documentRes.json() as { content?: string } : null
      const annotationData = annotationRes.ok ? await annotationRes.json() as { annotations?: unknown[] } : null
      savedContent.value = typeof documentData?.content === 'string' ? documentData.content : null
      annotations.value = Array.isArray(annotationData?.annotations)
        ? annotationData.annotations.filter((item): item is Annotation => {
          if (!item || typeof item !== 'object') return false
          const value = item as Record<string, unknown>
          return typeof value.id === 'string' && typeof value.quote === 'string'
            && ['yellow', 'green', 'blue', 'pink', 'purple'].includes(value.color as string)
        })
        : []
      if (!editing.value) draft.value = savedContent.value ?? baseMarkdownSource.value
    })
    .catch(() => undefined)
}

function onReaderSelection() {
  if (editing.value || !editableDocument.value) return
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (!selection || selection.rangeCount === 0 || text.length < 2 || !readerEl.value?.contains(selection.anchorNode)) {
    closeSelectionToolbar()
    return
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect()
  selectedText.value = text
  selectionToolbar.value = {
    text,
    x: Math.min(Math.max(12, rect.left + rect.width / 2 - 120), window.innerWidth - 252),
    y: Math.max(12, rect.top - 48),
  }
}

function selectionContext(text: string) {
  const source = markdownSource.value
  const index = source.indexOf(text)
  if (index < 0) return { prefix: '', suffix: '' }
  return { prefix: source.slice(Math.max(0, index - 40), index), suffix: source.slice(index + text.length, index + text.length + 40) }
}

function openColorMenu() {
  colorMenuOpen.value = !colorMenuOpen.value
}

function closeSelectionToolbar() {
  selectionToolbar.value = null
  selectedText.value = ''
  colorMenuOpen.value = false
}

function selectionTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('pre, .learn__annotation')) continue
    nodes.push(node as Text)
  }
  return nodes
}

function wrapAnnotation(root: HTMLElement, annotation: Annotation) {
  const nodes = selectionTextNodes(root)
  const fullText = nodes.map((node) => node.data).join('')
  const start = fullText.indexOf(annotation.quote)
  if (start < 0 || !annotation.quote.length) return false

  const end = start + annotation.quote.length
  let cursor = 0
  let wrapped = false

  for (const node of nodes) {
    const nodeStart = cursor
    const nodeEnd = cursor + node.data.length
    cursor = nodeEnd

    const segmentStart = Math.max(start, nodeStart)
    const segmentEnd = Math.min(end, nodeEnd)
    if (segmentStart >= segmentEnd) continue

    const mark = document.createElement('mark')
    mark.className = `learn__annotation learn__annotation--${annotation.color}`
    mark.title = `标注颜色：${annotationColors.find((item) => item.value === annotation.color)?.label ?? ''}`

    const range = document.createRange()
    range.setStart(node, segmentStart - nodeStart)
    range.setEnd(node, segmentEnd - nodeStart)
    range.surroundContents(mark)
    wrapped = true
  }

  return wrapped
}

async function saveAnnotations(next: Annotation[]) {
  annotationSaving.value = true
  try {
    const res = await fetch(`/api/lesson-annotations/${encodeURIComponent(activeLesson.value.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: next }),
    })
    if (!res.ok) throw new Error('annotation save failed')
    annotations.value = next
    await nextTick()
    applyAnnotations()
  } catch {
    // 标注保存失败时保留选中文本，用户可以重新选择颜色重试。
  } finally {
    annotationSaving.value = false
  }
}

function keepSelection(event: MouseEvent) {
  event.stopPropagation()
}

function resetSelectionToolbar() {
  window.setTimeout(() => {
    const selection = window.getSelection()
    if (!selection?.toString().trim()) closeSelectionToolbar()
  }, 0)
}

function annotate(color: AnnotationColor) {
  if (!selectedText.value || annotationSaving.value) return
  const now = new Date().toISOString()
  const context = selectionContext(selectedText.value)
  const existing = annotations.value.find((item) => item.quote === selectedText.value)
  const next = existing
    ? annotations.value.map((item) => item.id === existing.id
      ? { ...item, color, ...context, updatedAt: now, stale: false }
      : item)
    : [...annotations.value, {
      id: crypto.randomUUID(), quote: selectedText.value, color, ...context, createdAt: now, updatedAt: now,
    }]
  void saveAnnotations(next)
  closeSelectionToolbar()
}

async function requestAiEdit() {
  if (!aiEditSelection.value || aiEditLoading.value) return
  aiEditLoading.value = true
  aiEditError.value = ''
  aiEditResult.value = ''
  const controller = new AbortController()
  try {
    await streamChat({
      messages: [{ role: 'user', content: `请对下面选中的 Markdown 内容执行这个编辑要求：${aiEditInstruction.value || '优化表达并保持 Markdown 结构不变'}\n\n原文：\n${aiEditSelection.value}` }],
      system: buildSystemPrompt(activeLesson.value, currentStep.value),
      signal: controller.signal,
      onToken: (token) => { aiEditResult.value += token },
      onDone: (full) => { aiEditResult.value = full },
    })
  } catch {
    aiEditError.value = 'AI 编辑失败，请稍后重试。'
  } finally {
    aiEditLoading.value = false
  }
}

function replaceAiSelection() {
  if (!aiEditSelection.value || !aiEditResult.value) return
  const index = draft.value.indexOf(aiEditSelection.value)
  if (index < 0) {
    aiEditError.value = '当前草稿中找不到这段内容，可能已经被修改。'
    return
  }
  draft.value = `${draft.value.slice(0, index)}${aiEditResult.value}${draft.value.slice(index + aiEditSelection.value.length)}`
  aiEditOpen.value = false
}

function insertAiResult() {
  if (!aiEditResult.value) return
  draft.value += `\n\n${aiEditResult.value}`
  aiEditOpen.value = false
}

function syncEditorScroll() {
  if (!editorEl.value || !previewEl.value || editorScrollLock.value) return
  const sourceMax = editorEl.value.scrollHeight - editorEl.value.clientHeight
  const targetMax = previewEl.value.scrollHeight - previewEl.value.clientHeight
  if (sourceMax <= 0 || targetMax <= 0) return
  editorScrollLock.value = true
  previewEl.value.scrollTop = editorEl.value.scrollTop / sourceMax * targetMax
  requestAnimationFrame(() => { editorScrollLock.value = false })
}

function syncPreviewScroll() {
  if (!editorEl.value || !previewEl.value || editorScrollLock.value) return
  const sourceMax = previewEl.value.scrollHeight - previewEl.value.clientHeight
  const targetMax = editorEl.value.scrollHeight - editorEl.value.clientHeight
  if (sourceMax <= 0 || targetMax <= 0) return
  editorScrollLock.value = true
  editorEl.value.scrollTop = previewEl.value.scrollTop / sourceMax * targetMax
  requestAnimationFrame(() => { editorScrollLock.value = false })
}

function closeAiEditor() {
  aiEditOpen.value = false
  aiEditError.value = ''
  aiEditDragging.value = false
}

function startAiEditDrag(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  aiEditDragging.value = true
  aiEditDragOffset.value = {
    x: event.clientX - target.parentElement!.getBoundingClientRect().left,
    y: event.clientY - target.parentElement!.getBoundingClientRect().top,
  }
  window.addEventListener('pointermove', moveAiEdit)
  window.addEventListener('pointerup', stopAiEditDrag, { once: true })
}

function moveAiEdit(event: PointerEvent) {
  if (!aiEditDragging.value) return
  const width = 360
  const height = 420
  aiEditPosition.value = {
    x: Math.min(Math.max(12, event.clientX - aiEditDragOffset.value.x), window.innerWidth - width - 12),
    y: Math.min(Math.max(12, event.clientY - aiEditDragOffset.value.y), window.innerHeight - height - 12),
  }
}

function stopAiEditDrag() {
  aiEditDragging.value = false
  window.removeEventListener('pointermove', moveAiEdit)
}

function captureMarkdownSelection() {
  const textarea = editorEl.value
  if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
    editorSelectionToolbar.value = null
    return
  }
  aiEditSelection.value = draft.value.slice(textarea.selectionStart, textarea.selectionEnd)
  const rect = textarea.getBoundingClientRect()
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 24
  const line = draft.value.slice(0, textarea.selectionStart).split('\n').length - 1
  editorSelectionToolbar.value = {
    x: Math.min(window.innerWidth - 160, rect.left + 12),
    y: Math.min(window.innerHeight - 52, Math.max(12, rect.top + 12 + line * lineHeight - textarea.scrollTop)),
  }
}

function closeEditorSelectionToolbar() {
  editorSelectionToolbar.value = null
}

function requestAiEditFromSelection() {
  captureMarkdownSelection()
  if (!aiEditSelection.value) return
  const toolbar = editorSelectionToolbar.value
  aiEditInstruction.value = ''
  aiEditResult.value = ''
  aiEditError.value = ''
  aiEditOpen.value = true
  editorSelectionToolbar.value = null
  aiEditPosition.value = {
    x: Math.min(window.innerWidth - 380, Math.max(12, toolbar?.x ?? 12)),
    y: Math.min(window.innerHeight - 440, Math.max(12, (toolbar?.y ?? 12) + 42)),
  }
}

function askAiAboutSelection() {
  if (!selectedText.value) return
  const quote = selectedText.value
  closeSelectionToolbar()
  ui.toggleTutor(true)
  nextTick(() => tutorRef.value?.quote(quote))
}

function copySelection() {
  if (!selectedText.value) return
  void navigator.clipboard.writeText(selectedText.value)
  closeSelectionToolbar()
}

function startEditing() {
  if (!editableDocument.value) return
  draft.value = savedContent.value ?? baseMarkdownSource.value
  editing.value = true
  menuOpen.value = false
}

function cancelEditing() {
  editing.value = false
  draft.value = ''
  documentStatus.value = 'idle'
}

async function saveDocument() {
  if (!editableDocument.value || savingDocument.value) return
  savingDocument.value = true
  documentStatus.value = 'saving'
  try {
    const res = await fetch(`/api/lesson-documents/${encodeURIComponent(activeLesson.value.id)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: draft.value }),
    })
    if (!res.ok) throw new Error('save failed')
    savedContent.value = draft.value
    documentStatus.value = 'saved'
    editing.value = false
  } catch {
    documentStatus.value = 'error'
  } finally {
    savingDocument.value = false
  }
}

async function restoreDocument() {
  if (!editableDocument.value || !window.confirm('恢复仓库中的原始文档？当前个人修改将被删除。')) return
  const res = await fetch(`/api/lesson-documents/${encodeURIComponent(activeLesson.value.id)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => null)
  if (!res?.ok) {
    documentStatus.value = 'error'
    return
  }
  savedContent.value = null
  draft.value = baseMarkdownSource.value
  editing.value = false
  documentStatus.value = 'saved'
}

watch([() => activeLesson.value.id, editableDocument], loadDocumentOverride, { immediate: true })
watch(baseMarkdownSource, () => {
  if (editing.value && !savedContent.value) draft.value = baseMarkdownSource.value
})

const steps = computed<Step[]>(() => {
  if (effectiveMode.value !== 'walk') return []
  return parseWalkthrough(markdownSource.value)
})

const stepCount = computed(() => steps.value.length)
const stepIdx = computed(() => {
  if (!stepCount.value) return 0
  const stored = academy.getStep(activeLesson.value.id)
  return Math.min(Math.max(0, stored), stepCount.value - 1)
})
const currentStep = computed<Step | null>(() => steps.value[stepIdx.value] ?? null)

const tutorAdapter = computed<TutorAdapter>(() => ({
  getMessages: () => academy.getChat(activeLesson.value.id),
  addMessage: (msg) => academy.addMessage(activeLesson.value.id, msg),
  clearMessages: () => academy.clearChat(activeLesson.value.id),
  buildSystem: () => buildSystemPrompt(activeLesson.value, currentStep.value),
}))
const tutorFocusTitle = computed(() => currentStep.value?.title ?? i18n.tl(activeLesson.value.title))

const scrollHtml = computed(() => marked.parse(markdownSource.value, { async: false }) as string)
const stepHtml = computed(() => {
  const s = currentStep.value
  return s ? (marked.parse(s.body, { async: false }) as string) : ''
})
const readerHtml = computed(() =>
  editing.value
    ? marked.parse(draft.value, { async: false }) as string
    : effectiveMode.value === 'walk'
      ? stepHtml.value
      : scrollHtml.value,
)

const stepKindLabel: Record<StepKind, string> = {
  intro: '导言',
  goal: '目标',
  concept: '概念',
  practice: '动手',
  checklist: '自检',
  preview: '预告',
  resume: '续学',
  generic: '步骤',
}

const stepAiAction = computed<{ label: string; text: string } | null>(() => {
  const s = currentStep.value
  if (!s) return null
  if (s.kind === 'intro' || s.kind === 'preview' || s.kind === 'resume') return null
  const title = s.title
  switch (s.kind) {
    case 'goal':
      return { label: '带我看目标', text: '带我过一遍今日目标，确认我理解这课要做的事。' }
    case 'concept':
      return {
        label: i18n.t('academy.tutor.explain'),
        text: `用前端工程师能懂的类比，帮我理解「${title}」这一节的核心概念。`,
      }
    case 'practice':
      return {
        label: '陪我做练习',
        text: '陪我完成这一节的动手练习：我卡住时给提示，先别给完整答案。',
      }
    case 'checklist':
      return {
        label: i18n.t('academy.tutor.check'),
        text: '逐条带我过自检清单，每条先问我的理解再评判，最后告诉我是否可以进入下一课。',
      }
    default:
      return { label: i18n.t('academy.tutor.explain'), text: `帮我理解「${title}」这一节。` }
  }
})

const resumePrompt = computed(() => {
  const l = activeLesson.value
  return [
    '请担任我的 AI 应用开发教练（不主攻模型训练）。',
    '',
    '请先阅读（若可读仓库）：',
    '- docs/ai-learning/00-profile.md',
    '- docs/ai-learning/README.md',
    `- 今日课程：docs/ai-learning/days/${l.file}`,
    '',
    `今日计划：Day ${String(l.day).padStart(2, '0')} · ${l.title.zh}`,
    `可用时间：约 ${l.minutes} 分钟`,
    '',
    '请按日课文件的节奏教：目标 → 概念 → 动手 → 自检。不要提前讲后面的课。',
  ].join('\n')
})

const readerTitle = computed(() => {
  if (pane.value === 'readme') return i18n.t('academy.guide.readme')
  if (pane.value === 'profile') return i18n.t('academy.guide.profile')
  if (pane.value === 'resume') return i18n.t('academy.guide.resume')
  return i18n.tl(activeLesson.value.title)
})

function navigate(next: Pane, lessonId?: string) {
  editing.value = false
  documentStatus.value = 'idle'
  savedContent.value = null
  annotations.value = []
  closeSelectionToolbar()
  menuOpen.value = false
  void router.replace({ query: { ...route.query, s: lessonId ?? next } })
  if (lessonId) academy.openLesson(lessonId)
}

function onSelect(id: string) {
  if (GUIDE_IDS.includes(id)) navigate(id as Exclude<Pane, 'lesson'>)
  else navigate('lesson', id)
}

function goRelative(delta: number) {
  const idx = activeIndex.value + delta
  if (idx < 0 || idx >= lessons.length) return
  navigate('lesson', lessons[idx]!.id)
}

function setStep(i: number) {
  if (!stepCount.value) return
  const clamped = Math.min(Math.max(0, i), stepCount.value - 1)
  academy.setStep(activeLesson.value.id, clamped)
  nextTick(() => readerEl.value?.scrollTo({ top: 0 }))
}

function stepNext() {
  if (stepIdx.value < stepCount.value - 1) {
    setStep(stepIdx.value + 1)
  } else if (pane.value === 'lesson') {
    academy.markDone(activeLesson.value.id)
    if (hasNext.value) goRelative(1)
  }
}

function stepPrev() {
  if (stepIdx.value > 0) setStep(stepIdx.value - 1)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function lessonLabel(lesson: LessonMeta) {
  return `${pad2(lesson.day)} · ${i18n.tl(lesson.title)}`
}

const isLastStep = computed(() =>
  effectiveMode.value === 'walk' && stepCount.value > 0 && stepIdx.value >= stepCount.value - 1,
)

const footerPrev = computed<string | null>(() => {
  if (pane.value !== 'lesson') return null
  if (effectiveMode.value === 'walk' && stepCount.value && stepIdx.value > 0) {
    const s = steps.value[stepIdx.value - 1]
    return s ? `${pad2(stepIdx.value)} · ${stepKindLabel[s.kind]}` : null
  }
  const prevLesson = activeIndex.value > 0 ? lessons[activeIndex.value - 1] : null
  return prevLesson ? lessonLabel(prevLesson) : null
})

const footerNext = computed<string | null>(() => {
  if (pane.value !== 'lesson') return null
  if (effectiveMode.value === 'walk' && stepCount.value && !isLastStep.value) {
    const s = steps.value[stepIdx.value + 1]
    return s ? `${pad2(stepIdx.value + 2)} · ${stepKindLabel[s.kind]}` : null
  }
  const nextLesson = lessons[activeIndex.value + 1]
  return nextLesson ? lessonLabel(nextLesson) : null
})

function onFooterPrev() {
  if (effectiveMode.value === 'walk' && stepCount.value && stepIdx.value > 0) {
    stepPrev()
    return
  }
  goRelative(-1)
}

function onFooterNext() {
  if (effectiveMode.value === 'walk' && stepCount.value && !isLastStep.value) {
    stepNext()
    return
  }
  if (!academy.isDone(activeLesson.value.id)) academy.markDone(activeLesson.value.id)
  goRelative(1)
}

function askAi() {
  ui.toggleTutor(true)
  menuOpen.value = false
  const a = stepAiAction.value
  if (a) nextTick(() => tutorRef.value?.sendPrompt(a.text))
}

function openTutor() {
  ui.toggleTutor(true)
  menuOpen.value = false
}

async function copyResume() {
  try {
    await navigator.clipboard.writeText(resumePrompt.value)
    copied.value = true
    menuOpen.value = false
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copied.value = false
  }
}

function onDocClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t?.closest('.learn__more')) menuOpen.value = false
}

const COPY_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const CHECK_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

function applyAnnotations() {
  const el = readerEl.value
  if (!el || editing.value) return
  el.querySelectorAll('.learn__annotation').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''))
  })
  for (const annotation of annotations.value) {
    if (annotation.stale || !annotation.quote) continue
    if (!wrapAnnotation(el, annotation)) annotation.stale = true
  }
}

function enhanceDoc() {
  const el = readerEl.value
  if (!el) return

  el.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.learn__copy')) return
    const code = pre.querySelector('code')
    const rawText = code?.textContent ?? pre.textContent ?? ''
    const langMatch = code?.className?.match(/language-([\w+-]+)/)
    if (langMatch && langMatch[1]) {
      const tag = document.createElement('span')
      tag.className = 'learn__lang'
      tag.textContent = langMatch[1]
      pre.prepend(tag)
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'learn__copy'
    btn.setAttribute('aria-label', i18n.t('academy.copy'))
    btn.setAttribute('title', i18n.t('academy.copy'))
    btn.innerHTML = COPY_ICON
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawText)
        btn.innerHTML = CHECK_ICON
        btn.classList.add('learn__copy--done')
        window.setTimeout(() => {
          btn.innerHTML = COPY_ICON
          btn.classList.remove('learn__copy--done')
        }, 1500)
      } catch {
        /* clipboard unavailable */
      }
    })
    pre.appendChild(btn)
  })

  el.querySelectorAll('blockquote').forEach((bq) => {
    if (bq.classList.contains('callout')) return
    const strong = bq.querySelector('p > strong')
    const label = strong?.textContent ?? ''
    if (/(提示|小贴士|tip)/i.test(label)) bq.classList.add('callout', 'callout--tip')
    else if (/(警告|注意|warn)/i.test(label)) bq.classList.add('callout', 'callout--warn')
    else if (/(错误|危险|danger)/i.test(label)) bq.classList.add('callout', 'callout--danger')
  })
}

watch(readerHtml, () => {
  nextTick(() => {
    readerEl.value?.scrollTo({ top: 0 })
    enhanceDoc()
    applyAnnotations()
  })
})

onMounted(() => {
  document.addEventListener('click', onDocClick)
  nextTick(() => {
    enhanceDoc()
    applyAnnotations()
  })
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <ReaderShell
    back-to="/learn"
    :title="BOOK_TITLE"
    :done="academy.doneCount"
    :total="academy.totalCount"
    :groups="groups"
    @select="onSelect"
  >
    <template #tools>
      <div
        v-if="pane === 'lesson'"
        class="learn__mode"
        role="group"
        :aria-label="i18n.t('academy.mode.walk')"
      >
        <button
          type="button"
          class="learn__mode-btn"
          :class="{ 'learn__mode-btn--on': mode === 'walk' }"
          :aria-label="i18n.t('academy.mode.walkAria')"
          :title="i18n.t('academy.mode.walk')"
          @click="mode = 'walk'"
        >
          <PhFlowArrow :size="14" />
        </button>
        <button
          type="button"
          class="learn__mode-btn"
          :class="{ 'learn__mode-btn--on': mode === 'scroll' }"
          :aria-label="i18n.t('academy.mode.scrollAria')"
          :title="i18n.t('academy.mode.scroll')"
          @click="mode = 'scroll'"
        >
          <PhBookOpen :size="14" />
        </button>
      </div>

      <span
        v-if="pane === 'lesson' && effectiveMode === 'walk' && stepCount"
        class="learn__step-count"
      >
        {{ pad2(stepIdx + 1) }}<span class="learn__step-sep">/</span>{{ pad2(stepCount) }}
      </span>

      <button
        type="button"
        class="learn__icon-btn"
        :class="{ 'learn__icon-btn--on': ui.tutorOpen }"
        :aria-label="i18n.t('academy.tutor.open')"
        :title="i18n.t('academy.tutor.open')"
        @click="ui.toggleTutor()"
      >
        <PhSparkle :size="16" weight="fill" />
      </button>

      <div class="learn__more">
        <button
          type="button"
          class="learn__icon-btn"
          :aria-expanded="menuOpen"
          :aria-label="i18n.t('academy.more')"
          :title="i18n.t('academy.more')"
          @click.stop="menuOpen = !menuOpen"
        >
          <PhDotsThree :size="16" weight="bold" />
        </button>
        <div v-if="menuOpen" class="learn__menu" role="menu">
          <button v-if="editableDocument && !editing" type="button" role="menuitem" @click="startEditing">
            <PhPencilSimple :size="15" />
            编辑文档
          </button>
          <button v-if="editing" type="button" role="menuitem" @click="cancelEditing">
            <PhX :size="15" />
            退出编辑
          </button>
          <button type="button" role="menuitem" @click="copyResume">
            <PhClipboardText :size="15" />
            {{ copied ? i18n.t('academy.copied') : i18n.t('academy.copyResume') }}
          </button>
        </div>
      </div>
    </template>

    <div
      class="learn__workspace"
      :class="{ 'learn__workspace--dragging': dragging }"
      :style="{ '--tutor-w': `${ui.tutorW}px` }"
    >
      <section class="learn__stage">
      <div class="learn__reader-wrap">
        <div v-if="editing" class="learn__editor">
          <div class="learn__editor-head">
            <span>Markdown 编辑</span>
            <span class="learn__editor-status" :class="`learn__editor-status--${documentStatus}`">
              {{ documentStatus === 'saving' ? '保存中…' : documentStatus === 'saved' ? '已保存' : documentStatus === 'error' ? '保存失败，草稿仍保留' : '未保存' }}
            </span>
          </div>
          <div class="learn__editor-grid">
            <div class="learn__textarea-wrap">
              <textarea
                ref="editorEl"
                v-model="draft"
                class="learn__textarea"
                spellcheck="false"
                aria-label="Markdown 编辑器"
                @scroll="syncEditorScroll"
                @mouseup="captureMarkdownSelection"
                @keyup="captureMarkdownSelection"
              />
              <div
                v-if="editorSelectionToolbar && editing"
                class="learn__editor-selection-toolbar"
                :style="{ left: `${editorSelectionToolbar.x}px`, top: `${editorSelectionToolbar.y}px` }"
                @mousedown.prevent
              >
                <button type="button" title="AI 编辑选中内容" @click.stop="requestAiEditFromSelection">
                  <PhSparkle :size="15" weight="fill" />
                </button>
              </div>
            </div>
            <article ref="previewEl" class="learn__reader learn__editor-preview" @scroll="syncPreviewScroll" v-html="readerHtml" />
          </div>
          <div class="learn__editor-actions">
            <button type="button" class="learn__bar-btn learn__bar-btn--ghost" @click="restoreDocument">
              <PhArrowCounterClockwise :size="15" />
              恢复仓库版本
            </button>
            <button type="button" class="learn__bar-btn learn__bar-btn--primary" :disabled="savingDocument" @click="saveDocument">
              <PhFloppyDisk :size="15" />
              {{ savingDocument ? '保存中…' : '保存文档' }}
            </button>
          </div>
        </div>
        <div
          v-else
          ref="readerEl"
          class="learn__scroller"
        >
          <header class="learn__doc-head" :class="{ 'learn__doc-head--walk': effectiveMode === 'walk' }">
            <p class="learn__doc-kicker">
              <template v-if="pane === 'lesson'">Day {{ pad2(activeLesson.day) }}</template>
              <template v-else>{{ i18n.t('academy.guideLabel') }}</template>
            </p>
            <h1 class="learn__doc-title">{{ readerTitle }}</h1>
          </header>
          <article
            class="learn__reader"
            :class="{ 'learn__reader--walk': effectiveMode === 'walk' }"
            @mouseup="onReaderSelection"
            @mousedown="resetSelectionToolbar"
            v-html="readerHtml"
          />
        </div>
        <div
          v-if="selectionToolbar && !editing"
          class="learn__selection-toolbar"
          :style="{ left: `${selectionToolbar.x}px`, top: `${selectionToolbar.y}px` }"
          role="toolbar"
          aria-label="选中文本工具"
          @mousedown="keepSelection"
        >
          <div class="learn__color-action">
            <button type="button" title="标注颜色" @click.stop="openColorMenu">
              <PhHighlighter :size="15" />
            </button>
            <div v-if="colorMenuOpen" class="learn__color-menu" role="menu">
              <button
                v-for="color in annotationColors"
                :key="color.value"
                type="button"
                role="menuitem"
                :class="`learn__color-swatch learn__color-swatch--${color.value}`"
                :title="color.label"
                @click.stop="annotate(color.value)"
              />
            </div>
          </div>
          <button type="button" title="复制" @click.stop="copySelection"><PhCopy :size="15" /></button>
          <button type="button" title="AI 解释" @click.stop="askAiAboutSelection"><PhChatText :size="15" /></button>
        </div>
        <div
          v-if="aiEditOpen"
          class="learn__ai-edit-panel"
          :style="{ left: `${aiEditPosition.x}px`, top: `${aiEditPosition.y}px` }"
        >
          <div class="learn__ai-edit-head" @pointerdown="startAiEditDrag">
            <strong>AI 编辑 Markdown</strong>
            <button type="button" class="learn__ai-edit-close" aria-label="关闭" @click="closeAiEditor"><PhX :size="16" /></button>
          </div>
          <p class="learn__ai-edit-quote">{{ aiEditSelection }}</p>
          <textarea v-model="aiEditInstruction" class="learn__ai-edit-input" placeholder="例如：改写得更适合初学者，保留 Markdown 结构" />
          <button type="button" class="learn__bar-btn learn__bar-btn--primary" :disabled="aiEditLoading" @click="requestAiEdit">
            <PhSparkle :size="15" weight="fill" />
            {{ aiEditLoading ? '生成中…' : '生成修改建议' }}
          </button>
          <p v-if="aiEditError" class="learn__ai-edit-error">{{ aiEditError }}</p>
          <div v-if="aiEditResult" class="learn__ai-edit-result">{{ aiEditResult }}</div>
          <div v-if="aiEditResult" class="learn__ai-edit-actions">
            <button type="button" class="learn__bar-btn learn__bar-btn--ghost" @click="insertAiResult">插入结果</button>
            <button type="button" class="learn__bar-btn learn__bar-btn--primary" @click="replaceAiSelection">替换原文</button>
          </div>
        </div>
      </div>

      <footer v-if="editing" class="learn__bar learn__bar--editing">
        <button type="button" class="learn__bar-btn learn__bar-btn--ghost" @click="cancelEditing">
          <PhX :size="15" />
          取消编辑
        </button>
      </footer>
      <div v-else-if="pane === 'lesson'" class="learn__foot">
        <ReaderFooter
          :done="isDone"
          :prev="footerPrev"
          :next="footerNext"
          @toggle="academy.toggleDone(activeLesson.id)"
          @prev="onFooterPrev"
          @next="onFooterNext"
        />
      </div>
      <footer v-else class="learn__bar">
        <button type="button" class="learn__bar-btn learn__bar-btn--ghost" @click="onSelect(activeLesson.id)">
          <PhBookOpen :size="15" />
          {{ i18n.t('academy.backLesson') }}
        </button>
      </footer>
    </section>

      <ResizeGutter
        v-if="ui.tutorOpen"
        class="learn__gutter learn__gutter--tutor"
        :min="TUTOR_MIN"
        :max="TUTOR_MAX"
        :value="ui.tutorW"
        reverse
        @resize="ui.setTutorW"
        @dragstart="dragging = true"
        @dragend="dragging = false"
      />

      <AiTutor
        v-show="ui.tutorOpen"
        ref="tutorRef"
        :adapter="tutorAdapter"
        :chat-key="activeLesson.id"
        :focus-title="tutorFocusTitle"
        :open="ui.tutorOpen"
        @close="ui.toggleTutor(false)"
      />
    </div>
  </ReaderShell>
</template>

<style scoped lang="scss">
/* ---------- Workspace (inside ReaderShell body) ---------- */
.learn__workspace {
  flex: 1 1 auto;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.learn__workspace > .tutor {
  flex: 0 0 var(--tutor-w, 360px);
  min-width: 0;
  transition: flex-basis 0.24s ease;
}

.learn__workspace--dragging > .tutor {
  transition: none;
}

/* ---------- Gutters ---------- */
.learn__gutter {
  background: transparent;
}

/* ---------- Stage ---------- */
.learn__stage {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
  background: var(--color-bg);
}

.learn__mode {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
}

.learn__mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.learn__mode-btn--on {
  background: var(--color-bg);
  color: var(--color-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.learn__step-count {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  margin-right: 0.2rem;
}

.learn__step-sep {
  margin: 0 0.15rem;
  opacity: 0.4;
}

.learn__icon-btn {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.learn__icon-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.learn__icon-btn--on {
  color: var(--color-accent);
  border-color: transparent;
  background: var(--color-accent-soft);
}

.learn__more {
  position: relative;
}

.learn__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 188px;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
}

.learn__menu button {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
}

.learn__menu button:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

/* ---------- Reader ---------- */
.learn__reader-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
}

.learn__scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.learn__scroller::-webkit-scrollbar {
  display: none;
}

.learn__doc-head {
  max-width: 48rem;
  margin: 0 auto;
  padding: 40px clamp(var(--space-4), 5vw, var(--space-8)) 6px;
}

.learn__doc-head--walk {
  max-width: 42rem;
}

.learn__doc-kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.learn__doc-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.learn__reader {
  max-width: 48rem;
  width: 100%;
  margin: 0 auto;
  padding: 8px clamp(var(--space-4), 5vw, var(--space-8)) var(--space-12);
  box-sizing: border-box;
}

.learn__editor {
  display: flex;
  flex-direction: column;
  width: min(100%, 76rem);
  min-height: 0;
  flex: 1;
  padding: var(--space-4) clamp(var(--space-4), 4vw, var(--space-8));
  gap: var(--space-3);
}

.learn__editor-head,
.learn__editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-shrink: 0;
}

.learn__editor-head {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.learn__editor-status--saved { color: var(--color-accent); }
.learn__editor-status--error { color: #dc2626; }

.learn__editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-3);
  min-height: 0;
  flex: 1;
}

.learn__textarea {
  min-width: 0;
  min-height: 18rem;
  resize: none;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font: 0.84rem/1.7 var(--font-mono);
  outline: none;
}

.learn__textarea:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

.learn__editor-preview {
  min-width: 0;
  max-width: none;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.learn__selection-toolbar,
.learn__editor-selection-toolbar {
  position: fixed;
  z-index: 80;
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.learn__editor-selection-toolbar {
  z-index: 85;
  position: fixed;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.learn__color-action { position: relative; }
.learn__color-menu {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  display: flex;
  gap: 5px;
  padding: 6px;
  transform: translateX(-50%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}
.learn__color-swatch {
  width: 18px !important;
  height: 18px !important;
  border: 2px solid var(--color-bg) !important;
  border-radius: 50% !important;
  box-shadow: 0 0 0 1px var(--color-border);
}
.learn__color-swatch--yellow { background: #facc15 !important; }
.learn__color-swatch--green { background: #5eead4 !important; }
.learn__color-swatch--blue { background: #60a5fa !important; }
.learn__color-swatch--pink { background: #f9a8d4 !important; }
.learn__color-swatch--purple { background: #c4b5fd !important; }

.learn__textarea-wrap { position: relative; min-height: 0; display: flex; flex: 1; flex-direction: column; }
.learn__ai-edit-panel {
  position: fixed;
  z-index: 90;
  display: flex;
  width: min(360px, calc(100vw - 24px));
  max-height: min(520px, calc(100vh - 24px));
  flex-direction: column;
  gap: var(--space-2);
  overflow: auto;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.2);
}
.learn__ai-edit-head, .learn__ai-edit-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.learn__ai-edit-head { cursor: move; user-select: none; }
.learn__ai-edit-close { border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.learn__ai-edit-quote, .learn__ai-edit-result { max-height: 8rem; overflow: auto; margin: 0; padding: var(--space-2); border-radius: var(--radius-sm); background: var(--color-surface); white-space: pre-wrap; font: 0.78rem/1.5 var(--font-mono); }
.learn__ai-edit-input { min-height: 4.5rem; resize: vertical; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); }
.learn__ai-edit-error { margin: 0; color: #dc2626; font-size: 0.78rem; }

.learn__editor-grid > * { min-height: 0; }
.learn__textarea { height: 100%; min-height: 0; flex: 1; }
.learn__editor-preview { height: 100%; box-sizing: border-box; }

.learn__selection-toolbar button,
.learn__editor-selection-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.learn__selection-toolbar button:hover,
.learn__editor-selection-toolbar button:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.learn__selection-toolbar > button:first-of-type { color: var(--color-accent); }

.learn__reader :deep(.learn__annotation--yellow) { background: rgba(250, 204, 21, 0.38); }
.learn__reader :deep(.learn__annotation--green) { background: rgba(94, 234, 212, 0.3); }
.learn__reader :deep(.learn__annotation--blue) { background: rgba(96, 165, 250, 0.3); }
.learn__reader :deep(.learn__annotation--pink) { background: rgba(249, 168, 212, 0.34); }
.learn__reader :deep(.learn__annotation--purple) { background: rgba(196, 181, 253, 0.36); }
.learn__reader :deep(.learn__annotation) { padding: 0.05em 0.12em; border-radius: 0.2em; color: inherit; }

/* ---------- Footer ---------- */

.learn__foot {
  flex-shrink: 0;
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
  padding: 8px clamp(var(--space-4), 5vw, var(--space-8)) 44px;
  box-sizing: border-box;
}

.learn__reader--walk {
  max-width: 42rem;
}

.learn__reader :deep(h1) {
  display: none;
}

.learn__reader :deep(h2),
.learn__reader :deep(h3) {
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin: 1.8em 0 0.6em;
}

.learn__reader :deep(h2) {
  font-size: 1.1rem;
  font-weight: 650;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--color-border);
}

.learn__reader :deep(h2:first-child) {
  margin-top: 0;
}

.learn__reader :deep(h3) {
  font-size: 0.98rem;
  font-weight: 600;
}

.learn__reader :deep(p),
.learn__reader :deep(li) {
  font-size: 0.92rem;
  line-height: 1.75;
}

.learn__reader :deep(p) {
  margin: 0 0 1.1em;
}

.learn__reader :deep(ul),
.learn__reader :deep(ol) {
  padding-left: 1.2rem;
  margin: 0 0 1.1em;
}

.learn__reader :deep(li) {
  margin: 0.25em 0;
}

.learn__reader :deep(li::marker) {
  color: var(--color-text-muted);
}

.learn__reader :deep(blockquote) {
  margin: 1.2rem 0;
  padding: 0.5rem 0.9rem;
  border-left: 2px solid var(--color-border);
  color: var(--color-text-muted);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.learn__reader :deep(blockquote.callout) {
  padding: 0.7rem 0.95rem;
  border-left-width: 3px;
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--color-text);
}

.learn__reader :deep(blockquote.callout--tip) {
  border-left-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.learn__reader :deep(blockquote.callout--warn) {
  border-left-color: #d97706;
  background: rgba(217, 119, 6, 0.08);
}

.learn__reader :deep(blockquote.callout--danger) {
  border-left-color: #dc2626;
  background: rgba(220, 38, 38, 0.07);
}

.learn__reader :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.learn__reader :deep(pre) {
  position: relative;
  overflow: auto;
  padding: var(--space-4);
  padding-top: calc(var(--space-4) + 4px);
  margin: 1.2rem 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  transition: border-color 0.15s;
}

.learn__reader :deep(pre:hover) {
  border-color: var(--color-border-strong);
}

.learn__reader :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 0.8rem;
  line-height: 1.6;
}

.learn__reader :deep(.learn__lang) {
  position: absolute;
  top: 6px;
  left: 10px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  text-transform: lowercase;
  color: var(--color-text-muted);
  opacity: 0.6;
  pointer-events: none;
}

.learn__reader :deep(.learn__copy) {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
}

.learn__reader :deep(pre:hover .learn__copy) {
  opacity: 1;
}

.learn__reader :deep(.learn__copy:hover) {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.learn__reader :deep(.learn__copy--done) {
  color: var(--color-accent);
  border-color: var(--color-accent);
  opacity: 1;
}

.learn__reader :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  margin: 1.2rem 0;
}

.learn__reader :deep(th),
.learn__reader :deep(td) {
  border: 1px solid var(--color-border);
  padding: 0.45rem 0.65rem;
  text-align: left;
  vertical-align: top;
}

.learn__reader :deep(th) {
  background: var(--color-surface);
  font-weight: 600;
}

.learn__reader :deep(a) {
  color: var(--color-accent-strong);
  text-decoration: none;
  border-bottom: 1px solid currentColor;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.learn__reader :deep(a:hover) {
  opacity: 1;
}

.learn__reader :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 1.2rem 0;
}

.learn__reader :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 2rem 0;
}

.learn__reader :deep(.learn__annotation) {
  padding: 0.05em 0.12em;
  border-radius: 0.2em;
  color: inherit;
}

.learn__reader :deep(.learn__annotation--yellow) { background: rgba(250, 204, 21, 0.38); }
.learn__reader :deep(.learn__annotation--green) { background: rgba(74, 222, 128, 0.3); }
.learn__reader :deep(.learn__annotation--blue) { background: rgba(96, 165, 250, 0.3); }
.learn__reader :deep(.learn__annotation--pink) { background: rgba(244, 114, 182, 0.3); }
.learn__reader :deep(.learn__annotation--purple) { background: rgba(192, 132, 252, 0.3); }

/* ---------- Footer ---------- */
.learn__bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 60px;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-border);
  background: var(--color-bg);
  flex-shrink: 0;
}

.learn__bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0 0.95rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 0.82rem;
  cursor: pointer;
  transition:
    transform 0.1s,
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.learn__bar-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.learn__bar-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.learn__bar-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.learn__bar-btn--primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 600;
  min-width: 9rem;
}

.learn__bar-btn--primary:hover:not(:disabled) {
  background: var(--color-accent-strong);
  border-color: var(--color-accent-strong);
  color: var(--color-on-accent);
}

.learn__bar-btn--ghost {
  color: var(--color-text-muted);
}

.learn__bar-btn--done {
  color: var(--color-accent);
  border-color: transparent;
  background: var(--color-accent-soft);
}

.learn__bar-btn--ai:hover:not(:disabled) {
  background: var(--color-accent-soft);
}

/* ---------- Mobile ---------- */
@media (max-width: 900px) {
  .learn__gutter {
    display: none;
  }

  .learn__workspace {
    display: block;
  }

  .learn__workspace > .tutor {
    flex: none;
    width: auto;
  }

  .learn__step-count {
    display: none;
  }

  .learn__doc-head {
    padding-top: var(--space-5);
  }

  .learn__reader {
    padding: var(--space-2) var(--space-4) var(--space-8);
    max-width: none;
  }

  .learn__foot {
    max-width: none;
    padding: 8px var(--space-4) 28px;
  }

  .learn__editor {
    padding: var(--space-3) var(--space-4);
  }

  .learn__editor-grid {
    grid-template-columns: 1fr;
  }

  .learn__editor-preview {
    min-height: 16rem;
  }

  .learn__selection-toolbar {
    position: fixed;
    left: 0 !important;
    right: 0;
    top: auto !important;
    bottom: calc(60px + env(safe-area-inset-bottom));
    justify-content: center;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .learn__bar {
    flex-wrap: wrap;
  }

  .learn__bar-btn--ghost:first-child {
    order: 2;
  }

  .learn__bar-btn--primary {
    order: 1;
    flex: 1 1 100%;
  }

  .learn__bar-btn--ghost:last-child {
    order: 3;
  }
}

@media (max-width: 640px) {
  .learn__mode-btn {
    width: 26px;
    height: 24px;
  }
}
</style>
