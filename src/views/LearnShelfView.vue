<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowRight, PhMoon, PhSun, PhTranslate } from '@phosphor-icons/vue'
import { ccChapters, ccCourseMeta, ccIntro } from '@/learn/cc-curriculum'
import { lessonById } from '@/learn/curriculum'
import { useAcademyStore } from '@/stores/academy'
import { useCcCourseStore } from '@/stores/cc-course'
import { useLocaleStore } from '@/stores/locale'
import { useThemeStore } from '@/stores/theme'
import { updateAiPreferences } from '@/ai-platform/api'

const i18n = useLocaleStore()
const theme = useThemeStore()
const academy = useAcademyStore()
const cc = useCcCourseStore()

const ccMinutes = computed(() =>
  ccChapters.reduce((sum, chapter) => sum + chapter.minutes, ccIntro.minutes),
)

function toggleTheme() {
  theme.toggle()
  void updateAiPreferences({ theme: theme.theme }).catch(() => {})
}

const books = computed(() => {
  const academyResume = academy.lastOpened ? lessonById(academy.lastOpened) : undefined
  return [
    {
      id: 'ai-app-engineering',
      to: '/learn/academy',
      cover: 'aae' as const,
      title: { zh: 'AI 应用工程', en: 'AI App Engineering' },
      sub: { zh: '从模型到产品', en: 'From model to product' },
      meta: { zh: '24 课', en: '24 days' },
      ratio: academy.progressRatio,
      done: academy.doneCount,
      total: academy.totalCount,
      resume: academyResume ? `Day ${String(academyResume.day).padStart(2, '0')}` : null,
    },
    {
      id: 'learn-claude-code',
      to: cc.lastOpened ? `/learn/claude-code?s=${cc.lastOpened}` : '/learn/claude-code',
      cover: 'lcc' as const,
      title: ccCourseMeta.title,
      sub: { zh: '从 0 到 1 构建 Agent', en: 'Build an agent from scratch' },
      meta: {
        zh: `20 章 · ≈ ${Math.round(ccMinutes.value / 60)} 小时`,
        en: `20 chapters · ≈ ${(ccMinutes.value / 60).toFixed(1)}h`,
      },
      ratio: cc.progressRatio,
      done: cc.doneCount,
      total: cc.totalCount,
      resume: cc.lastOpened ?? null,
    },
  ]
})

function onTiltMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const inner = el.querySelector<HTMLElement>('.book__inner')
  if (!inner) return
  const r = el.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  inner.style.setProperty('--ry', `${(px * 9).toFixed(2)}deg`)
  inner.style.setProperty('--rx', `${(-py * 9).toFixed(2)}deg`)
}

function onTiltLeave(e: MouseEvent) {
  const inner = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.book__inner')
  inner?.style.setProperty('--rx', '0deg')
  inner?.style.setProperty('--ry', '0deg')
}
</script>

