<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dispose, init, type Chart, type Crosshair, type KLineData } from 'klinecharts'
import type { Kline, MinutePoint } from '../types'

const props = defineProps<{ klines: Kline[]; minute: MinutePoint[] }>()
const emit = defineEmits<{ (e: 'periodChange', period: 'day' | 'week' | 'month'): void }>()

type View = 'minute' | 'candle'
type SubIndicator = 'VOL' | 'MACD' | 'KDJ' | 'RSI' | 'BOLL'
type ChartData = KLineData & { date?: string; change?: number; pct?: number }
type MAPeriod = 5 | 10 | 20 | 60
type IndicatorResult = Record<string, number | undefined>
type IndicatorReading = { label: string; value: number; compact?: boolean }

const MA_PERIODS: MAPeriod[] = [5, 10, 20, 60]
const CANDLE_PANE_ID = 'candle_pane'

const container = ref<HTMLDivElement | null>(null)
const view = ref<View>('candle')
const period = ref<'day' | 'week' | 'month'>('day')
const showMA = ref(true)
const enabledMA = ref<Record<MAPeriod, boolean>>({ 5: true, 10: true, 20: true, 60: true })
const activeSub = ref<SubIndicator | null>('VOL')
const hoveredData = ref<ChartData | null>(null)
const hoveredIndex = ref<number | null>(null)
const indicatorReadoutVersion = ref(0)

let chart: Chart | null = null
let styleObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null

const SUB_INDICATORS: SubIndicator[] = ['VOL', 'MACD', 'KDJ', 'RSI', 'BOLL']
const visibleMAPeriods = computed(() =>
  showMA.value ? MA_PERIODS.filter((ma) => enabledMA.value[ma]) : [],
)
const VIEWS = [
  { key: 'minute', label: '分时' },
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
] as const

function toTimestamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return 0
  return Date.UTC(y, m - 1, d)
}

function pricePrecision(): number {
  let max = 0
  for (const k of props.klines) max = Math.max(max, k.close)
  return max > 0 && max < 10 ? 3 : 2
}

function toKLineData(klines: Kline[]): ChartData[] {
  return klines
    .filter((k) => k.date)
    .map((k) => ({
      timestamp: toTimestamp(k.date),
      date: k.date,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      turnover: k.amount,
      change: k.change,
      pct: k.pct,
    }))
}

function minuteToKLineData(points: MinutePoint[]): ChartData[] {
  const d = new Date()
  const y = d.getFullYear()
  const mo = d.getMonth()
  const day = d.getDate()
  const first = points[0]?.price ?? 0
  return points.map((p) => ({
    timestamp: Date.UTC(y, mo, day, Number(p.time.slice(0, 2)) || 0, Number(p.time.slice(2, 4)) || 0),
    date: p.time,
    open: p.price,
    high: p.price,
    low: p.price,
    close: p.price,
    volume: 0,
    turnover: 0,
    change: p.price - first,
    pct: first ? ((p.price - first) / first) * 100 : 0,
  }))
}

function currentData(): ChartData[] {
  return view.value === 'minute' ? minuteToKLineData(props.minute) : toKLineData(props.klines)
}

function latestData(): ChartData | null {
  return currentData().at(-1) ?? null
}

const displayData = computed(() => hoveredData.value ?? latestData())

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function baseStyles() {
  const up = cssVar('--fin-up', '#dc2626')
  const down = cssVar('--fin-down', '#16a34a')
  const noChange = cssVar('--color-text-muted', '#71717a')
  const border = cssVar('--color-border', 'rgba(24, 24, 27, 0.16)')
  const text = cssVar('--color-text', '#18181b')
  const muted = cssVar('--color-text-muted', '#71717a')
  return { up, down, noChange, border, text, muted }
}

