<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, dispose, type Chart, type KLineData } from 'klinecharts'
import type { Kline } from '../types'

const props = defineProps<{ klines: Kline[] }>()
const emit = defineEmits<{ (e: 'periodChange', period: 'day' | 'week' | 'month'): void }>()

const container = ref<HTMLDivElement | null>(null)
let chart: Chart | null = null
let styleObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

const period = ref<'day' | 'week' | 'month'>('day')
const activeSub = ref<string[]>([])

// 副图指标（主图 MA 常驻，不在此列）
const SUB_INDICATORS = ['VOL', 'MACD', 'KDJ', 'RSI', 'BOLL'] as const
const PERIODS = [
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
] as const

function toTimestamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return 0
  return new Date(y, m - 1, d).getTime()
}

function pricePrecision(): number {
  let max = 0
  for (const k of props.klines) max = Math.max(max, k.close)
  return max > 0 && max < 10 ? 3 : 2
}

function toKLineData(klines: Kline[]): KLineData[] {
  return klines
    .filter((k) => k.date)
    .map((k) => ({
      timestamp: toTimestamp(k.date),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      turnover: k.amount,
    }))
}

// 画布无法使用 CSS 变量，需在样式应用时把 token 解析成具体颜色，
// 并监听 documentElement 的 style/data-theme 变更以跟随配色切换。
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function applyStyles() {
  if (!chart) return
  const up = cssVar('--fin-up', '#dc2626')
  const down = cssVar('--fin-down', '#16a34a')
  const noChange = cssVar('--color-text-muted', '#71717a')
  const border = cssVar('--color-border', 'rgba(24, 24, 27, 0.08)')
  const text = cssVar('--color-text', '#18181b')
  const muted = cssVar('--color-text-muted', '#71717a')
  chart.setStyles({
    grid: { horizontal: { color: border }, vertical: { color: border } },
    candle: {
      type: 'candle_up_stroke',
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: noChange,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: noChange,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: noChange,
      },
      priceMark: { last: { upColor: up, downColor: down, noChangeColor: noChange } },
    },
    indicator: {
      ohlc: { upColor: up, downColor: down, noChangeColor: noChange },
      bars: [{ upColor: up, downColor: down, noChangeColor: noChange }],
    },
    xAxis: { axisLine: { color: border }, tickText: { color: muted } },
    yAxis: { axisLine: { color: border }, tickText: { color: muted } },
    separator: { color: border },
    crosshair: {
      horizontal: { line: { color: border }, text: { color: text } },
      vertical: { line: { color: border }, text: { color: text } },
    },
  })
}

const dataLoader = {
  getBars: ({ type, callback }: { type: string; callback: (data: KLineData[], more?: boolean) => void }) => {
    if (type === 'init') callback(toKLineData(props.klines), false)
    else callback([], false)
  },
}

function reload() {
  if (!chart) return
  chart.setSymbol({ ticker: 'X', pricePrecision: pricePrecision(), volumePrecision: 0 })
  chart.setDataLoader(dataLoader)
}

function toggleSub(name: string) {
  if (!chart) return
  if (activeSub.value.includes(name)) {
    chart.removeIndicator({ name })
    activeSub.value = activeSub.value.filter((n) => n !== name)
  } else {
    chart.createIndicator(name)
    activeSub.value = [...activeSub.value, name]
  }
}

function selectPeriod(key: 'day' | 'week' | 'month') {
  if (period.value === key) return
  period.value = key
  emit('periodChange', key)
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value, { locale: 'zh-CN' })
  if (!chart) return
  applyStyles()
  // 常驻主图 MA（沿用旧图 5/10/20/60），副图默认 VOL
  chart.createIndicator({ name: 'MA', calcParams: [5, 10, 20, 60] })
  chart.createIndicator('VOL')
  activeSub.value = ['VOL']
  reload()

  styleObserver = new MutationObserver(() => applyStyles())
  styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })

  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

watch(
  () => props.klines,
  () => reload(),
)

onBeforeUnmount(() => {
  styleObserver?.disconnect()
  resizeObserver?.disconnect()
  if (chart) {
    dispose(container.value!)
    chart = null
  }
})
</script>

<template>
  <div class="kchart">
    <div class="kchart__toolbar">
      <div class="kchart__periods">
        <button
          v-for="p in PERIODS"
          :key="p.key"
          type="button"
          class="kchart__period"
          :class="{ 'kchart__period--active': period === p.key }"
          @click="selectPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="kchart__indicators">
        <button
          v-for="name in SUB_INDICATORS"
          :key="name"
          type="button"
          class="kchart__indicator"
          :class="{ 'kchart__indicator--active': activeSub.includes(name) }"
          @click="toggleSub(name)"
        >
          {{ name }}
        </button>
      </div>
    </div>
    <div v-if="klines.length" ref="container" class="kchart__canvas" />
    <div v-else class="kchart__empty">暂无 K 线数据</div>
  </div>
</template>

<style scoped lang="scss">
.kchart {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.kchart__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.kchart__periods,
.kchart__indicators {
  display: flex;
  align-items: center;
  gap: 4px;
}

.kchart__period,
.kchart__indicator {
  padding: 0.25rem 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.kchart__period:hover,
.kchart__indicator:hover {
  color: var(--color-text);
}

.kchart__period--active {
  color: var(--color-text);
  background: var(--color-surface-2);
  border-color: var(--color-border);
}

.kchart__indicator--active {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.kchart__canvas {
  width: 100%;
  height: 460px;
}

.kchart__empty {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
</style>
