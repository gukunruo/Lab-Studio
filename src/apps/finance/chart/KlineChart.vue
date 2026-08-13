<script setup lang="ts">
import { computed } from 'vue'
import type { Kline } from '../types'
import { sma, macd, rsi, kdj, boll, volumeRatio, closesOf, volumesOf } from '../indicators'

const props = defineProps<{ klines: Kline[] }>()

// ---- 几何常量 ----
const W = 900
const PAD_R = 60
const PRICE_W = W - PAD_R
const H_MAIN = 300
const H_VOL = 80
const H_MACD = 80
const H_RSI = 80
const H_KDJ = 80
const GAP = 10
const H = H_MAIN + H_VOL + H_MACD + H_RSI + H_KDJ + GAP * 4

const closes = computed(() => closesOf(props.klines))
const volumes = computed(() => volumesOf(props.klines))

// ---- 指标 ----
const ma5 = computed(() => sma(closes.value, 5))
const ma10 = computed(() => sma(closes.value, 10))
const ma20 = computed(() => sma(closes.value, 20))
const ma60 = computed(() => sma(closes.value, 60))
const macdData = computed(() => macd(closes.value))
const rsi6 = computed(() => rsi(closes.value, 6))
const rsi12 = computed(() => rsi(closes.value, 12))
const rsi24 = computed(() => rsi(closes.value, 24))
const kdjData = computed(() => kdj(props.klines))
const bollData = computed(() => boll(closes.value))
const volRatio = computed(() => volumeRatio(volumes.value))

// ---- 几何工具 ----
const n = computed(() => props.klines.length)
const slot = computed(() => (n.value ? PRICE_W / n.value : 0))

function xAt(i: number): number {
  return (i + 0.5) * slot.value
}

function linePath(values: (number | null)[], y: (v: number) => number): string {
  let d = ''
  let pen = false
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v == null) {
      pen = false
      continue
    }
    const x = xAt(i)
    d += pen ? ` L ${x.toFixed(1)} ${y(v).toFixed(1)}` : ` M ${x.toFixed(1)} ${y(v).toFixed(1)}`
    pen = true
  }
  return d
}

// ---- 主图：蜡烛 + 价格轴 ----
const main = computed(() => {
  const ks = props.klines
  if (!ks.length) return null
  let min = Infinity
  let max = -Infinity
  for (const k of ks) {
    min = Math.min(min, k.low)
    max = Math.max(max, k.high)
  }
  // 把 BOLL 上下轨纳入主图纵轴范围
  for (const v of bollData.value.upper) if (v != null) max = Math.max(max, v)
  for (const v of bollData.value.lower) if (v != null) min = Math.min(min, v)
  const pad = (max - min) * 0.05 || 1
  const yMin = min - pad
  const yMax = max + pad
  const y = (p: number) => H_MAIN - ((p - yMin) / (yMax - yMin)) * H_MAIN
  const bodyW = Math.max(1, Math.min(14, slot.value * 0.65))
  const bars = ks.map((k, i) => {
    const cx = xAt(i)
    const up = k.close >= k.open
    return {
      cx,
      up,
      color: up ? 'var(--fin-up)' : 'var(--fin-down)',
      wickX1: cx,
      wickY1: y(k.high),
      wickX2: cx,
      wickY2: y(k.low),
      bodyX: cx - bodyW / 2,
      bodyY: y(Math.max(k.open, k.close)),
      bodyW,
      bodyH: Math.max(1, Math.abs(y(k.open) - y(k.close))),
    }
  })
  const ticks: { y: number; label: string }[] = []
  for (let t = 0; t <= 4; t++) {
    const p = yMax - ((yMax - yMin) / 4) * t
    ticks.push({ y: y(p), label: p.toFixed(2) })
  }
  return { bars, ticks, yMin, yMax, y }
})

const maPaths = computed(() => {
  const y = main.value?.y
  if (!y) return []
  return [
    { d: linePath(ma5.value, y), color: '#f59e0b' },
    { d: linePath(ma10.value, y), color: '#3b82f6' },
    { d: linePath(ma20.value, y), color: '#a855f7' },
    { d: linePath(ma60.value, y), color: '#64748b' },
  ]
})

const bollPaths = computed(() => {
  const y = main.value?.y
  if (!y) return []
  const color = 'var(--fin-boll)'
  return [
    { d: linePath(bollData.value.upper, y), color },
    { d: linePath(bollData.value.mid, y), color },
    { d: linePath(bollData.value.lower, y), color },
  ]
})