function applyStyles() {
  if (!chart) return
  const s = baseStyles()
  const candleType = view.value === 'minute' ? 'area' : 'candle_up_stroke'
  const minuteDown = props.minute.length > 1 && props.minute.at(-1)!.price < props.minute[0]!.price
  const areaColor = minuteDown ? s.down : s.up
  chart.setStyles({
    grid: {
      horizontal: { color: s.border, size: 1, style: 'dashed' },
      vertical: { color: s.border, size: 1, style: 'dashed' },
    },
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
      area: { lineColor: areaColor, backgroundColor: `${areaColor}20` },
      priceMark: { last: { upColor: s.up, downColor: s.down, noChangeColor: s.noChange } },
    },
    indicator: {
      ohlc: { upColor: s.up, downColor: s.down, noChangeColor: s.noChange },
      bars: [{ upColor: s.up, downColor: s.down, noChangeColor: s.noChange }],
      lines: [
        { color: '#f59e0b', size: 1 },
        { color: '#60a5fa', size: 1 },
        { color: '#a78bfa', size: 1 },
        { color: '#f472b6', size: 1 },
      ],
    },
    xAxis: { axisLine: { color: s.border }, tickText: { color: s.muted } },
    yAxis: { axisLine: { color: s.border }, tickText: { color: s.muted } },
    separator: { color: s.border },
    crosshair: {
      horizontal: { line: { color: s.muted, style: 'dashed' }, text: { color: s.text } },
      vertical: { line: { color: s.muted, style: 'dashed' }, text: { color: s.text } },
    },
  })
}

function syncIndicators() {
  if (!chart) return
  indicatorReadoutVersion.value += 1
  for (const indicator of chart.getIndicators()) {
    if (indicator.name === 'MA' || SUB_INDICATORS.includes(indicator.name as SubIndicator)) {
      chart.removeIndicator({ id: indicator.id })
    }
  }
  if (view.value === 'minute') return
  if (visibleMAPeriods.value.length) {
    chart.createIndicator({
      name: 'MA',
      paneId: CANDLE_PANE_ID,
      calcParams: visibleMAPeriods.value,
    })
  }
  if (!activeSub.value) return
  chart.createIndicator(activeSub.value)
  const indicator = chart.getIndicators().find((item) => item.name === activeSub.value)
  if (indicator) chart.setPaneOptions({ id: indicator.paneId, height: 108, minHeight: 84 })
}

function resetReadout() {
  hoveredData.value = latestData()
  hoveredIndex.value = chart ? chart.getDataList().length - 1 : null
  indicatorReadoutVersion.value += 1
}

function reload() {
  if (!chart) return
  syncIndicators()
  applyStyles()
  chart.setDataLoader({ getBars: ({ callback }) => callback(currentData(), false) })
  chart.setSymbol({ ticker: 'X', pricePrecision: pricePrecision(), volumePrecision: 0 })
  chart.setPeriod({ type: view.value === 'minute' ? 'minute' : period.value, span: 1 })
  resetReadout()
  requestAnimationFrame(resetReadout)
}

function toggleMA() {
  if (view.value === 'minute') return
  showMA.value = !showMA.value
  syncIndicators()
  resetReadout()
}

function toggleMAPeriod(period: MAPeriod) {
  if (view.value === 'minute') return
  enabledMA.value[period] = !enabledMA.value[period]
  syncIndicators()
  resetReadout()
}

