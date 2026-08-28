<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import { PhBookOpen, PhSparkle } from '@phosphor-icons/vue'
import {
  buildCcSystemPrompt,
  ccChapterById,
  ccChapterSource,
  ccChapters,
  ccChaptersByGroup,
  ccCourseMeta,
  ccIntro,
  ccNextChapter,
} from '@/learn/cc-curriculum'
import { createLocalChatStore, type TutorAdapter } from '@/learn/ai'
import { useTextAnnotations } from '@/learn/annotations'
import { enhanceReaderDoc } from '@/learn/reader-enhance'
import { applyReaderAnnotations } from '@/learn/annotations'
import { labIdForChapter } from '@/learn/cc-lab'
import { CHAPTER_VIZ } from '@/components/cc/viz'
import { defineAsyncComponent } from 'vue'
import { useCcCourseStore } from '@/stores/cc-course'
import { useLocaleStore } from '@/stores/locale'
import { useUiStore, TUTOR_MIN, TUTOR_MAX } from '@/stores/ui'
import AiTutor from '@/components/AiTutor.vue'
import ResizeGutter from '@/components/ResizeGutter.vue'
import ReaderShell from '@/components/reader/ReaderShell.vue'
import ReaderFooter from '@/components/reader/ReaderFooter.vue'
import SelectionToolbar from '@/components/reader/SelectionToolbar.vue'

const i18n = useLocaleStore()
const route = useRoute()
const router = useRouter()
const store = useCcCourseStore()
const ui = useUiStore()

const scrollEl = ref<HTMLElement | null>(null)
const proseEl = ref<HTMLElement | null>(null)
const tutorRef = ref<{ sendPrompt: (t: string) => void; quote: (t: string) => void } | null>(null)
const dragging = ref(false)
const activeTab = ref<'learn' | 'simulate' | 'code' | 'deep'>('learn')

const AgentLoopSimulator = defineAsyncComponent(
  () => import('@/components/cc/AgentLoopSimulator.vue'),
)

const TABS = [
  { id: 'learn', label: '学习' },
  { id: 'simulate', label: '模拟' },
  { id: 'code', label: '源码' },
  { id: 'deep', label: '深入探索' },
] as const

function switchTab(tab: string) {
  activeTab.value = tab as typeof activeTab.value
  if (tab !== 'learn') ann.closePopup()
}

const labId = computed(() => labIdForChapter(activeId.value))

