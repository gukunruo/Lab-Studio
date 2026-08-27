<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PhArrowLeft,
  PhCheckCircle,
  PhCircle,
  PhList,
  PhMoon,
  PhSidebarSimple,
  PhSun,
  PhTranslate,
  PhX,
} from '@phosphor-icons/vue'
import ResizeGutter from '@/components/ResizeGutter.vue'
import { updateAiPreferences } from '@/ai-platform/api'
import { useLocaleStore } from '@/stores/locale'
import { useThemeStore } from '@/stores/theme'
import { SIDE_MAX, SIDE_MIN, useUiStore } from '@/stores/ui'

const props = defineProps<{
  backTo: string
  title: { zh: string; en: string }
  done: number
  total: number
  groups: Array<{
    id: string
    title: { zh: string; en: string }
    items: Array<{ id: string; badge?: string; label: string; done?: boolean; active?: boolean }>
  }>
}>()

const emit = defineEmits<{ select: [id: string] }>()

const i18n = useLocaleStore()
const theme = useThemeStore()
const ui = useUiStore()

const sideOpen = ref(false)

const GROUP_COLORS = ['#5b8def', '#4fc3a1', '#a78bfa', '#f0b429', '#ef6a6a', '#67c3eb']

const progressRatio = computed(() => (props.total ? props.done / props.total : 0))

function toggleTheme() {
  theme.toggle()
  void updateAiPreferences({ theme: theme.theme }).catch(() => {})
}

function onSelect(id: string) {
  sideOpen.value = false
  emit('select', id)
}
</script>

<template>
  <div class="rs" :style="{ '--rs-side-w': `${ui.sideW}px` }">
    <aside v-show="!ui.sideCollapsed || sideOpen" class="rs__side" :class="{ 'rs__side--open': sideOpen }">
      <div class="rs__side-head">
        <RouterLink :to="backTo" class="rs__back" :title="i18n.tl({ zh: '返回书架', en: 'Back to library' })">
          <PhArrowLeft :size="16" />
        </RouterLink>
        <div class="rs__side-inner">
          <p class="rs__side-book">{{ i18n.tl(title) }}</p>
          <p class="rs__side-progress">
            <span class="rs__side-done">{{ done }}</span>
            <span class="rs__side-sep">/</span>
            <span>{{ total }}</span>
          </p>
        </div>
        <button
          type="button"
          class="rs__icon rs__icon--collapse"
          :aria-label="i18n.tl({ zh: '收起目录', en: 'Hide contents' })"
          @click="ui.toggleSideCollapsed(true)"
        >
          <PhSidebarSimple :size="16" />
        </button>
        <button
          type="button"
          class="rs__icon rs__icon--close"
          :aria-label="i18n.tl({ zh: '关闭目录', en: 'Close contents' })"
          @click="sideOpen = false"
        >
          <PhX :size="16" />
        </button>
      </div>
      <div class="rs__side-track" aria-hidden="true">
        <div class="rs__side-fill" :style="{ width: `${progressRatio * 100}%` }" />
      </div>

      <nav class="rs__nav" :aria-label="i18n.tl({ zh: '目录', en: 'Contents' })">
        <section v-for="(group, gi) in groups" :key="group.id" class="rs__group">
          <p class="rs__group-title">
            <i class="rs__dot" :style="{ background: GROUP_COLORS[gi % GROUP_COLORS.length] }" aria-hidden="true" />
            <span>{{ i18n.tl(group.title) }}</span>
          </p>
          <ul class="rs__list">
            <li v-for="item in group.items" :key="item.id">
              <button
                type="button"
                class="rs__item"
                :class="{
                  'rs__item--on': item.active,
                  'rs__item--done': item.done,
                }"
                @click="onSelect(item.id)"
              >
                <span class="rs__item-mark" aria-hidden="true">
                  <PhCheckCircle v-if="item.done" :size="14" weight="fill" />
                  <PhCircle v-else :size="14" />
                </span>
                <span v-if="item.badge" class="rs__item-badge">{{ item.badge }}</span>
                <span class="rs__item-label">{{ item.label }}</span>
              </button>
            </li>
          </ul>
        </section>
      </nav>
    </aside>
    <div v-if="sideOpen" class="rs__scrim" aria-hidden="true" @click="sideOpen = false" />

    <ResizeGutter
      v-if="!ui.sideCollapsed"
      class="rs__gutter"
      :min="SIDE_MIN"
      :max="SIDE_MAX"
      :value="ui.sideW"
      @resize="ui.setSideW"
    />

    <div class="rs__main">
      <header class="rs__top">
        <div class="rs__top-left">
          <button
            type="button"
            class="rs__icon rs__icon--menu"
            :aria-label="i18n.tl({ zh: '打开目录', en: 'Open contents' })"
            @click="sideOpen = true"
          >
            <PhList :size="17" />
          </button>
          <button
            v-if="ui.sideCollapsed"
            type="button"
            class="rs__icon"
            :aria-label="i18n.tl({ zh: '展开目录', en: 'Show contents' })"
            @click="ui.toggleSideCollapsed(false)"
          >
            <PhSidebarSimple :size="16" />
          </button>
          <p class="rs__top-book">{{ i18n.tl(title) }}</p>
          <span class="rs__top-sep" aria-hidden="true" />
          <span class="rs__top-num">{{ done }}<i>/</i>{{ total }}</span>
          <div class="rs__top-track" aria-hidden="true">
            <div class="rs__top-fill" :style="{ width: `${progressRatio * 100}%` }" />
          </div>
        </div>
        <div class="rs__top-right">
          <slot name="tools" />
          <button
            type="button"
            class="rs__icon"
            :aria-label="i18n.locale === 'zh' ? 'Switch to English' : '切换到中文'"
            @click="i18n.toggle()"
          >
            <PhTranslate :size="16" />
            <span class="rs__icon-label">{{ i18n.locale === 'zh' ? 'EN' : '中' }}</span>
          </button>
          <button
            type="button"
            class="rs__icon"
            :aria-label="theme.theme === 'dark' ? '切换到亮色' : '切换到暗色'"
            @click="toggleTheme"
          >
            <PhSun v-if="theme.theme === 'dark'" :size="16" />
            <PhMoon v-else :size="16" />
          </button>
        </div>
      </header>
      <div class="rs__body">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.rs {
  height: 100%;
  display: flex;
  min-height: 0;
  background: var(--color-bg);
  color: var(--color-text);
}

