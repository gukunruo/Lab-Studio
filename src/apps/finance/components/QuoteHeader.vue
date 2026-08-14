<script setup lang="ts">
import { computed } from 'vue'
import type { QuoteDetail } from '../types'

const props = defineProps<{ detail: QuoteDetail }>()

function pctClass(pct: number): string {
  if (pct > 0) return 'qhead__up'
  if (pct < 0) return 'qhead__down'
  return ''
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtChange(change: number): string {
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}`
}

function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '-'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return v.toFixed(2)
}

function fmtVol(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '-'
  if (v === 0) return '0'
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿手`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万手`
  return `${v.toFixed(0)}手`
}

function fmtPctOr(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '-'
  return `${v.toFixed(2)}%`
}

const metrics = computed(() => [
  { label: '今开', value: fmtNum(props.detail.open) },
  { label: '最高', value: fmtNum(props.detail.high) },
  { label: '最低', value: fmtNum(props.detail.low) },
  { label: '昨收', value: fmtNum(props.detail.prevClose) },
  { label: '成交量', value: fmtVol(props.detail.volume) },
  { label: '成交额', value: fmtNum(props.detail.amount) },
  { label: '换手率', value: fmtPctOr(props.detail.turnover) },
  { label: '振幅', value: fmtPctOr(props.detail.amplitude) },
  { label: '量比', value: props.detail.volumeRatio ? props.detail.volumeRatio.toFixed(2) : '-' },
])
</script>

<template>
  <div class="qhead">
    <div class="qhead__main">
      <span class="qhead__price" :class="pctClass(detail.pct)">{{ detail.price.toFixed(2) }}</span>
      <span class="qhead__change" :class="pctClass(detail.pct)">
        {{ fmtChange(detail.change) }}&nbsp;&nbsp;{{ fmtPct(detail.pct) }}
      </span>
    </div>
    <dl class="qhead__grid">
      <div v-for="m in metrics" :key="m.label" class="qhead__cell">
        <dt class="qhead__label">{{ m.label }}</dt>
        <dd class="qhead__value">{{ m.value }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped lang="scss">
.qhead {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.qhead__main {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
}

.qhead__price {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}

.qhead__change {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
}

.qhead__up {
  color: var(--fin-up);
}

.qhead__down {
  color: var(--fin-down);
}

.qhead__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2) var(--space-4);
  margin: 0;
}

.qhead__cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--color-border);
}

.qhead__label {
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.qhead__value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--color-text);
}
</style>
