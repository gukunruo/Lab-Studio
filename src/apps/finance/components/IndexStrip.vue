<script setup lang="ts">
import type { Quote } from '../useFinance'

defineProps<{ quotes: Quote[]; selectedCode?: string | null }>()
const emit = defineEmits<{ (e: 'select', quote: Quote): void }>()

function pctClass(pct: number): string {
  if (pct > 0) return 'idx__up'
  if (pct < 0) return 'idx__down'
  return 'idx__flat'
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtPrice(p: number): string {
  return p ? p.toFixed(2) : '-'
}
</script>

<template>
  <div class="idx" role="list" aria-label="市场指数">
    <button
      v-for="q in quotes"
      :key="q.symbol"
      type="button"
      class="idx__item"
      :class="{ 'idx__item--selected': selectedCode === q.code }"
      role="listitem"
      @click="emit('select', q)"
    >
      <span class="idx__name" :title="q.name">{{ q.name }}</span>
      <span class="idx__values">
        <span class="idx__price" :class="pctClass(q.pct)">{{ fmtPrice(q.price) }}</span>
        <span class="idx__pct" :class="pctClass(q.pct)">{{ fmtPct(q.pct) }}</span>
      </span>
    </button>
    <div v-if="!quotes.length" class="idx__empty">暂无可用指数</div>
  </div>
</template>

<style scoped lang="scss">
.idx {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  height: 64px;
  min-height: 64px;
  padding: 0.4rem var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow-x: auto;
  overflow-y: hidden;
  flex-wrap: nowrap;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.idx::-webkit-scrollbar {
  display: none;
}

.idx__item {
  display: flex;
  flex: 0 0 clamp(104px, 11vw, 124px);
  flex-direction: column;
  justify-content: center;
  gap: 0.12rem;
  min-width: 104px;
  padding: 0.35rem 0.55rem;
  color: var(--color-text);
  background: var(--color-surface-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.idx__item:hover,
.idx__item--selected {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
}

.idx__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.1;
}

.idx__values {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3rem;
  min-width: 0;
}

.idx__price,
.idx__pct {
  font-family: var(--font-mono);
  font-size: 0.73rem;
  font-weight: 600;
  white-space: nowrap;
}

.idx__pct {
  font-size: 0.68rem;
}

.idx__up {
  color: var(--fin-up);
}

.idx__down {
  color: var(--fin-down);
}

.idx__flat {
  color: var(--color-text-muted);
}

.idx__empty {
  display: flex;
  align-items: center;
  padding-inline: 0.5rem;
  color: var(--color-text-muted);
  font-size: 0.76rem;
  white-space: nowrap;
}
</style>