.rs__side {
  flex: 0 0 var(--rs-side-w, 276px);
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  z-index: 30;
}

.rs__gutter {
  flex: 0 0 6px;
}

.rs__side-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px;
}

.rs__back {
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

.rs__back:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.rs__side-inner {
  flex: 1;
  min-width: 0;
}

.rs__side-book {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.rs__side-progress {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--color-text-muted);
}

.rs__side-done {
  color: var(--color-accent-strong);
}

.rs__side-track {
  height: 3px;
  margin: 0 14px 10px;
  border-radius: 999px;
  background: var(--color-surface);
  overflow: hidden;
}

.rs__side-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.rs__nav {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.rs__group-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  padding: 14px 8px 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.rs__dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
}

.rs__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rs__item {
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

.rs__item:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.rs__item--on {
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.rs__item-mark {
  display: inline-flex;
  flex: 0 0 14px;
  color: var(--color-text-muted);
  opacity: 0.65;
}

.rs__item--done .rs__item-mark {
  color: var(--color-accent);
  opacity: 1;
}

.rs__item-badge {
  flex: 0 0 28px;
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.7;
}

.rs__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.rs__main {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rs__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
}

.rs__top-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.rs__top-book {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.rs__top-sep {
  width: 1px;
  height: 16px;
  flex: 0 0 1px;
  background: var(--color-border);
}

.rs__top-num {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);

  i {
    font-style: normal;
    opacity: 0.55;
    margin: 0 1px;
  }
}

.rs__top-track {
  flex: 0 1 120px;
  min-width: 40px;
  height: 3px;
  border-radius: 999px;
  background: var(--color-surface);
  overflow: hidden;
}

.rs__top-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
  transition: width 0.3s ease;
}

.rs__top-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.rs__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.rs__icon:hover {
  color: var(--color-accent);
  border-color: var(--color-border);
  background: var(--color-surface);
}

.rs__icon-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1;
}

.rs__icon--menu,
.rs__icon--close {
  display: none;
}

.rs__scrim {
  display: none;
}

.rs__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

@media (max-width: 900px) {
  .rs__side {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(300px, 84vw);
    transform: translateX(-102%);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 0 60px rgba(0, 0, 0, 0.35);
  }

  .rs__side--open {
    transform: translateX(0);
  }

  .rs__gutter {
    display: none;
  }

  .rs__icon--menu,
  .rs__icon--close {
    display: inline-flex;
  }

  .rs__icon--collapse {
    display: none;
  }

  .rs__scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 25;
    background: rgba(0, 0, 0, 0.45);
  }

  .rs__top-track {
    display: none;
  }
}
</style>