function toggleSub(name: SubIndicator) {
  if (view.value === 'minute') return
  activeSub.value = activeSub.value === name ? null : name
  syncIndicators()
  resetReadout()
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

function zoom(scale: number) {
  chart?.zoomAtCoordinate(scale)
}

function resetView() {
  chart?.scrollToRealTime(120)
  chart?.setBarSpace(6)
}

function onCrosshairChange(data?: unknown) {
  const crosshair = data as Crosshair | undefined
  let index = crosshair?.realDataIndex ?? crosshair?.dataIndex
  if (typeof index !== 'number' && chart && typeof crosshair?.x === 'number') {
    const [point] = chart.convertFromPixel([{ x: crosshair.x }]) as Array<{ dataIndex?: number }>
    index = point?.dataIndex
  }
  if (typeof index === 'number' && chart) {
    hoveredIndex.value = index
    hoveredData.value = (chart.getDataList()[index] as ChartData | undefined) ?? latestData()
    indicatorReadoutVersion.value += 1
    return
  }
  resetReadout()
}

function currentDataIndex(): number | null {
  if (!chart) return null
  const index = hoveredIndex.value ?? chart.getDataList().length - 1
  return index >= 0 ? index : null
}

function resultFor(name: string): IndicatorResult | null {
  const index = currentDataIndex()
  if (index === null) return null
  const indicator = chart?.getIndicators().find((item) => item.name === name)
  return indicator?.result[index] as IndicatorResult | undefined ?? null
}

const maReadings = computed<IndicatorReading[]>(() => {
  indicatorReadoutVersion.value
  if (view.value === 'minute') return []
  const result = resultFor('MA')
  if (!result) return []
  return visibleMAPeriods.value.flatMap((period, index) => {
    const value = result[`ma${index + 1}`]
    return typeof value === 'number' ? [{ label: `MA${period}`, value }] : []
  })
})

const subReadings = computed<IndicatorReading[]>(() => {
  indicatorReadoutVersion.value
  if (view.value === 'minute' || !activeSub.value) return []
  const result = resultFor(activeSub.value)
  if (!result) return []
  const definitions: Record<SubIndicator, Array<[string, string, boolean?]>> = {
    VOL: [['VOL', 'volume', true]],
    MACD: [['DIF', 'dif'], ['DEA', 'dea'], ['MACD', 'macd']],
    KDJ: [['K', 'k'], ['D', 'd'], ['J', 'j']],
    RSI: [['RSI6', 'rsi1'], ['RSI12', 'rsi2'], ['RSI24', 'rsi3']],
    BOLL: [['UP', 'up'], ['MID', 'mid'], ['DN', 'dn']],
  }
  return definitions[activeSub.value].flatMap(([label, key, compact]) => {
    const value = result[key]
    return typeof value === 'number' ? [{ label, value, compact }] : []
  })
})

function formatNumber(value: number | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
}

function formatCompact(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)}万`
  return value.toFixed(0)
}

function formatDate(data: ChartData | null): string {
  if (!data) return '--'
  if (data.date) return data.date
  return new Date(data.timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function directionClass(value: number | undefined): string {
  if (!value) return ''
  return value > 0 ? 'kchart__up' : 'kchart__down'
}

onMounted(() => {
  if (!container.value) return
  chart = init(container.value, { locale: 'zh-CN' })
  if (!chart) return
  chart.subscribeAction('onCrosshairChange', onCrosshairChange)
  reload()
  styleObserver = new MutationObserver(applyStyles)
  styleObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(container.value)
})

watch(() => props.klines, () => { if (view.value === 'candle') reload() })
watch(() => props.minute, () => { if (view.value === 'minute') reload() })

onBeforeUnmount(() => {
  styleObserver?.disconnect()
  resizeObserver?.disconnect()
  if (chart) {
    chart.unsubscribeAction('onCrosshairChange', onCrosshairChange)
    dispose(container.value!)
    chart = null
  }
})
</script>

<template>
  <div class="kchart">
    <div class="kchart__readout" aria-live="polite">
      <span class="kchart__date">{{ formatDate(displayData) }}</span>
      <span>开 <b>{{ formatNumber(displayData?.open) }}</b></span>
      <span>高 <b class="kchart__up">{{ formatNumber(displayData?.high) }}</b></span>
      <span>低 <b class="kchart__down">{{ formatNumber(displayData?.low) }}</b></span>
      <span>收 <b :class="directionClass(displayData?.change)">{{ formatNumber(displayData?.close) }}</b></span>
      <span>涨跌 <b :class="directionClass(displayData?.change)">{{ formatNumber(displayData?.change) }}</b></span>
      <span>涨幅 <b :class="directionClass(displayData?.pct)">{{ displayData?.pct ? `${displayData.pct > 0 ? '+' : ''}${formatNumber(displayData.pct)}%` : '0.00%' }}</b></span>
      <span>量 <b>{{ formatCompact(displayData?.volume) }}</b></span>
      <span>额 <b>{{ formatCompact(displayData?.turnover) }}</b></span>
      <span v-for="item in maReadings" :key="item.label" class="kchart__reading kchart__reading--ma">
        {{ item.label }} <b>{{ formatNumber(item.value) }}</b>
      </span>
      <span v-for="item in subReadings" :key="item.label" class="kchart__reading kchart__reading--indicator">
        {{ item.label }} <b>{{ item.compact ? formatCompact(item.value) : formatNumber(item.value) }}</b>
      </span>
    </div>

    <div class="kchart__toolbar">
      <div class="kchart__tools">
        <div class="kchart__group" aria-label="周期">
          <button
            v-for="item in VIEWS"
            :key="item.key"
            type="button"
            class="kchart__button"
            :class="{ 'kchart__button--active': item.key === 'minute' ? view === 'minute' : view === 'candle' && period === item.key }"
            @click="selectPeriod(item.key)"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="kchart__group" aria-label="主图指标">
          <button type="button" class="kchart__button" :class="{ 'kchart__button--active': view === 'candle' && showMA }" :disabled="view === 'minute'" title="MA5、MA10、MA20、MA60" @click="toggleMA">
            MA
          </button>
          <button
            v-for="ma in MA_PERIODS"
            :key="ma"
            type="button"
            class="kchart__ma-toggle"
            :class="{ 'kchart__ma-toggle--active': showMA && enabledMA[ma] }"
            :disabled="view === 'minute' || !showMA"
            :aria-pressed="enabledMA[ma]"
            @click="toggleMAPeriod(ma)"
          >
            {{ ma }}
          </button>
        </div>
        <div class="kchart__group" aria-label="技术指标">
          <button
            v-for="name in SUB_INDICATORS"
            :key="name"
            type="button"
            class="kchart__button"
            :class="{ 'kchart__button--active': view === 'candle' && activeSub === name }"
            :disabled="view === 'minute'"
            @click="toggleSub(name)"
          >
            {{ name }}
          </button>
        </div>
      </div>
      <div class="kchart__actions" aria-label="图表视图">
        <button type="button" class="kchart__action" aria-label="缩小K线" title="缩小" @click="zoom(0.8)">−</button>
        <button type="button" class="kchart__action" aria-label="放大K线" title="放大" @click="zoom(1.25)">+</button>
        <button type="button" class="kchart__action kchart__action--reset" title="定位至最新K线并复位缩放" @click="resetView">最新</button>
      </div>
    </div>

    <div v-if="klines.length || minute.length" ref="container" class="kchart__canvas" />
    <div v-else class="kchart__empty">暂无数据</div>
  </div>
</template>

<style scoped lang="scss">
.kchart {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  gap: var(--space-2);
}

.kchart__readout,
.kchart__toolbar,
.kchart__tools,
.kchart__group,
.kchart__actions {
  display: flex;
  align-items: center;
}

.kchart__readout {
  min-height: 1.75rem;
  gap: 0.7rem;
  padding: 0 0.35rem;
  overflow-x: auto;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1;
  scrollbar-width: none;
}

.kchart__readout::-webkit-scrollbar {
  display: none;
}

.kchart__readout span {
  flex-shrink: 0;
}

.kchart__readout b {
  margin-left: 0.18rem;
  color: var(--color-text);
  font-weight: 600;
}

.kchart__date {
  color: var(--color-text) !important;
  font-weight: 700;
}

.kchart__up {
  color: var(--fin-up) !important;
}

.kchart__down {
  color: var(--fin-down) !important;
}

.kchart__toolbar {
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 2rem;
  padding: 0.25rem 0.35rem;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.kchart__tools {
  min-width: 0;
  gap: 0.45rem;
  overflow-x: auto;
  scrollbar-width: thin;
}

.kchart__group,
.kchart__actions {
  flex-shrink: 0;
  gap: 3px;
}

.kchart__group + .kchart__group {
  padding-left: 0.45rem;
  border-left: 1px solid var(--color-border);
}

.kchart__button,
.kchart__action {
  min-height: 1.45rem;
  padding: 0.16rem 0.43rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.kchart__button:hover:not(:disabled),
.kchart__action:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.kchart__button--active {
  border-color: var(--color-border);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.kchart__button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.kchart__ma-toggle {
  min-width: 1.45rem;
  min-height: 1.45rem;
  padding: 0.16rem 0.3rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1;
  cursor: pointer;
}

.kchart__ma-toggle:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.kchart__ma-toggle--active {
  color: var(--color-accent);
}

.kchart__ma-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.kchart__reading--ma b {
  color: var(--color-accent);
}

.kchart__reading--indicator b {
  color: var(--color-text);
}

.kchart__actions {
  padding-left: 0.45rem;
  border-left: 1px solid var(--color-border);
}

.kchart__action {
  min-width: 1.45rem;
  padding-inline: 0.35rem;
  color: var(--color-text);
  font-size: 0.82rem;
}

.kchart__action--reset {
  font-size: 0.66rem;
}

.kchart__canvas {
  width: 100%;
  min-height: 320px;
  flex: 1;
}

.kchart__empty {
  padding: var(--space-12) var(--space-4);
  color: var(--color-text-muted);
  font-size: 0.9rem;
  text-align: center;
}

@media (max-width: 720px) {
  .kchart__readout {
    gap: 0.5rem;
  }

  .kchart__toolbar {
    align-items: flex-start;
  }

  .kchart__actions {
    display: none;
  }
}
</style>
