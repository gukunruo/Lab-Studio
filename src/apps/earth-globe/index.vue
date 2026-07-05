<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PhArrowLeft } from '@phosphor-icons/vue'
import { useThemeStore } from '@/stores/theme'
import { GlobeScene } from './scene'

defineOptions({ name: 'EarthGlobeIndex' })

const router = useRouter()
const theme = useThemeStore()

const containerRef = ref<HTMLDivElement | null>(null)
const loadingRef = ref(true)

let globe: GlobeScene | null = null

function goBack() {
  router.push('/')
}

function onResize() {
  globe?.resize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  if (!containerRef.value) return
  globe = new GlobeScene(containerRef.value, theme.theme === 'dark')
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
      </div>
    </div>
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
</style>
