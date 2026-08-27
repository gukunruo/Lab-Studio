import { nextTick, ref } from 'vue'

export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

export interface Annotation {
  id: string
  quote: string
  prefix?: string
  suffix?: string
  color: AnnotationColor
  createdAt: string
  updatedAt?: string
  stale?: boolean
}

export const ANNOTATION_COLORS: Array<{ value: AnnotationColor; label: string }> = [
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'pink', label: '粉色' },
  { value: 'purple', label: '紫色' },
]

const MARK_CLASS = 'learn__annotation'

function isValidAnnotation(item: unknown): item is Annotation {
  if (!item || typeof item !== 'object') return false
  const value = item as Record<string, unknown>
  return typeof value.id === 'string' && typeof value.quote === 'string'
    && ANNOTATION_COLORS.some((c) => c.value === value.color)
}

export async function fetchAnnotations(docId: string): Promise<Annotation[]> {
  try {
    const res = await fetch(`/api/lesson-annotations/${encodeURIComponent(docId)}`, { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json() as { annotations?: unknown[] }
    return Array.isArray(data.annotations) ? data.annotations.filter(isValidAnnotation) : []
  } catch {
    return []
  }
}

export async function putAnnotations(docId: string, list: Annotation[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/lesson-annotations/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: list }),
    })
    return res.ok
  } catch {
    return false
  }
}

function selectionTextNodes(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest(`pre, .${MARK_CLASS}`)) continue
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
    mark.className = `${MARK_CLASS} ${MARK_CLASS}--${annotation.color}`
    mark.title = `标注颜色：${ANNOTATION_COLORS.find((item) => item.value === annotation.color)?.label ?? ''}`

    const range = document.createRange()
    range.setStart(node, segmentStart - nodeStart)
    range.setEnd(node, segmentEnd - nodeStart)
    range.surroundContents(mark)
    wrapped = true
  }

  return wrapped
}

export function applyReaderAnnotations(root: HTMLElement | null, list: Annotation[]) {
  if (!root) return
  root.querySelectorAll(`.${MARK_CLASS}`).forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ''))
  })
  for (const annotation of list) {
    if (annotation.stale || !annotation.quote) continue
    if (!wrapAnnotation(root, annotation)) annotation.stale = true
  }
}

export interface SelectionPopup {
  text: string
  x: number
  y: number
}

export function useTextAnnotations(options: {
  docId: () => string
  rootEl: () => HTMLElement | null
  enabled: () => boolean
  sourceText: () => string
}) {
  const annotations = ref<Annotation[]>([])
  const popup = ref<SelectionPopup | null>(null)
  const selectedText = ref('')
  const saving = ref(false)

  function load() {
    const docId = options.docId()
    void fetchAnnotations(docId).then((list) => {
      if (options.docId() !== docId) return
      annotations.value = list
      void nextTick(() => applyReaderAnnotations(options.rootEl(), annotations.value))
    })
  }

  function closePopup() {
    popup.value = null
    selectedText.value = ''
  }

  function onReaderSelection() {
    if (!options.enabled()) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!selection || selection.rangeCount === 0 || text.length < 2 || !options.rootEl()?.contains(selection.anchorNode)) {
      closePopup()
      return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    selectedText.value = text
    popup.value = {
      text,
      x: Math.min(Math.max(12, rect.left + rect.width / 2 - 120), window.innerWidth - 252),
      y: Math.max(12, rect.top - 48),
    }
  }

  function resetSelectionToolbar() {
    window.setTimeout(() => {
      const selection = window.getSelection()
      if (!selection?.toString().trim()) closePopup()
    }, 0)
  }

  function selectionContext(text: string) {
    const source = options.sourceText()
    const index = source.indexOf(text)
    if (index < 0) return { prefix: '', suffix: '' }
    return {
      prefix: source.slice(Math.max(0, index - 40), index),
      suffix: source.slice(index + text.length, index + text.length + 40),
    }
  }

  function save(next: Annotation[]) {
    saving.value = true
    void putAnnotations(options.docId(), next)
      .then((ok) => {
        if (ok) {
          annotations.value = next
          void nextTick(() => applyReaderAnnotations(options.rootEl(), annotations.value))
        }
      })
      .finally(() => {
        saving.value = false
      })
  }

  function annotate(color: AnnotationColor) {
    if (!selectedText.value || saving.value) return
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
    save(next)
    closePopup()
  }

  function copySelection() {
    if (!selectedText.value) return
    void navigator.clipboard.writeText(selectedText.value)
    closePopup()
  }

  function reset() {
    annotations.value = []
    closePopup()
  }

  return {
    annotations,
    popup,
    selectedText,
    saving,
    load,
    onReaderSelection,
    resetSelectionToolbar,
    annotate,
    closePopup,
    copySelection,
    reset,
  }
}
