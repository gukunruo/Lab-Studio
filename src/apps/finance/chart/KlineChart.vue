<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, dispose, type Chart, type KLineData } from 'klinecharts'
import type { Kline, MinutePoint } from '../types'

const props = defineProps<{ klines: Kline[]; minute: MinutePoint[] }>()
const emit = defineEmits<{ (e: 'periodChange', period: 'day' | 'week' | 'month'): void }>()

const container = ref<HTMLDivElement | null>(null)
let chart: Chart | null = null
let styleObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

type View = 'minute' | 'candle'
const view = ref<View>('candle')
const period = ref<'day' | 'week' | 'month'>('day')
const activeSub = ref<string[]>([])

// 副图指标（主图 MA 常驻，不在此列）
const SUB_INDICATORS = ['VOL', 'MACD', 'KDJ', 'RSI', 'BOLL'] as const
const VIEWS = [
  { key: 'minute', label: '分时' },
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
] as const

function toTimestamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return 0
  // 日线只有日历日期，按 UTC 构造避免跨时区标签偏移一天
  return Date.UTC(y, m - 1, d)
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

function minuteToKLineData(points: MinutePoint[]): KLineData[] {
  const d = new Date()
  const y = d.getFullYear()
  const mo = d.getMonth()
  const day = d.getDate()
  return points.map((p) => {
    const hh = Number(p.time.slice(0, 2)) || 0
    const mm = Number(p.time.slice(2, 4)) || 0
    return {
      timestamp: Date.UTC(y, mo, day, hh, mm),
      open: p.price,
      high: p.price,
      low: p.price,
      close: p.price,
      volume: 0,
    }
  })
}

// 画布无法使用 CSS 变量，需在样式应用时把 token 解析成具体颜色，
// 并监听 documentElement 的 style/data-theme 变更以跟随配色切换。
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function baseStyles() {
  const up = cssVar('--fin-up', '#dc2626')
  const down = cssVar('--fin-down', '#16a34a')
  const noChange = cssVar('--color-text-muted', '#71717a')
  const border = cssVar('--color-border', 'rgba(24, 24, 27, 0.08)')
  const text = cssVar('--color-text', '#18181b')
  const muted = cssVar('--color-text-muted', '#71717a')
  return {
    up,
    down,
    noChange,
    grid: {
      horizontal: { color: border },
      vertical: { color: border },
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
  }
}

function applyStyles() {
  if (!chart) return
  const s = baseStyles()
  const candleType = view.value === 'minute' ? 'area' : 'candle_up_stroke'
  let areaColor = s.up
  if (view.value === 'minute') {
    const pts = props.minute
    if (pts.length > 1 && pts[pts.length - 1]!.price < pts[0]!.price) areaColor = s.down
  }
  chart.setStyles({
    grid: s.grid,
    candle: {
      type: candleType,
      bar: {
        upColor: s.up,
        downColor: s.down,
        noChangeColor: s.noChange,
        upBorderColor: s.up,
        downBorderColor: s.down,
        noChangeBorderColor: s.noChange,
        upWickColor: s.up,
        downWickColor: s.down,
        noChangeWickColor: s.noChange,
      },
      area: { lineColor: areaColor, backgroundColor: areaColor },
      priceMark: { last: { upColor: s.up, downColor: s.down, noChangeColor: s.noChange } },
    },
    indicator: s.indicator,
    xAxis: s.xAxis,
    yAxis: s.yAxis,
    separator: s.separator,
    crosshair: s.crosshair,
  })
}

function dataLoaderFor() {
  const isMinute = view.value === 'minute'
  const data = isMinute ? minuteToKLineData(props.minute) : toKLineData(props.klines)
  return {
    getBars: ({ type, callback }: { type: string; callback: (d: KLineData[], more?: boolean) => void }) => {
      if (type === 'init') callback(data, false)
      else callback([], false)
    },
  }
}

function ensureCandleIndicators() {
  if (!chart) return
  const existing = chart.getIndicators()
  const hasMA = existing.some((i) => i.name === 'MA')
  if (!hasMA) chart.createIndicator({ name: 'MA', calcParams: [5, 10, 20, 60] })
  for (const name of activeSub.value) {
    if (!existing.some((i) => i.name === name)) chart.createIndicator(name)
  }
}

function clearIndicators() {
  if (!chart) return
  for (const i of chart.getIndicators()) chart.removeIndicator({ id: i.id })
}

function reload() {
  if (!chart) return
  if (view.value === 'minute') {
    clearIndicators()
  } else {
    ensureCandleIndicators()
  }
  applyStyles()
  chart.setSymbol({ ticker: 'X', pricePrecision: pricePrecision(), volumePrecision: 0 })
  chart.setDataLoader(dataLoaderFor())
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

function selectPeriod(key: 'minute' | 'day' | 'week' | 'month') {
  if (key === 'minute') {
    view.value = 'minute'
    reload()
    return
  }
  const wasMinute = view.value === 'minute'
  view.value = 'candle'
  if (period.value === key && !wasMinute) return
  const changed = period.value !== key
  period.value = key
  if (changed) emit('periodChange', key)
  reload()
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value, { locale: 'zh-CN' })
  if (!chart) return
  ensureCandleIndicators()
  applyStyles()
  reload()

  styleObserver = new MutationObserver(() => applyStyles())
  styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })

  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

watch(
  () => props.klines,
  () => {
    if (view.value === 'candle') reload()
  },
)

watch(
  () => props.minute,
  () => {
    if (view.value === 'minute') reload()
  },
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
          v-for="p in VIEWS"
          :key="p.key"
          type="button"
          class="kchart__period"
          :class="{ 'kchart__period--active': p.key === 'minute' ? view === 'minute' : view === 'candle' && period === p.key }"
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
    <div v-if="klines.length || minute.length" ref="container" class="kchart__canvas" />
    <div v-else class="kchart__empty">暂无数据</div>
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
