<script setup lang="ts">
import { computed, ref, shallowRef, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { PhFileText, PhArrowsOutSimple, PhArrowsInSimple, PhX } from '@phosphor-icons/vue'
import { apps } from '@/apps/_registry'
import { useLocaleStore } from '@/stores/locale'
import MarkdownModal from '@/components/MarkdownModal.vue'

const props = defineProps<{ slug: string }>()

const i18n = useLocaleStore()

const exp = computed(() => apps.find((e) => e.slug === props.slug))
const showDoc = ref(false)

const AsyncExp = shallowRef<Component | null>(null)

watch(
  () => props.slug,
  (slug) => {
    const found = apps.find((e) => e.slug === slug)
    AsyncExp.value = found ? defineAsyncComponent(found.component) : null
  },
  { immediate: true },
)

// fullscreen for the app stage
const expRoot = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

function fullscreenEl(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element }
  return document.fullscreenElement || doc.webkitFullscreenElement || null
}
function toggleFullscreen() {
  const el = expRoot.value
  if (!el) return
  if (!fullscreenEl()) {
    const anyEl = el as Element & {
      requestFullscreen?: () => Promise<void>
      webkitRequestFullscreen?: () => void
    }
    if (anyEl.requestFullscreen) anyEl.requestFullscreen().catch(() => {})
    else if (anyEl.webkitRequestFullscreen) anyEl.webkitRequestFullscreen()
  } else {
    const doc = document as Document & {
      exitFullscreen?: () => Promise<void>
      webkitExitFullscreen?: () => void
    }
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {})
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen()
  }
}
function syncFullscreen() {
  isFullscreen.value = !!fullscreenEl()
}
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
function onKey(e: KeyboardEvent) {
  if (isTyping(e)) return
  if (e.code === 'KeyF') {
    e.preventDefault()
    toggleFullscreen()
  }
}
onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('webkitfullscreenchange', syncFullscreen)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('webkitfullscreenchange', syncFullscreen)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="exp" ref="expRoot" class="exp" :class="{ 'exp--fullscreen': isFullscreen }">
    <div v-if="isFullscreen" class="exp__hover-zone" />
    <div class="exp__bar">
      <RouterLink to="/" class="exp__back">{{ i18n.t('app.back') }}</RouterLink>
      <div class="exp__meta">
        <h1 class="exp__title">{{ i18n.tl(exp.title) }}</h1>
        <span class="exp__slug">{{ exp.slug }}</span>
      </div>
      <div class="exp__actions">
        <button
          v-if="exp.doc"
          class="exp__doc"
          @click="showDoc = true"
          :aria-label="i18n.t('app.doc')"
        >
          <PhFileText :size="16" />
          {{ i18n.t('app.doc') }}
        </button>
        <button
          class="exp__doc"
          @click="toggleFullscreen"
          :aria-label="isFullscreen ? '退出全屏' : '全屏'"
          :title="isFullscreen ? '退出全屏 (F)' : '全屏 (F)'"
        >
          <component :is="isFullscreen ? PhArrowsInSimple : PhArrowsOutSimple" :size="16" />
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </div>
    <button
      v-if="isFullscreen"
      class="exp__fs-exit"
      @click="toggleFullscreen"
      aria-label="退出全屏"
      title="退出全屏 (F)"
    >
      <PhX :size="18" />
    </button>
    <div class="exp__stage">
      <component :is="AsyncExp" v-if="AsyncExp" />
    </div>
    <MarkdownModal v-if="showDoc && exp.doc" :source="exp.doc" @close="showDoc = false" />
  </div>
</template>

<style scoped lang="scss">
.exp {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}

.exp__bar {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
  margin-bottom: var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.exp__back {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.exp__back:hover {
  color: var(--color-accent);
}

.exp__meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.exp__title {
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.exp__slug {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.exp__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.exp__doc {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.exp__doc:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.exp__stage {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  min-height: 320px;
  padding: var(--space-8);
}

.exp__hover-zone {
  display: none;
}

.exp__fs-exit {
  display: none;
}

.exp--fullscreen {
  max-width: none;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  position: relative;
}

.exp--fullscreen .exp__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  margin: 0;
  padding: var(--space-4) var(--space-6);
  background: linear-gradient(to bottom, var(--color-bg) 35%, transparent);
  border-bottom: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.exp--fullscreen:has(.exp__hover-zone:hover) .exp__bar,
.exp--fullscreen .exp__bar:hover {
  opacity: 1;
  pointer-events: auto;
}

.exp--fullscreen .exp__hover-zone {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  z-index: 9;
}

.exp--fullscreen .exp__fs-exit {
  display: inline-flex;
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  z-index: 11;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.85);
  border: none;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: background 0.2s, color 0.2s;
}

.exp--fullscreen .exp__fs-exit:hover {
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.exp--fullscreen .exp__stage {
  flex: 1;
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.exp:fullscreen,
.exp:-webkit-full-screen {
  background: var(--color-bg);
}

@media (max-width: 640px) {
  .exp {
    padding: var(--space-5) var(--space-4) var(--space-12);
  }

  .exp__bar {
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }

  .exp__meta {
    order: -1;
    flex: 1 1 100%;
  }

  .exp__stage {
    padding: var(--space-4);
  }
}
</style>
