<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowRight, PhGraduationCap, PhTerminalWindow } from '@phosphor-icons/vue'
import { ccChapters, ccCourseMeta, ccIntro } from '@/learn/cc-curriculum'
import { useAcademyStore } from '@/stores/academy'
import { useCcCourseStore } from '@/stores/cc-course'
import { useLocaleStore } from '@/stores/locale'

const i18n = useLocaleStore()
const academy = useAcademyStore()
const cc = useCcCourseStore()

const ccMinutes = computed(() =>
  ccChapters.reduce((sum, chapter) => sum + chapter.minutes, ccIntro.minutes),
)

const courses = computed(() => [
  {
    id: 'academy',
    to: '/learn/academy',
    icon: PhGraduationCap,
    title: { zh: 'AI 学院', en: 'AI Academy' },
    blurb: {
      zh: '24 天系统入门 AI 应用开发：从 LLM 心智模型、API 与 RAG，到 Agent 编排与毕业项目。',
      en: 'A 24-day path into AI app development: from LLM fundamentals and RAG to agent orchestration and a capstone.',
    },
    unitLabel: i18n.tl({ zh: '课', en: 'days' }),
    total: academy.totalCount,
    minutes: null,
    progressRatio: academy.progressRatio,
    done: academy.doneCount,
    resumeTo: '/learn/academy',
  },
  {
    id: 'learn-claude-code',
    to: '/learn/claude-code',
    icon: PhTerminalWindow,
    title: ccCourseMeta.title,
    blurb: ccCourseMeta.blurb,
    unitLabel: i18n.tl({ zh: '章', en: 'chapters' }),
    total: cc.totalCount,
    minutes: ccMinutes.value,
    progressRatio: cc.progressRatio,
    done: cc.doneCount,
    resumeTo: cc.lastOpened ? `/learn/claude-code?s=${cc.lastOpened}` : '/learn/claude-code',
  },
])

function courseLabel(course: (typeof courses.value)[number]) {
  return `${course.total} ${course.unitLabel}`
}

function ctaLabel(course: (typeof courses.value)[number]) {
  return course.done > 0 ? i18n.tl({ zh: '继续学习', en: 'Continue' }) : i18n.tl({ zh: '开始学习', en: 'Start' })
}
</script>

<template>
  <div class="shelf">
    <header class="shelf__bar">
      <RouterLink to="/" class="shelf__brand" aria-label="Lab Studio" title="返回 Lab">
        <svg class="shelf__logo" viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="50,8 87,29.5 87,70.5 50,92 13,70.5 13,29.5" fill="currentColor" />
          <circle cx="50" cy="50" r="8" fill="var(--color-accent)" />
        </svg>
      </RouterLink>
      <h1 class="shelf__title">{{ i18n.tl({ zh: '学习中心', en: 'Learning Hub' }) }}</h1>
    </header>

    <div class="shelf__grid">
      <RouterLink
        v-for="course in courses"
        :key="course.id"
        :to="course.resumeTo"
        class="shelf__card"
      >
        <div class="shelf__cover" aria-hidden="true">
          <component :is="course.icon" :size="30" />
        </div>
        <div class="shelf__body">
          <h2 class="shelf__course-title">{{ i18n.tl(course.title) }}</h2>
          <p class="shelf__blurb">{{ i18n.tl(course.blurb) }}</p>
          <div class="shelf__meta">
            <span>{{ courseLabel(course) }}</span>
            <span v-if="course.minutes !== null" class="shelf__meta-dot">·</span>
            <span v-if="course.minutes !== null">≈ {{ i18n.locale === 'zh' ? `${Math.round(course.minutes / 60)} 小时` : `${(course.minutes / 60).toFixed(1)}h` }}</span>
          </div>
          <div class="shelf__progress-row">
            <div class="shelf__track" aria-hidden="true">
              <div class="shelf__fill" :style="{ width: `${course.progressRatio * 100}%` }" />
            </div>
            <span class="shelf__pct">{{ Math.round(course.progressRatio * 100) }}%</span>
          </div>
        </div>
        <span class="shelf__cta">
          <span>{{ ctaLabel(course) }}</span>
          <PhArrowRight :size="14" weight="bold" />
        </span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped lang="scss">
.shelf {
  height: 100%;
  overflow-y: auto;
  background: var(--color-bg);
  color: var(--color-text);
}

.shelf__bar {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 980px;
  margin: 0 auto;
  padding: 26px 28px 10px;
}

.shelf__brand {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  transition: border-color 0.2s, color 0.2s;
}

.shelf__brand:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.shelf__logo {
  width: 20px;
  height: 20px;
}

.shelf__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.shelf__grid {
  max-width: 980px;
  margin: 0 auto;
  padding: 18px 28px 48px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}

.shelf__card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated, var(--color-bg));
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
}

.shelf__card:hover {
  border-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

.shelf__cover {
  display: grid;
  place-items: center;
  height: 96px;
  background:
    radial-gradient(120% 140% at 20% 0%, var(--color-accent-soft) 0%, transparent 62%),
    var(--color-surface-2);
  color: var(--color-accent-strong);
  border-bottom: 1px solid var(--color-border-subtle);
}

.shelf__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 16px;
  flex: 1;
}

.shelf__course-title {
  margin: 0;
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.shelf__blurb {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.65;
  flex: 1;
}

.shelf__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.shelf__meta-dot {
  opacity: 0.6;
}

.shelf__progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.shelf__track {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: var(--color-surface-2);
  overflow: hidden;
}

.shelf__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.shelf__pct {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

.shelf__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 18px 18px;
  padding: 8px 14px;
  align-self: flex-start;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.shelf__card:hover .shelf__cta {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}
</style>