<template>
  <div class="shelf">
    <header class="shelf__bar">
      <div class="shelf__bar-left">
        <RouterLink to="/" class="shelf__brand" aria-label="Lab Studio" title="返回 Lab">
          <svg class="shelf__logo" viewBox="0 0 100 100" aria-hidden="true">
            <polygon points="50,8 87,29.5 87,70.5 50,92 13,70.5 13,29.5" fill="currentColor" />
            <circle cx="50" cy="50" r="8" fill="var(--color-accent)" />
          </svg>
        </RouterLink>
        <h1 class="shelf__title">{{ i18n.tl({ zh: '书架', en: 'Library' }) }}</h1>
      </div>
      <div class="shelf__tools">
        <button
          class="shelf__tool"
          type="button"
          @click="i18n.toggle()"
          :aria-label="i18n.locale === 'zh' ? 'Switch to English' : '切换到中文'"
        >
          <PhTranslate :size="16" weight="regular" />
          <span class="shelf__tool-label">{{ i18n.locale === 'zh' ? 'EN' : '中' }}</span>
        </button>
        <button
          class="shelf__tool"
          type="button"
          @click="toggleTheme"
          :aria-label="theme.theme === 'dark' ? '切换到亮色' : '切换到暗色'"
        >
          <PhSun v-if="theme.theme === 'dark'" :size="16" weight="regular" />
          <PhMoon v-else :size="16" weight="regular" />
        </button>
      </div>
    </header>

    <div class="shelf__room">
      <div
        v-for="(book, i) in books"
        :key="book.id"
        class="shelf__slot"
        :style="{ '--delay': `${i * 140}ms` }"
      >
        <RouterLink
          :to="book.to"
          class="book"
          :data-cover="book.cover"
          :aria-label="i18n.tl(book.title)"
          @mousemove="onTiltMove"
          @mouseleave="onTiltLeave"
        >
          <div class="book__inner">
            <svg class="book__pattern" viewBox="0 0 240 340" preserveAspectRatio="none" aria-hidden="true">
              <template v-if="book.cover === 'aae'">
                <path d="M-10 268 C 50 232, 96 292, 152 244 S 246 178, 256 208" fill="none" stroke="rgba(255,255,255,0.11)" stroke-width="1.4" />
                <path d="M-10 236 C 56 200, 102 258, 158 212 S 244 148, 256 176" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.4" />
                <path d="M-10 300 C 60 268, 110 318, 168 276 S 248 220, 256 244" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.4" />
                <circle cx="152" cy="244" r="3" fill="rgba(255,255,255,0.28)" />
                <circle cx="96" cy="252" r="2.2" fill="rgba(255,255,255,0.2)" />
                <circle cx="205" cy="216" r="2.2" fill="rgba(255,255,255,0.2)" />
              </template>
              <template v-else>
                <line x1="26" y1="0" x2="26" y2="340" stroke="rgba(126,231,199,0.1)" stroke-width="1" />
                <rect x="40" y="58" width="64" height="5" rx="2.5" fill="rgba(126,231,199,0.14)" />
                <rect x="110" y="58" width="38" height="5" rx="2.5" fill="rgba(255,255,255,0.07)" />
                <rect x="40" y="72" width="30" height="5" rx="2.5" fill="rgba(255,255,255,0.07)" />
                <rect x="76" y="72" width="58" height="5" rx="2.5" fill="rgba(126,231,199,0.1)" />
                <rect x="40" y="86" width="48" height="5" rx="2.5" fill="rgba(255,255,255,0.06)" />
                <rect x="56" y="100" width="70" height="5" rx="2.5" fill="rgba(126,231,199,0.08)" />
                <polyline points="40,238 46,244 40,250" fill="none" stroke="rgba(126,231,199,0.45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <rect x="52" y="246" width="12" height="4" rx="1" fill="rgba(126,231,199,0.45)" />
              </template>
            </svg>
            <div class="book__face">
              <p class="book__overline">LAB STUDIO</p>
              <div class="book__mid">
                <h2 class="book__title" :class="{ 'book__title--mono': book.cover === 'lcc' }">{{ i18n.tl(book.title) }}</h2>
                <p class="book__sub">{{ i18n.tl(book.sub) }}</p>
              </div>
              <p class="book__meta">{{ i18n.locale === 'zh' ? book.meta.zh : book.meta.en }}</p>
            </div>
            <div
              class="book__ribbon"
              :style="{
                height: `${book.done > 0 ? Math.max(book.ratio * 100, 9) : 0}%`,
                opacity: book.done > 0 ? 1 : 0,
              }"
              aria-hidden="true"
            />
            <div class="book__gloss" aria-hidden="true" />
          </div>
        </RouterLink>
        <div class="shelf__under">
          <div class="shelf__track" aria-hidden="true">
            <div class="shelf__fill" :style="{ width: `${book.ratio * 100}%` }" />
          </div>
          <span class="shelf__count">{{ book.done }}/{{ book.total }}</span>
          <span v-if="book.resume" class="shelf__resume">
            {{ book.resume }}
            <PhArrowRight :size="11" weight="bold" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.shelf {
  height: 100%;
  overflow-y: auto;
  background:
    radial-gradient(90% 46% at 50% -4%, var(--color-accent-soft) 0%, transparent 62%),
    var(--color-bg);
  color: var(--color-text);
}

