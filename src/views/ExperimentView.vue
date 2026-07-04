<script setup lang="ts">
import { computed, ref, shallowRef, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { PhFileText, PhArrowsOutSimple, PhArrowsInSimple } from '@phosphor-icons/vue'
import { experiments } from '@/experiments/_registry'
import { useLocaleStore } from '@/stores/locale'
import MarkdownModal from '@/components/MarkdownModal.vue'

const props = defineProps<{ slug: string }>()

const i18n = useLocaleStore()

const exp = computed(() => experiments.find((e) => e.slug === props.slug))
const showDoc = ref(false)

const AsyncExp = shallowRef<Component | null>(null)

watch(
  () => props.slug,
  (slug) => {
    const found = experiments.find((e) => e.slug === slug)
    AsyncExp.value = found ? defineAsyncComponent(found.component) : null
  },
  { immediate: true },
)

// fullscreen for the experiment stage
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
onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('webkitfullscreenchange', syncFullscreen)
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('webkitfullscreenchange', syncFullscreen)
})
</script>

<template>
  <div v-if="exp" ref="expRoot" class="exp" :class="{ 'exp--fullscreen': isFullscreen }">
    <div class="exp__bar">
      <RouterLink to="/" class="exp__back">{{ i18n.t('exp.back') }}</RouterLink>
      <div class="exp__meta">
        <h1 class="exp__title">{{ i18n.tl(exp.title) }}</h1>
        <span class="exp__slug">{{ exp.slug }}</span>
      </div>
      <div class="exp__actions">
        <button
          v-if="exp.doc"
          class="exp__doc"
          @click="showDoc = true"
          :aria-label="i18n.t('exp.doc')"
        >
          <PhFileText :size="16" />
          {{ i18n.t('exp.doc') }}
        </button>
        <button
          class="exp__doc"
          @click="toggleFullscreen"
          :aria-label="isFullscreen ? '退出全屏' : '全屏'"
          :title="isFullscreen ? '退出全屏' : '全屏'"
        >
          <component :is="isFullscreen ? PhArrowsInSimple : PhArrowsOutSimple" :size="16" />
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </button>
      </div>
    </div>
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

.exp--fullscreen {
  max-width: none;
  margin: 0;
  padding: var(--space-6);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.exp--fullscreen .exp__stage {
  flex: 1;
  min-height: 0;
  border-radius: var(--radius-md);
}

.exp:fullscreen,
.exp:-webkit-full-screen {
  background: var(--color-bg);
}
</style>
