<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import {
  PhArrowLeft,
  PhArrowRight,
  PhCheckCircle,
  PhCircle,
  PhBookOpen,
} from '@phosphor-icons/vue'
import {
  ccChapterById,
  ccChapterSource,
  ccChaptersByGroup,
  ccCourseMeta,
  ccIntro,
  ccNextChapter,
} from '@/learn/cc-curriculum'
import { useCcCourseStore } from '@/stores/cc-course'
import { useLocaleStore } from '@/stores/locale'

const i18n = useLocaleStore()
const route = useRoute()
const router = useRouter()
const store = useCcCourseStore()

const groups = ccChaptersByGroup()
const scrollEl = ref<HTMLElement | null>(null)

const activeId = computed(() => {
  const requested = String(route.query.s ?? '')
  return ccChapterById(requested) ? requested : store.lastOpened ?? ccIntro.id
})
const activeChapter = computed(() => ccChapterById(activeId.value) ?? ccIntro)
const html = computed(() =>
  marked.parse(ccChapterSource(activeChapter.value).replace(/^# .+\n/, ''), { async: false }) as string)
const next = computed(() => ccNextChapter(activeId.value))

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
  scrollEl.value?.scrollTo({ top: 0 })
})

onMounted(() => {
  store.openChapter(activeId.value)
})
</script>

<template>
  <div class="cc">
    <aside class="cc__side">
      <div class="cc__side-head">
        <RouterLink to="/learn" class="cc__brand" aria-label="返回课程中心" title="返回课程中心">
          <PhArrowLeft :size="16" />
        </RouterLink>
        <div class="cc__side-head-inner">
          <p class="cc__course-title">{{ i18n.tl(ccCourseMeta.title) }}</p>
          <div class="cc__progress">
            <span class="cc__progress-num">{{ store.doneCount }}</span>
            <span class="cc__progress-sep">/</span>
            <span class="cc__progress-total">{{ store.totalCount }}</span>
          </div>
        </div>
      </div>
      <div class="cc__track" aria-hidden="true">
        <div class="cc__fill" :style="{ width: `${store.progressRatio * 100}%` }" />
      </div>

      <nav class="cc__nav" aria-label="课程目录">
        <section v-for="entry in groups" :key="entry.group.id" class="cc__group">
          <p class="cc__group-title">{{ i18n.tl(entry.group.title) }}</p>
          <ul class="cc__list">
            <li v-for="chapter in entry.chapters" :key="chapter.id">
              <button
                type="button"
                class="cc__item"
                :class="{ 'cc__item--on': chapter.id === activeId, 'cc__item--done': store.isDone(chapter.id) }"
                @click="selectChapter(chapter.id)"
              >
                <span class="cc__item-mark" aria-hidden="true">
                  <PhCheckCircle v-if="store.isDone(chapter.id)" :size="14" weight="fill" />
                  <PhCircle v-else :size="14" />
                </span>
                <span class="cc__item-id">{{ chapter.id }}</span>
                <span class="cc__item-title">{{ i18n.tl(chapter.title) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </nav>
    </aside>

    <article ref="scrollEl" class="cc__reader">
      <header class="cc__reader-head">
        <p class="cc__kicker">
          <PhBookOpen :size="13" />
          <span>{{ i18n.tl(ccCourseMeta.title) }}</span>
        </p>
        <h1 class="cc__chapter-title">{{ i18n.tl(activeChapter.title) }}</h1>
      </header>

      <div class="cc__prose" v-html="html" />

      <footer class="cc__reader-foot">
        <button
          type="button"
          class="cc__done-btn"
          :class="{ 'cc__done-btn--on': store.isDone(activeId) }"
          @click="store.toggleDone(activeId)"
        >
          <PhCheckCircle v-if="store.isDone(activeId)" :size="15" weight="fill" />
          <PhCircle v-else :size="15" />
          <span>{{ store.isDone(activeId) ? i18n.tl({ zh: '已完成', en: 'Completed' }) : i18n.tl({ zh: '标记完成', en: 'Mark done' }) }}</span>
        </button>
        <button v-if="next" type="button" class="cc__next-btn" @click="goNext">
          <span>{{ i18n.tl({ zh: '下一章', en: 'Next' }) }}：{{ i18n.tl(next.title) }}</span>
          <PhArrowRight :size="15" />
        </button>
      </footer>
    </article>
  </div>
</template>

<style scoped lang="scss">
.cc {
  height: 100%;
  display: flex;
  min-height: 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.cc__side {
  flex: 0 0 268px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
}

.cc__side-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
}

.cc__brand {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: color 0.2s, border-color 0.2s;
}

.cc__brand:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.cc__side-head-inner {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.cc__course-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.cc__progress {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

.cc__track {
  height: 3px;
  margin: 0 14px 10px;
  border-radius: 999px;
  background: var(--color-surface);
  overflow: hidden;
}

.cc__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.cc__nav {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.cc__group-title {
  margin: 0;
  padding: 14px 8px 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.cc__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cc__item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.cc__item:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.cc__item--on {
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.cc__item-mark {
  display: inline-flex;
  flex: 0 0 14px;
  color: var(--color-text-muted);
  opacity: 0.65;
}

.cc__item--done .cc__item-mark {
  color: var(--color-accent);
  opacity: 1;
}

.cc__item-id {
  flex: 0 0 26px;
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.7;
}

.cc__item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
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
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
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

.cc__reader-foot {
  max-width: 760px;
  margin: 0 auto;
  padding: 8px 28px 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--color-border-subtle);
}

.cc__done-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.cc__done-btn:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.cc__done-btn--on {
  color: var(--color-accent-strong);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.cc__next-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}

.cc__next-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.cc__next-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .cc__side {
    flex-basis: 216px;
  }
}
</style>
