<script setup lang="ts">
import type { BoardRow } from '../types'

const props = defineProps<{
  kind: 'industry' | 'concept'
  order: 'up' | 'down'
  rows: BoardRow[]
  loading: boolean
}>()
const emit = defineEmits<{
  (e: 'setKind', kind: 'industry' | 'concept'): void
  (e: 'setOrder', order: 'up' | 'down'): void
  (e: 'select', row: BoardRow): void
}>()

function pctClass(pct: number): string {
  if (pct > 0) return 'bt__up'
  if (pct < 0) return 'bt__down'
  return ''
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}
</script>

<template>
  <div class="bt">
    <div class="bt__head">
      <span class="bt__title">板块行情</span>
    </div>
    <div class="bt__tabs">
      <button
        type="button"
        class="bt__tab"
        :class="{ 'bt__tab--active': kind === 'industry' }"
        @click="emit('setKind', 'industry')"
      >
        行业
      </button>
      <button
        type="button"
        class="bt__tab"
        :class="{ 'bt__tab--active': kind === 'concept' }"
        @click="emit('setKind', 'concept')"
      >
        概念
      </button>
      <span class="bt__spacer" />
      <button
        type="button"
        class="bt__order"
        :class="{ 'bt__order--active': order === 'up' }"
        @click="emit('setOrder', 'up')"
      >
        涨幅
      </button>
      <button
        type="button"
        class="bt__order"
        :class="{ 'bt__order--active': order === 'down' }"
        @click="emit('setOrder', 'down')"
      >
        跌幅
      </button>
    </div>

    <div class="bt__list">
      <button
        v-for="(r, i) in rows"
        :key="r.code"
        type="button"
        class="bt__row"
        @click="emit('select', r)"
      >
        <span class="bt__rank">{{ i + 1 }}</span>
        <span class="bt__name">{{ r.name }}</span>
        <span class="bt__pct" :class="pctClass(r.pct)">{{ fmtPct(r.pct) }}</span>
      </button>
      <div v-if="!rows.length && !loading" class="bt__empty">暂无板块数据</div>
      <div v-if="!rows.length && loading" class="bt__empty">加载中…</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bt {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.bt__head {
  padding: 0.6rem 0.75rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.bt__title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.bt__tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0.4rem 0.6rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}

.bt__tab,
.bt__order {
  padding: 0.2rem 0.55rem;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.bt__tab:hover,
.bt__order:hover {
  color: var(--color-text);
}

.bt__tab--active {
  color: var(--color-on-accent);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.bt__order--active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.bt__spacer {
  flex: 1;
}

.bt__list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.bt__row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.4rem 0.75rem;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.12s;
}

.bt__row:hover {
  background: var(--color-surface-2);
}

.bt__rank {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--color-text-muted);
  min-width: 1.2rem;
}

.bt__name {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bt__pct {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  min-width: 4rem;
  text-align: right;
}

.bt__up {
  color: var(--fin-up);
}

.bt__down {
  color: var(--fin-down);
}

.bt__empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
</style>
