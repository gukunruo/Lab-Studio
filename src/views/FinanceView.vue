<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { restoreSearchSelection, searchErrorMessage, searchSelectionIndex } from '@/apps/finance/useFinance'
import { RouterLink } from 'vue-router'
import { PhArrowLeft, PhChartLine, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue'
import FinanceApp from '@/apps/finance/index.vue'
import IndexStrip from '@/apps/finance/components/IndexStrip.vue'
import { useFinance } from '@/apps/finance/useFinance'
import type { SearchItem } from '@/apps/finance/types'
import { useLocaleStore } from '@/stores/locale'

const i18n = useLocaleStore()
const finance = useFinance()
const activeIndex = ref(-1)

const domesticBoards = computed(() => finance.boards.value?.domestic ?? [])
const overseasBoards = computed(() => finance.boards.value?.overseas ?? [])

function moveDown() {
  if (!finance.suggestions.value.length) return
  activeIndex.value = (activeIndex.value + 1) % finance.suggestions.value.length
}

function moveUp() {
  if (!finance.suggestions.value.length) return
  activeIndex.value = (activeIndex.value - 1 + finance.suggestions.value.length) % finance.suggestions.value.length
}

async function selectItem(item: SearchItem) {
  activeIndex.value = -1
  await finance.select(item)
}

function confirmSelection() {
  const index = searchSelectionIndex(activeIndex.value, finance.suggestions.value.length)
  const item = finance.suggestions.value[index]
  if (item) void selectItem(item)
}

watch(
  () => finance.suggestions.value.length,
  (count) => {
    activeIndex.value = restoreSearchSelection(activeIndex.value, count)
  },
)

function addItem(item: SearchItem) {
  void finance.addWatch(item)
}

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
      <RouterLink to="/" class="fin-full__back" aria-label="返回 Lab" title="返回 Lab">
        <PhArrowLeft :size="18" />
      </RouterLink>
      <div class="fin-full__title">
        <PhChartLine :size="18" weight="bold" />
        <span>{{ i18n.t('nav.finance') }}</span>
      </div>
      <div class="fin-full__search">
        <PhMagnifyingGlass :size="15" class="fin-full__search-icon" />
        <input
          v-model="finance.query.value"
          class="fin-full__search-input"
          type="search"
          placeholder="搜索股票/基金/板块/ETF"
          @input="finance.scheduleSearch()"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="confirmSelection"
          @keydown.esc="finance.suggestions.value = []; activeIndex = -1"
        />
        <p v-if="finance.searchError.value" class="fin-full__search-error" role="status">
          {{ finance.searchError.value }}
        </p>
        <ul v-if="finance.suggestions.value.length" class="fin-full__suggest">
          <li
            v-for="(s, i) in finance.suggestions.value"
            :key="s.quoteId + s.code"
            class="fin-full__suggest-item"
            :class="{ 'fin-full__suggest-item--active': i === activeIndex }"
            @mouseenter="activeIndex = i"
            @click="selectItem(s)"
          >
            <span class="fin-full__suggest-name">{{ s.name }}</span>
            <span class="fin-full__suggest-code">{{ s.code }}</span>
            <span class="fin-full__suggest-type">{{ s.typeName }}</span>
            <button class="fin-full__add" type="button" :aria-label="`添加 ${s.name}`" @click.stop="addItem(s)">
              <PhPlus :size="13" weight="bold" />
            </button>
          </li>
        </ul>
      </div>
      <IndexStrip
        class="fin-full__indices"
        :domestic="domesticBoards"
        :overseas="overseasBoards"
        @select="finance.selectBoard"
      />
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
      <FinanceApp :finance="finance" />
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
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  color: var(--color-text-muted);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: color 0.2s, background 0.2s;
}

.fin-full__back:hover,
.fin-full__back:focus-visible {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.fin-full__search {
  position: relative;
  width: min(340px, 28vw);
  flex-shrink: 0;
}

.fin-full__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.fin-full__search-input {
  width: 100%;
  min-height: 2rem;
  padding: 0.45rem 0.75rem 0.45rem 2.1rem;
  font: inherit;
  font-size: 0.82rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.fin-full__search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 16%, transparent);
}

.fin-full__search-error {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  z-index: 60;
  margin: 0;
  padding: 0.65rem 0.75rem;
  color: var(--color-danger);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.35);
  font-size: 0.75rem;
}

.fin-full__suggest {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  z-index: 60;
  max-height: min(24rem, 60vh);
  overflow-y: auto;
  margin: 0;
  padding: 0.3rem;
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.35);
}

.fin-full__suggest-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.45rem 0.5rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.fin-full__suggest-item:hover,
.fin-full__suggest-item--active {
  background: var(--color-accent-soft);
}

.fin-full__suggest-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 600;
}

.fin-full__suggest-code {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.fin-full__suggest-type {
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-full);
  color: var(--color-accent-strong);
  background: var(--color-accent-soft);
  font-family: var(--font-mono);
  font-size: 0.65rem;
}

.fin-full__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  cursor: pointer;
}

.fin-full__add:hover,
.fin-full__add:focus-visible {
  filter: brightness(1.1);
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

@media (max-width: 1023px) {
  .fin-full__bar {
    gap: var(--space-2);
    padding: 0 var(--space-4);
  }

  .fin-full__search {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .fin-full__indices {
    display: none;
  }
}

@media (max-width: 640px) {
  .fin-full__bar {
    padding: 0 var(--space-3);
  }

  .fin-full__title span {
    display: none;
  }

  .fin-full__color-label {
    display: none;
  }
}
</style>