// ---- 子图通用缩放 ----
function subScale(min: number, max: number, height: number) {
  const pad = (max - min) * 0.08 || 1
  const lo = min - pad
  const hi = max + pad
  return (v: number) => height - ((v - lo) / (hi - lo)) * height
}

// ---- 成交量 ----
const volOffset = H_MAIN + GAP
const volBars = computed(() => {
  const vs = volumes.value
  if (!vs.length) return []
  let max = 0
  for (const v of vs) max = Math.max(max, v)
  const y = subScale(0, max, H_VOL)
  return props.klines.map((k, i) => {
    const up = k.close >= k.open
    return {
      x: xAt(i) - Math.max(1, slot.value * 0.32),
      y: y(vs[i] ?? 0),
      w: Math.max(1, slot.value * 0.64),
      h: H_VOL - y(vs[i] ?? 0),
      color: up ? 'var(--fin-up)' : 'var(--fin-down)',
    }
  })
})

// ---- MACD ----
const macdOffset = H_MAIN + H_VOL + GAP * 2
const macdPlot = computed(() => {
  const { dif, dea, macd: hist } = macdData.value
  const vals: number[] = []
  for (const v of dif) if (v != null) vals.push(v)
  for (const v of dea) if (v != null) vals.push(v)
  for (const v of hist) if (v != null) vals.push(v)
  let min = Math.min(0, ...vals)
  let max = Math.max(0, ...vals)
  if (!vals.length) { min = -1; max = 1 }
  const y = subScale(min, max, H_MACD)
  const zeroY = y(0)
  const bars = hist.map((h, i) => {
    if (h == null) return null
    return {
      x: xAt(i) - Math.max(1, slot.value * 0.32),
      y: Math.min(y(h), zeroY),
      w: Math.max(1, slot.value * 0.64),
      h: Math.max(1, Math.abs(y(h) - zeroY)),
      up: h >= 0,
    }
  })
  return {
    difD: linePath(dif, y),
    deaD: linePath(dea, y),
    bars,
    zeroY,
  }
})

// ---- RSI ----
const rsiOffset = H_MAIN + H_VOL + H_MACD + GAP * 3
const rsiPlot = computed(() => {
  const y = subScale(0, 100, H_RSI)
  return {
    r6: linePath(rsi6.value, y),
    r12: linePath(rsi12.value, y),
    r24: linePath(rsi24.value, y),
    topY: y(70),
    botY: y(30),
  }
})

// ---- KDJ ----
const kdjOffset = H_MAIN + H_VOL + H_MACD + H_RSI + GAP * 4
const kdjPlot = computed(() => {
  const { k, d, j } = kdjData.value
  const vals: number[] = []
  for (const v of k) if (v != null) vals.push(v)
  for (const v of d) if (v != null) vals.push(v)
  for (const v of j) if (v != null) vals.push(v)
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 100
  const y = subScale(min, max, H_KDJ)
  return {
    kD: linePath(k, y),
    dD: linePath(d, y),
    jD: linePath(j, y),
  }
})

// ---- 量比标注：最近一日量比 ----
const lastVolRatio = computed(() => {
  const vr = volRatio.value
  for (let i = vr.length - 1; i >= 0; i--) {
    if (vr[i] != null) return vr[i]!
  }
  return null
})
</script>