const activeId = computed(() => {
  const requested = String(route.query.s ?? '')
  return ccChapterById(requested) ? requested : store.lastOpened ?? ccIntro.id
})
const activeChapter = computed(() => ccChapterById(activeId.value) ?? ccIntro)
const heroViz = computed(() => {
  const lab = labIdForChapter(activeId.value)
  return lab ? CHAPTER_VIZ[lab] : undefined
})
const html = computed(() =>
  marked.parse(ccChapterSource(activeChapter.value).replace(/^# .+\n/, ''), { async: false }) as string)

const ccChats = createLocalChatStore('lab-cc-course-chats')
const tutorAdapter = computed<TutorAdapter>(() => ({
  getMessages: () => ccChats.get(activeId.value),
  addMessage: (msg) => ccChats.add(activeId.value, msg),
  clearMessages: () => ccChats.clear(activeId.value),
  buildSystem: () => buildCcSystemPrompt(activeChapter.value),
}))

const ann = useTextAnnotations({
  docId: () => activeId.value,
  rootEl: () => proseEl.value,
  enabled: () => true,
  sourceText: () => ccChapterSource(activeChapter.value),
})
const annPopup = ann.popup

function askAiAboutSelection() {
  if (!ann.selectedText.value) return
  const quote = ann.selectedText.value
  ann.closePopup()
  ui.toggleTutor(true)
  nextTick(() => tutorRef.value?.quote(quote))
}

function enhanceReader() {
  enhanceReaderDoc(proseEl.value, i18n.t('academy.copy'))
  applyReaderAnnotations(proseEl.value, ann.annotations.value)
}

const fullSequence = [ccIntro, ...ccChapters]
const next = computed(() => ccNextChapter(activeId.value))
const prev = computed(() => {
  const idx = fullSequence.findIndex((c) => c.id === activeId.value)
  return idx > 0 ? fullSequence[idx - 1] : null
})

const groups = computed(() =>
  ccChaptersByGroup().map(({ group, chapters }) => ({
    id: group.id,
    title: group.title,
    items: chapters.map((chapter) => ({
      id: chapter.id,
      badge: chapter.id,
      label: i18n.tl(chapter.title),
      done: store.isDone(chapter.id),
      active: chapter.id === activeId.value,
    })),
  })),
)

function selectChapter(id: string) {
  void router.replace({ query: { ...route.query, s: id } })
  store.openChapter(id)
}

function goNext() {
  if (next.value) {
    if (!store.isDone(activeId.value)) store.toggleDone(activeId.value)
    selectChapter(next.value.id)
  }
}

watch(activeId, () => {
  ann.load()
})

watch(html, () => {
  nextTick(() => {
    scrollEl.value?.scrollTo({ top: 0 })
    enhanceReader()
  })
})

onMounted(() => {
  store.openChapter(activeId.value)
  ann.load()
  nextTick(enhanceReader)
})
</script>

<template>
  <ReaderShell
    back-to="/learn"
    :title="ccCourseMeta.title"
    :done="store.doneCount"
    :total="store.totalCount"
    :groups="groups"
    @select="selectChapter"
  >
    <template #tools>
      <button
        type="button"
        class="cc__icon-btn"
        :class="{ 'cc__icon-btn--on': ui.tutorOpen }"
        :aria-label="i18n.t('academy.tutor.open')"
        :title="i18n.t('academy.tutor.open')"
        @click="ui.toggleTutor()"
      >
        <PhSparkle :size="16" weight="fill" />
      </button>
    </template>

    <div
      class="cc__workspace"
      :class="{ 'cc__workspace--dragging': dragging }"
      :style="{ '--tutor-w': `${ui.tutorW}px` }"
    >
      <article ref="scrollEl" class="cc__reader">
        <header class="cc__reader-head">
          <p class="cc__kicker">
            <PhBookOpen :size="13" />
            <span>{{ i18n.tl(ccCourseMeta.title) }}</span>
          </p>
          <h1 class="cc__chapter-title">
            <span class="cc__badge">{{ activeChapter.id }}</span>
            {{ i18n.tl(activeChapter.title) }}
          </h1>
        </header>

        <div v-if="heroViz" class="cc-viz-hero">
          <component :is="heroViz" />
        </div>

        <nav class="cc-tabs">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            type="button"
            class="cc-tab"
            :class="{ 'cc-tab--on': activeTab === tab.id }"
            @click="switchTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </nav>

        <div
          v-show="activeTab === 'learn'"
          ref="proseEl"
          class="cc__prose"
          @mouseup="ann.onReaderSelection"
          @mousedown="ann.resetSelectionToolbar"
          v-html="html"
        />

        <div v-show="activeTab === 'simulate'" class="cc__panel">
          <div class="cc__panel-inner">
            <AgentLoopSimulator
              v-if="labId"
              :key="labId"
              :lab-id="labId"
            />
            <div v-else class="cc__panel-na">该章节暂无模拟内容。</div>
          </div>
        </div>

        <div v-show="activeTab === 'code'" class="cc__panel">
          <div class="cc__panel-inner">
            <div v-if="!labId" class="cc__panel-na">该章节暂无源码内容。</div>
          </div>
        </div>

        <div v-show="activeTab === 'deep'" class="cc__panel">
          <div class="cc__panel-inner">
            <div v-if="!labId" class="cc__panel-na">该章节暂无深入探索内容。</div>
          </div>
        </div>

        <div class="cc__foot-wrap">
          <ReaderFooter
            :done="store.isDone(activeId)"
            :prev="prev ? `${prev.id} · ${i18n.tl(prev.title)}` : null"
            :next="next ? `${next.id} · ${i18n.tl(next.title)}` : null"
            @toggle="store.toggleDone(activeId)"
            @prev="prev && selectChapter(prev.id)"
            @next="goNext"
          />
        </div>
      </article>

      <ResizeGutter
        v-if="ui.tutorOpen"
        class="cc__gutter"
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
        :chat-key="activeId"
        :focus-title="i18n.tl(activeChapter.title)"
        :open="ui.tutorOpen"
        @close="ui.toggleTutor(false)"
      />

      <SelectionToolbar
        v-if="annPopup"
        :x="annPopup.x"
        :y="annPopup.y"
        @annotate="ann.annotate"
        @copy="ann.copySelection"
        @explain="askAiAboutSelection"
      />
    </div>
  </ReaderShell>
</template>

<style scoped lang="scss">
.cc__workspace {
  flex: 1 1 auto;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.cc__workspace > .tutor {
  flex: 0 0 var(--tutor-w, 380px);
  min-width: 0;
  transition: flex-basis 0.24s ease;
}

.cc__workspace--dragging > .tutor {
  transition: none;
}

.cc__gutter {
  background: transparent;
}

.cc__icon-btn {
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

.cc__icon-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.cc__icon-btn--on {
  color: var(--color-accent);
  border-color: transparent;
  background: var(--color-accent-soft);
}

.cc__reader {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.cc__reader-head {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 28px 6px;
}

.cc__kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.cc__chapter-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.cc__badge {
  flex-shrink: 0;
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-muted);
}

.cc__prose {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 28px 32px;
  font-size: 14.5px;
  line-height: 1.75;
}

.cc__prose :deep(h1) {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 28px 0 12px;
}

.cc__prose :deep(h2) {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 30px 0 10px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border-subtle);
}

.cc__prose :deep(h3) {
  font-size: 15.5px;
  font-weight: 650;
  margin: 22px 0 8px;
}

.cc__prose :deep(h4) {
  font-size: 14px;
  font-weight: 650;
  margin: 18px 0 6px;
}

.cc__prose :deep(p) {
  margin: 10px 0;
}

.cc__prose :deep(a) {
  color: var(--color-accent-strong);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cc__prose :deep(strong) {
  font-weight: 650;
}

.cc__prose :deep(ul),
.cc__prose :deep(ol) {
  margin: 10px 0;
  padding-left: 22px;
}

.cc__prose :deep(li) {
  margin: 4px 0;
}

.cc__prose :deep(blockquote) {
  margin: 14px 0;
  padding: 2px 14px;
  border-left: 3px solid var(--color-accent);
  background: var(--color-accent-soft);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-muted);
}

.cc__prose :deep(blockquote p) {
  margin: 8px 0;
}

.cc__prose :deep(blockquote.callout) {
  color: var(--color-text);
}

.cc__prose :deep(blockquote.callout--warn) {
  border-left-color: #d97706;
  background: rgba(217, 119, 6, 0.08);
}

.cc__prose :deep(blockquote.callout--danger) {
  border-left-color: #dc2626;
  background: rgba(220, 38, 38, 0.07);
}

.cc__prose :deep(code) {
  font-family: var(--font-mono);
  font-size: 12.5px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 1px 5px;
}

.cc__prose :deep(pre) {
  margin: 14px 0;
  padding: 14px 16px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  overflow-x: auto;
}

.cc__prose :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 12.5px;
  line-height: 1.6;
}

.cc__prose :deep(table) {
  width: 100%;
  margin: 14px 0;
  border-collapse: collapse;
  font-size: 13px;
}

.cc__prose :deep(th),
.cc__prose :deep(td) {
  border: 1px solid var(--color-border-subtle);
  padding: 7px 10px;
  text-align: left;
}

.cc__prose :deep(th) {
  background: var(--color-surface-2);
  font-weight: 650;
}

.cc__prose :deep(img) {
  display: block;
  max-width: 100%;
  margin: 16px auto;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
}

.cc__prose :deep(hr) {
  margin: 26px 0;
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
}

.cc-viz-hero {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 28px 4px;
}

.cc-viz-hero > * {
  margin: 0;
}

.cc-tabs {
  max-width: 760px;
  margin: 0 auto;
  padding: 6px 28px 0;
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.cc-tab {
  position: relative;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  font-size: 13.5px;
  font-weight: 550;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.15s;
}

.cc-tab:hover {
  color: var(--color-text);
}

.cc-tab--on {
  color: var(--color-accent-strong);
}

.cc-tab--on::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--color-accent-strong);
}

.cc__panel {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px 28px 32px;
}

.cc__panel-na {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc__foot-wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 28px 48px;
}

@media (max-width: 900px) {
  .cc__gutter {
    display: none;
  }

  .cc__workspace {
    display: block;
  }

  .cc__workspace > .tutor {
    flex: none;
    width: auto;
  }
}

@media (max-width: 720px) {
  .cc__reader-head,
  .cc__prose,
  .cc__foot-wrap {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>
