<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PhArrowLeft, PhX, PhMapPin } from '@phosphor-icons/vue'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { GlobeScene } from './scene'
import type { Landmark } from './landmarks'

defineOptions({ name: 'EarthGlobeIndex' })

const router = useRouter()
const theme = useThemeStore()
const locale = useLocaleStore()

const containerRef = ref<HTMLDivElement | null>(null)
const loadingRef = ref(true)
const hoveredLandmark = ref<Landmark | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)
const selectedLandmark = ref<Landmark | null>(null)

let globe: GlobeScene | null = null

function goBack() {
  router.push('/')
}

function closePanel() {
  selectedLandmark.value = null
  globe?.resetView()
}

function onResize() {
  globe?.resize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  if (!containerRef.value) return
  globe = new GlobeScene(containerRef.value, theme.theme === 'dark')
  globe.onHoverLandmark = (lm, x, y) => {
    hoveredLandmark.value = lm
    if (lm) {
      tooltipX.value = x
      tooltipY.value = y
    }
  }
  globe.onSelectLandmark = (lm) => {
    selectedLandmark.value = lm
    if (lm) hoveredLandmark.value = null
  }
  globe.start()
  loadingRef.value = false
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  globe?.dispose()
  globe = null
})

watch(() => theme.theme, (next) => {
  globe?.updateTheme(next === 'dark')
})
</script>

<template>
  <div class="eg">
    <div ref="containerRef" class="eg__canvas" />
    <div v-if="loadingRef" class="eg__loading">
      <div class="eg__spinner" />
    </div>
    <div class="eg__overlay">
      <button class="eg__back" @click="goBack">
        <PhArrowLeft :size="16" weight="bold" />
        返回
      </button>
      <div class="eg__info">
        <span class="eg__info-label">DRAG · ROTATE</span>
        <span class="eg__info-label">SCROLL · ZOOM</span>
        <span class="eg__info-label eg__info-label--accent">CLICK PIN</span>
      </div>
    </div>

    <div
      v-if="hoveredLandmark && !selectedLandmark"
      class="eg__tooltip"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
    >
      <PhMapPin :size="11" weight="fill" />
      {{ locale.tl(hoveredLandmark.name) }}
    </div>

    <Transition name="eg-panel">
      <div v-if="selectedLandmark" class="eg__panel">
        <button class="eg__panel-close" @click="closePanel" aria-label="close">
          <PhX :size="16" weight="bold" />
        </button>
        <div class="eg__panel-tag">
          <PhMapPin :size="10" weight="fill" />
          LANDMARK
        </div>
        <h3 class="eg__panel-title">{{ locale.tl(selectedLandmark.name) }}</h3>
        <p class="eg__panel-desc">{{ locale.tl(selectedLandmark.description) }}</p>
        <div class="eg__panel-coords">
          <span>{{ Math.abs(selectedLandmark.lat).toFixed(4) }}°{{ selectedLandmark.lat >= 0 ? 'N' : 'S' }}</span>
          <span class="eg__panel-coords-sep">/</span>
          <span>{{ Math.abs(selectedLandmark.lon).toFixed(4) }}°{{ selectedLandmark.lon >= 0 ? 'E' : 'W' }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.eg {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #000;
  overflow: hidden;
}

.eg__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;

  :deep(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
}

.eg__overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: var(--space-5) var(--space-6);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 2;
  pointer-events: none;
}

.eg__back {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 0.9rem;
  font-size: 0.82rem;
  font-family: var(--font-mono);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(0, 0, 0, 0.6);
  }
}

.eg__info {
  display: flex;
  gap: var(--space-4);
  pointer-events: none;
}

.eg__info-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);

  &--accent {
    color: #2dd4bf;
  }
}

.eg__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  z-index: 1;
}

.eg__spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: eg-spin 0.8s linear infinite;
}

@keyframes eg-spin {
  to {
    transform: rotate(360deg);
  }
}

// Hover tooltip
.eg__tooltip {
  position: fixed;
  transform: translate(-50%, -130%);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0.3rem 0.65rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(45, 212, 191, 0.4);
  border-radius: var(--radius-full);
  white-space: nowrap;
  pointer-events: none;
  animation: eg-tooltip-in 0.15s ease-out;

  svg {
    color: #2dd4bf;
  }
}

@keyframes eg-tooltip-in {
  from {
    opacity: 0;
    transform: translate(-50%, -100%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -130%);
  }
}

// Info panel
.eg__panel {
  position: absolute;
  bottom: var(--space-6);
  left: var(--space-6);
  z-index: 3;
  max-width: 380px;
  padding: var(--space-5) var(--space-5) var(--space-4);
  background: rgba(8, 12, 20, 0.78);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.eg__panel-close {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }
}

.eg__panel-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.15rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #2dd4bf;
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.25);
  border-radius: var(--radius-full);
  margin-bottom: var(--space-3);
}

.eg__panel-title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-sans);
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  padding-right: var(--space-6);
}

.eg__panel-desc {
  margin: 0 0 var(--space-3);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.6);
}

.eg__panel-coords {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.05em;
}

.eg__panel-coords-sep {
  color: rgba(255, 255, 255, 0.2);
}

// Panel transition
.eg-panel-enter-active,
.eg-panel-leave-active {
  transition: all 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.eg-panel-enter-from,
.eg-panel-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
