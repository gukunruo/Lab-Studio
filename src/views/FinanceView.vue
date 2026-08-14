<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowLeft, PhChartLine } from '@phosphor-icons/vue'
import FinanceApp from '@/apps/finance/index.vue'
import { useLocaleStore } from '@/stores/locale'

const i18n = useLocaleStore()

// 涨跌配色：cn = A股「红涨绿跌」，intl = 国际「绿涨红跌」。
// 覆盖全局 --fin-up/--fin-down token；图表与行情卡片共用这两个变量。
type ColorScheme = 'cn' | 'intl'
const scheme = ref<ColorScheme>(readInitial())

function readInitial(): ColorScheme {
  try {
    const saved = localStorage.getItem('lab-finance-color')
    if (saved === 'cn' || saved === 'intl') return saved
  } catch {}
  return 'cn'
}

watch(
  scheme,
  (s) => {
    const root = document.documentElement
    if (s === 'intl') {
      root.style.setProperty('--fin-up', 'var(--fin-up-intl)')
      root.style.setProperty('--fin-down', 'var(--fin-down-intl)')
    } else {
      root.style.removeProperty('--fin-up')
      root.style.removeProperty('--fin-down')
    }
    try {
      localStorage.setItem('lab-finance-color', s)
    } catch {}
  },
  { immediate: true },
)

function toggleScheme() {
  scheme.value = scheme.value === 'cn' ? 'intl' : 'cn'
}
</script>

<template>
  <div class="fin-full">
    <header class="fin-full__bar">
      <RouterLink to="/" class="fin-full__back" :aria-label="i18n.t('app.back')">
        <PhArrowLeft :size="18" />
        <span>{{ i18n.t('app.back') }}</span>
      </RouterLink>
      <div class="fin-full__title">
        <PhChartLine :size="18" weight="bold" />
        <span>{{ i18n.t('nav.finance') }}</span>
      </div>
      <button
        class="fin-full__color"
        type="button"
        @click="toggleScheme"
        :title="scheme === 'cn' ? '当前：红涨绿跌（点击切换为绿涨红跌）' : '当前：绿涨红跌（点击切换为红涨绿跌）'"
      >
        <span class="fin-full__color-dot fin-full__color-dot--up" />
        <span class="fin-full__color-dot fin-full__color-dot--down" />
        <span class="fin-full__color-label">{{ scheme === 'cn' ? '红涨绿跌' : '绿涨红跌' }}</span>
      </button>
    </header>
    <main class="fin-full__body">
      <FinanceApp />
    </main>
  </div>
</template>

<style scoped lang="scss">
.fin-full {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.fin-full__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 56px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
  backdrop-filter: blur(16px);
}

.fin-full__back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.fin-full__back:hover {
  color: var(--color-accent);
}

.fin-full__title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.fin-full__color {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.fin-full__color:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.fin-full__color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.fin-full__color-dot--up {
  background: var(--fin-up);
}

.fin-full__color-dot--down {
  background: var(--fin-down);
}

.fin-full__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 640px) {
  .fin-full__bar {
    padding: 0 var(--space-4);
  }

  .fin-full__color-label {
    display: none;
  }
}
</style>