.shelf__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 960px;
  margin: 0 auto;
  padding: 22px 28px 4px;
}

.shelf__bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
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

.shelf__tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.shelf__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.shelf__tool:hover {
  color: var(--color-accent);
  border-color: var(--color-border);
  background: var(--color-surface);
}

.shelf__tool-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1;
}

.shelf__room {
  max-width: 960px;
  margin: 0 auto;
  padding: 44px 28px 72px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 58px;
}

.shelf__slot {
  width: 248px;
  animation: shelf-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
}

@keyframes shelf-rise {
  from {
    opacity: 0;
    transform: translateY(26px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.book {
  display: block;
  perspective: 1000px;
  text-decoration: none;
  color: inherit;
}

.book__inner {
  position: relative;
  aspect-ratio: 7 / 10;
  border-radius: 4px 10px 10px 4px;
  overflow: hidden;
  transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(var(--lift, 0px));
  transition: transform 0.16s ease-out, box-shadow 0.25s ease;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06) inset,
    0 18px 40px rgba(0, 0, 0, 0.3);
}

.book:hover .book__inner {
  --lift: -8px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.08) inset,
    0 32px 64px rgba(0, 0, 0, 0.38);
}

/* 书脊 */
.book__inner::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 13px;
  z-index: 3;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.42) 0%, rgba(0, 0, 0, 0.12) 55%, rgba(255, 255, 255, 0.09) 88%, rgba(255, 255, 255, 0.02) 100%);
  pointer-events: none;
}

.book[data-cover='aae'] .book__inner {
  background: linear-gradient(155deg, #10655c 0%, #0a443f 56%, #072e2b 100%);
}

.book[data-cover='lcc'] .book__inner {
  background: linear-gradient(160deg, #161b21 0%, #0b0e13 100%);
}

.book__pattern {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.book__face {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: 26px 20px 20px 26px;
}

.book__overline {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.32em;
  color: rgba(255, 255, 255, 0.42);
}

.book[data-cover='lcc'] .book__overline {
  color: rgba(126, 231, 199, 0.5);
}

.book__mid {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.book__title {
  margin: 0;
  font-size: 27px;
  font-weight: 750;
  letter-spacing: 0.02em;
  line-height: 1.28;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.22);
}

.book__title--mono {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.36;
}

.book__sub {
  margin: 0;
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.62);
}

.book__meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
}

/* 书签丝带 */
.book__ribbon {
  position: absolute;
  top: 0;
  right: 22px;
  width: 24px;
  z-index: 4;
  transition: height 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - 8px), 0 100%);
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.25));
}

.book[data-cover='aae'] .book__ribbon {
  background: linear-gradient(180deg, #ecc76a 0%, #d9ac3f 100%);
}

.book[data-cover='lcc'] .book__ribbon {
  background: linear-gradient(180deg, #7ee7c7 0%, #4fc3a1 100%);
}

/* 高光扫过 */
.book__gloss {
  position: absolute;
  inset: 0;
  z-index: 5;
  transform: translateX(-130%) skewX(-12deg);
  background: linear-gradient(105deg, transparent 42%, rgba(255, 255, 255, 0.15) 50%, transparent 58%);
  pointer-events: none;
}

.book:hover .book__gloss {
  animation: gloss-sweep 0.9s ease 0.05s;
}

@keyframes gloss-sweep {
  from {
    transform: translateX(-130%) skewX(-12deg);
  }
  to {
    transform: translateX(130%) skewX(-12deg);
  }
}

.shelf__under {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
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

.shelf__count {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

.shelf__resume {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-accent-strong);
}

@media (max-width: 640px) {
  .shelf__room {
    gap: 36px;
    padding-top: 30px;
  }

  .shelf__slot {
    width: min(248px, 72vw);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shelf__slot {
    animation: none;
  }

  .book__inner,
  .book__ribbon {
    transition: none;
  }

  .book:hover .book__gloss {
    animation: none;
  }
}
</style>
