<script setup lang="ts">
import { computed } from 'vue'
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

const showLeader = computed(() => props.kind === 'industry')

function pctClass(pct: number): string {
  if (pct > 0) return 'bt__up'
  if (pct < 0) return 'bt__down'
  return ''
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtNetInflow(v: number): string {
  if (!v) return '-'
  const sign = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万亿`
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(1)}亿`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(1)}万`
  return `${sign}${abs.toFixed(1)}`
}
</script>

<template>
  <div class="bt">
    <div class="bt__tabs">
      <button
        type="button"
        class="bt__tab"
        :class="{ 'bt__tab--active': kind === 'industry' }"
        @click="emit('setKind', 'industry')"
      >
        行业板块
      </button>
      <button
        type="button"
        class="bt__tab"
        :class="{ 'bt__tab--active': kind === 'concept' }"
        @click="emit('setKind', 'concept')"
      >
        概念板块
      </button>
      <span class="bt__spacer" />
      <button
        type="button"
        class="bt__order"
        :class="{ 'bt__order--active': order === 'up' }"
        @click="emit('setOrder', 'up')"
      >
        涨幅榜
      </button>
      <button
        type="button"
        class="bt__order"
        :class="{ 'bt__order--active': order === 'down' }"
        @click="emit('setOrder', 'down')"
      >
        跌幅榜
      </button>
    </div>

    <div class="bt__table-wrap">
      <table class="bt__table">
        <thead>
          <tr>
            <th class="bt__th bt__th--num">#</th>
            <th class="bt__th">板块</th>
            <th class="bt__th bt__th--num">涨跌幅</th>
            <th v-if="showLeader" class="bt__th">领涨股</th>
            <th class="bt__th bt__th--num">涨/跌家数</th>
            <th class="bt__th bt__th--num">主力净流入</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in rows"
            :key="r.code"
            class="bt__tr"
            @click="emit('select', r)"
          >
            <td class="bt__td bt__td--num bt__td--muted">{{ i + 1 }}</td>
            <td class="bt__td bt__td--name">{{ r.name }}</td>
            <td class="bt__td bt__td--num" :class="pctClass(r.pct)">{{ fmtPct(r.pct) }}</td>
            <td v-if="showLeader" class="bt__td">
              <span class="bt__leader-name">{{ r.leaderName || '—' }}</span>
              <span v-if="r.leaderName" class="bt__leader-pct" :class="pctClass(r.leaderPct)">
                {{ fmtPct(r.leaderPct) }}
              </span>
            </td>
            <td class="bt__td bt__td--num bt__td--muted">
              <span class="bt__up">{{ r.upCount }}</span>
              <span class="bt__slash">/</span>
              <span class="bt__down">{{ r.downCount }}</span>
            </td>
            <td class="bt__td bt__td--num" :class="pctClass(r.netInflow)">{{ fmtNetInflow(r.netInflow) }}</td>
          </tr>
          <tr v-if="!rows.length && !loading">
            <td class="bt__td bt__empty" :colspan="showLeader ? 6 : 5">暂无板块数据</td>
          </tr>
          <tr v-if="!rows.length && loading">
            <td class="bt__td bt__empty" :colspan="showLeader ? 6 : 5">加载中…</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bt {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bt__tabs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.bt__tab,
.bt__order {
  padding: 0.35rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
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
  border-color: transparent;
}

.bt__spacer {
  flex: 1;
}

.bt__table-wrap {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: auto;
}

.bt__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.bt__th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.55rem var(--space-3);
  font-size: 0.74rem;
  font-weight: 600;
  text-align: left;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.bt__th--num,
.bt__td--num {
  text-align: right;
}

.bt__td {
  padding: 0.5rem var(--space-3);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.bt__tr {
  cursor: pointer;
  transition: background 0.12s;
}

.bt__tr:hover {
  background: var(--color-surface-2);
}

.bt__td--muted {
  color: var(--color-text-muted);
}

.bt__td--name {
  font-weight: 600;
  color: var(--color-text);
}

.bt__leader-name {
  color: var(--color-text);
}

.bt__leader-pct {
  margin-left: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.bt__up {
  color: var(--fin-up);
}

.bt__down {
  color: var(--fin-down);
}

.bt__slash {
  color: var(--color-text-muted);
  margin: 0 2px;
}

.bt__empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-muted);
}
</style>