<template>
  <div v-if="klines.length" class="kchart">
    <svg :viewBox="`0 0 ${W} ${H}`" class="kchart__svg" preserveAspectRatio="none">
      <!-- 主图区 -->
      <g v-if="main">
        <rect :width="PRICE_W" :height="H_MAIN" class="kchart__pane" />
        <g v-for="(t, i) in main.ticks" :key="i">
          <line :x1="PRICE_W" :x2="W" :y1="t.y" :y2="t.y" class="kchart__grid" />
          <text :x="PRICE_W + 4" :y="t.y + 3" class="kchart__tick">{{ t.label }}</text>
        </g>
        <g v-for="(b, i) in main.bars" :key="`b${i}`">
          <line :x1="b.wickX1" :y1="b.wickY1" :x2="b.wickX2" :y2="b.wickY2" :stroke="b.color" />
          <rect
            :x="b.bodyX" :y="b.bodyY" :width="b.bodyW" :height="b.bodyH"
            :fill="b.up ? 'none' : b.color" :stroke="b.color" stroke-width="1"
          />
        </g>
        <path v-for="(p, i) in maPaths" :key="`ma${i}`" :d="p.d" fill="none" :stroke="p.color" stroke-width="1.4" />
        <path v-for="(p, i) in bollPaths" :key="`boll${i}`" :d="p.d" fill="none" :stroke="p.color" stroke-width="1" stroke-dasharray="3 3" />
      </g>

      <!-- 成交量 -->
      <g :transform="`translate(0, ${volOffset})`">
        <rect :width="PRICE_W" :height="H_VOL" class="kchart__pane" />
        <rect v-for="(b, i) in volBars" :key="`v${i}`" :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.color" />
      </g>

      <!-- MACD -->
      <g :transform="`translate(0, ${macdOffset})`">
        <rect :width="PRICE_W" :height="H_MACD" class="kchart__pane" />
        <line :x1="0" :x2="PRICE_W" :y1="macdPlot.zeroY" :y2="macdPlot.zeroY" class="kchart__grid" />
        <rect
          v-for="(b, i) in macdPlot.bars" :key="`m${i}`"
          v-show="b" :x="b!.x" :y="b!.y" :width="b!.w" :height="b!.h"
          :fill="b!.up ? 'var(--fin-up)' : 'var(--fin-down)'"
        />
        <path :d="macdPlot.difD" fill="none" stroke="#f59e0b" stroke-width="1.2" />
        <path :d="macdPlot.deaD" fill="none" stroke="#3b82f6" stroke-width="1.2" />
      </g>

      <!-- RSI -->
      <g :transform="`translate(0, ${rsiOffset})`">
        <rect :width="PRICE_W" :height="H_RSI" class="kchart__pane" />
        <line :x1="0" :x2="PRICE_W" :y1="rsiPlot.topY" :y2="rsiPlot.topY" class="kchart__grid kchart__grid--dim" />
        <line :x1="0" :x2="PRICE_W" :y1="rsiPlot.botY" :y2="rsiPlot.botY" class="kchart__grid kchart__grid--dim" />
        <path :d="rsiPlot.r6" fill="none" stroke="#f59e0b" stroke-width="1.2" />
        <path :d="rsiPlot.r12" fill="none" stroke="#3b82f6" stroke-width="1.2" />
        <path :d="rsiPlot.r24" fill="none" stroke="#a855f7" stroke-width="1.2" />
      </g>

      <!-- KDJ -->
      <g :transform="`translate(0, ${kdjOffset})`">
        <rect :width="PRICE_W" :height="H_KDJ" class="kchart__pane" />
        <path :d="kdjPlot.kD" fill="none" stroke="#f59e0b" stroke-width="1.2" />
        <path :d="kdjPlot.dD" fill="none" stroke="#3b82f6" stroke-width="1.2" />
        <path :d="kdjPlot.jD" fill="none" stroke="#a855f7" stroke-width="1.2" />
      </g>
    </svg>

    <div class="kchart__legend">
      <span class="kchart__legend-item"><i style="background:#f59e0b" />MA5</span>
      <span class="kchart__legend-item"><i style="background:#3b82f6" />MA10</span>
      <span class="kchart__legend-item"><i style="background:#a855f7" />MA20</span>
      <span class="kchart__legend-item"><i style="background:#64748b" />MA60</span>
      <span class="kchart__legend-item"><i class="kchart__legend-dash" />BOLL</span>
      <span v-if="lastVolRatio != null" class="kchart__legend-item">
        量比 <b>{{ lastVolRatio.toFixed(2) }}</b>
      </span>
    </div>
  </div>
  <div v-else class="kchart kchart--empty">暂无 K 线数据</div>
</template>

<style scoped lang="scss">
.kchart {
  --fin-up: #dc2626;
  --fin-down: #16a34a;
  --fin-boll: rgba(13, 148, 136, 0.7);
  width: 100%;
}
:global([data-theme='dark']) .kchart {
  --fin-up: #f87171;
  --fin-down: #4ade80;
  --fin-boll: rgba(45, 212, 191, 0.7);
}

.kchart__svg {
  display: block;
  width: 100%;
  height: auto;
}

.kchart__pane {
  fill: var(--color-surface-2);
}

.kchart__grid {
  stroke: var(--color-border);
  stroke-width: 1;
}

.kchart__grid--dim {
  stroke: var(--color-border);
  stroke-dasharray: 2 3;
  opacity: 0.6;
}

.kchart__tick {
  font-family: var(--font-mono);
  font-size: 9px;
  fill: var(--color-text-muted);
}

.kchart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding-top: var(--space-2);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.kchart__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.kchart__legend-item i {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.kchart__legend-item .kchart__legend-dash {
  width: 12px;
  height: 2px;
  border-radius: 0;
  background: var(--fin-boll);
}

.kchart__legend-item b {
  color: var(--color-text);
  font-weight: 600;
}

.kchart--empty {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
}
</style>
