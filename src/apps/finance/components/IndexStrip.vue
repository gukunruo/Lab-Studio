<script setup lang="ts">
import type { Quote } from '../useFinance'

defineProps<{ domestic: Quote[]; overseas: Quote[] }>()
const emit = defineEmits<{ (e: 'select', quote: Quote): void }>()

function pctClass(pct: number): string {
  if (pct > 0) return 'idx__up'
  if (pct < 0) return 'idx__down'
  return ''
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
  <div class="idx">
    <button
      v-for="q in domestic"
      :key="q.symbol"
      type="button"
      class="idx__item"
      @click="emit('select', q)"
    >
      <span class="idx__name">{{ q.name }}</span>
      <span class="idx__price" :class="pctClass(q.pct)">{{ fmtPrice(q.price) }}</span>
      <span class="idx__pct" :class="pctClass(q.pct)">{{ fmtPct(q.pct) }}</span>
    </button>
    <span class="idx__sep" />
    <button
      v-for="q in overseas"
      :key="q.symbol"
      type="button"
      class="idx__item"
      @click="emit('select', q)"
    >
      <span class="idx__name">{{ q.name }}</span>
      <span class="idx__price" :class="pctClass(q.pct)">{{ fmtPrice(q.price) }}</span>
      <span class="idx__pct" :class="pctClass(q.pct)">{{ fmtPct(q.pct) }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.idx {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.35rem var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow-x: auto;
  scrollbar-width: thin;
}

.idx__item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.15rem 0.4rem;
  flex-shrink: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.idx__item:hover {
  background: var(--color-surface-2);
}

.idx__name {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text);
}

.idx__price {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text);
}

.idx__pct {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
}

.idx__up {
  color: var(--fin-up);
}

.idx__down {
  color: var(--fin-down);
}

.idx__sep {
  width: 1px;
  align-self: stretch;
  margin: 0 var(--space-1);
  background: var(--color-border);
}
</style>
