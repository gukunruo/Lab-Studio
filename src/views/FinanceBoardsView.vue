<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { PhArrowLeft, PhChartLineUp, PhMagnifyingGlassPlus, PhMagnifyingGlassMinus, PhArrowsOutSimple } from '@phosphor-icons/vue'
import { boardPageQuery, createBoardPageState, heatmapAvailability, squarify, type BoardKind, type TreemapItem } from '@/apps/finance/boards'
import type { BoardResponseMeta, BoardRow } from '@/apps/finance/types'

const route = useRoute()
const router = useRouter()
const state = computed(() => createBoardPageState(route.query as Record<string, unknown>))
const rows = ref<BoardRow[]>([])
const meta = ref<BoardResponseMeta | null>(null)
const loading = ref(false)
const error = ref('')
const selectedBoardCode = ref('')
const containerEl = ref<HTMLElement | null>(null)
const containerSize = ref({ w: 1200, h: 600 })
let sequence = 0
let resizeObserver: ResizeObserver | null = null

const MIN_ZOOM = 1
const MAX_ZOOM = 10
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
let isDragging = false
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }

const treemapTransform = computed(() => `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`)
const zoomPct = computed(() => Math.round(zoom.value * 100))

interface CellTextScale { showName: boolean; showPct: boolean; showLeader: boolean; nameSize: number; pctSize: number }
const NO_TEXT: CellTextScale = { showName: false, showPct: false, showLeader: false, nameSize: 0, pctSize: 0 }

function cellTextScale(w: number, h: number): CellTextScale {
  const minDim = Math.min(w, h)
  const area = w * h
  if (area < 360) return NO_TEXT
  if (minDim < 28) return { showName: false, showPct: true, showLeader: false, nameSize: 0, pctSize: Math.max(7, minDim * 0.28) }
  const nameSize = Math.min(16, Math.max(8, minDim * 0.15))
  const pctSize = Math.min(14, Math.max(7, minDim * 0.12))
  return { showName: true, showPct: true, showLeader: h > 55 && w > 75, nameSize, pctSize }
}

const weights = computed(() => rows.value.map((r) => r.weight ?? 1))
const heatAvailable = computed(() => heatmapAvailability(rows.value, meta.value?.weight))

const treemapItems = computed<TreemapItem[]>(() => {
  if (!heatAvailable.value.available) return []
  const { w, h } = containerSize.value
  if (w < 10 || h < 10) return []
  return squarify(rows.value.map((r) => ({ weight: r.weight ?? 1 })), { x: 0, y: 0, w, h })
})

const treemapWithRows = computed(() =>
  treemapItems.value
    .map((item) => ({ item, row: rows.value[item.index], text: cellTextScale(item.w, item.h) }))
    .filter((entry): entry is { item: TreemapItem; row: BoardRow; text: CellTextScale } => Boolean(entry.row))
    .sort((a, b) => b.row.pct - a.row.pct),
)

const stats = computed(() => {
  if (!rows.value.length) return null
  const up = rows.value.filter((r) => r.pct > 0).length
  const down = rows.value.filter((r) => r.pct < 0).length
  const flat = rows.value.length - up - down
  const maxPct = Math.max(...rows.value.map((r) => r.pct))
  const minPct = Math.min(...rows.value.map((r) => r.pct))
  return { up, down, flat, maxPct, minPct, total: rows.value.length }
})

const maxAbsPct = computed(() => {
  if (!rows.value.length) return 1
  return Math.max(...rows.value.map((r) => Math.abs(r.pct)), 0.1)
})

function pctColor(pct: number): string {
  const intensity = Math.min(Math.abs(pct) / maxAbsPct.value, 1)
  if (pct > 0) {
    const alpha = 0.15 + intensity * 0.75
    return `rgba(224, 58, 62, ${alpha})`
  }
  if (pct < 0) {
    const alpha = 0.15 + intensity * 0.75
    return `rgba(34, 160, 100, ${alpha})`
  }
  return 'rgba(80, 80, 90, 0.3)'
}

function pctTextColor(pct: number): string {
  return pct > 0 ? '#ff6b6b' : pct < 0 ? '#51cf66' : '#adb5bd'
}

function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtWeight(weight: number): string {
  return `${(weight * 100).toFixed(1)}%`
}

function selectRow(row: BoardRow) {
  selectedBoardCode.value = row.code
}

function clampPan() {
  const { w, h } = containerSize.value
  const maxX = 0
  const minX = w - w * zoom.value
  const maxY = 0
  const minY = h - h * zoom.value
  pan.value.x = Math.min(maxX, Math.max(minX, pan.value.x))
  pan.value.y = Math.min(maxY, Math.max(minY, pan.value.y))
}

function setZoom(newZoom: number, centerX: number, centerY: number) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
  if (clamped === zoom.value) return
  const { w, h } = containerSize.value
  const scaleRatio = clamped / zoom.value
  pan.value.x = centerX - (centerX - pan.value.x) * scaleRatio
  pan.value.y = centerY - (centerY - pan.value.y) * scaleRatio
  zoom.value = clamped
  clampPan()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const rect = containerEl.value?.getBoundingClientRect()
  if (!rect) return
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const delta = -e.deltaY
  const factor = delta > 0 ? 1.15 : 1 / 1.15
  setZoom(zoom.value * factor, cx, cy)
}

function onPointerDown(e: PointerEvent) {
  if (zoom.value <= 1 && e.button === 0) return
  isDragging = true
  dragStart = { x: e.clientX, y: e.clientY, panX: pan.value.x, panY: pan.value.y }
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging) return
  pan.value.x = dragStart.panX + (e.clientX - dragStart.x)
  pan.value.y = dragStart.panY + (e.clientY - dragStart.y)
  clampPan()
}

function onPointerUp(e: PointerEvent) {
  isDragging = false
  ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function onDoubleClick(e: MouseEvent) {
  const rect = containerEl.value?.getBoundingClientRect()
  if (!rect) return
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  setZoom(zoom.value >= 4 ? 1 : zoom.value * 2.5, cx, cy)
}

function zoomIn() {
  const { w, h } = containerSize.value
  setZoom(zoom.value * 1.4, w / 2, h / 2)
}

function zoomOut() {
  const { w, h } = containerSize.value
  setZoom(zoom.value / 1.4, w / 2, h / 2)
}

function resetZoom() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}

function updateQuery(kind: BoardKind, order: 'up' | 'down') {
  void router.replace({ query: boardPageQuery({ kind, order, view: 'heatmap' }) })
}

function setKind(kind: BoardKind) {
  resetZoom()
  updateQuery(kind, state.value.order)
}

async function loadBoards() {
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/finance/boards/${state.value.kind}?order=${state.value.order}`, { credentials: 'include' })
    const data = (await res.json().catch(() => null)) as { items?: BoardRow[]; meta?: BoardResponseMeta; error?: string } | null
    if (!res.ok) throw new Error(data?.error ?? '板块数据暂时不可用')
    if (current === sequence) {
      rows.value = data?.items ?? []
      meta.value = data?.meta ?? null
      selectedBoardCode.value = ''
      resetZoom()
    }
  } catch (e) {
    if (current !== sequence) return
    rows.value = []
    meta.value = null
    selectedBoardCode.value = ''
    error.value = e instanceof Error ? e.message : '板块数据暂时不可用'
  } finally {
    if (current === sequence) loading.value = false
  }
}

watch(() => [state.value.kind, state.value.order], loadBoards, { immediate: true })

watch(containerEl, (el, oldEl) => {
  if (oldEl && resizeObserver) resizeObserver.unobserve(oldEl)
  if (!el) return
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerSize.value = { w: entry.contentRect.width, h: entry.contentRect.height }
      }
    })
  }
  resizeObserver.observe(el)
}, { flush: 'post' })

onUnmounted(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div class="boards-page">
    <header class="boards-page__header">
      <RouterLink to="/finance" class="boards-page__back" aria-label="返回 AI Finance" title="返回 AI Finance">
        <PhArrowLeft :size="18" />
      </RouterLink>
      <div class="boards-page__title">
        <PhChartLineUp :size="18" weight="bold" />
        <div>
          <h1>板块跟踪</h1>
          <p>行业与概念实时热力图</p>
        </div>
      </div>
      <div v-if="stats" class="boards-page__stats">
        <span class="boards-page__stat boards-page__stat--up">{{ stats.up }} 涨</span>
        <span class="boards-page__stat boards-page__stat--down">{{ stats.down }} 跌</span>
        <span class="boards-page__stat boards-page__stat--flat">{{ stats.flat }} 平</span>
        <span class="boards-page__stat-total">共 {{ stats.total }}</span>
      </div>
    </header>

    <div class="boards-page__toolbar">
      <div class="boards-page__tabs" aria-label="板块分类">
        <button type="button" :class="{ 'boards-page__tab--active': state.kind === 'industry' }" @click="setKind('industry')">行业</button>
        <button type="button" :class="{ 'boards-page__tab--active': state.kind === 'concept' }" @click="setKind('concept')">概念</button>
      </div>
      <div class="boards-page__legend">
        <span class="boards-page__legend-item">
          <i class="boards-page__legend-swatch boards-page__legend-swatch--area" />
          面积 = {{ meta?.weight.weightCoverageLabel ?? '权重' }}
        </span>
        <span class="boards-page__legend-item">
          <i class="boards-page__legend-swatch boards-page__legend-swatch--color" />
          颜色 = 涨跌幅
        </span>
        <span v-if="meta?.weight.tradeDate" class="boards-page__legend-item boards-page__legend-meta">{{ meta.weight.tradeDate }}</span>
      </div>
    </div>

    <main class="boards-page__body">
      <div v-if="loading" class="boards-page__loading" role="status">加载中...</div>
      <div v-else-if="error" class="boards-page__error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="loadBoards">重试</button>
      </div>
      <div v-else-if="!heatAvailable.available" class="boards-page__notice" role="status">{{ heatAvailable.reason }}</div>
      <div v-else ref="containerEl" class="boards-page__treemap" :class="{ 'boards-page__treemap--zoomed': zoom > 1 }" aria-label="板块热力图" @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @dblclick="onDoubleClick">
        <div class="boards-page__treemap-content" :style="{ transform: treemapTransform }">
          <button
            v-for="entry in treemapWithRows"
            :key="entry.row.code"
            type="button"
            class="boards-page__cell"
            :class="{ 'boards-page__cell--selected': entry.row.code === selectedBoardCode }"
            :style="{
              left: `${entry.item.x}px`,
              top: `${entry.item.y}px`,
              width: `${entry.item.w}px`,
              height: `${entry.item.h}px`,
              backgroundColor: pctColor(entry.row.pct),
            }"
            :aria-label="`${entry.row.name}，涨跌幅 ${fmtPct(entry.row.pct)}，权重 ${fmtWeight(entry.item.weight)}${entry.row.leaderName ? '，领涨 ' + entry.row.leaderName : ''}`"
            @click="selectRow(entry.row)"
          >
            <span v-if="entry.text.showName" class="boards-page__cell-name" :style="{ color: pctTextColor(entry.row.pct), fontSize: `${entry.text.nameSize}px` }">{{ entry.row.name }}</span>
            <span v-if="entry.text.showPct" class="boards-page__cell-pct" :style="{ color: pctTextColor(entry.row.pct), fontSize: `${entry.text.pctSize}px` }">{{ fmtPct(entry.row.pct) }}</span>
            <span v-if="entry.row.leaderName && entry.text.showLeader" class="boards-page__cell-leader">{{ entry.row.leaderName }}</span>
          </button>
        </div>
        <div class="boards-page__zoom-controls">
          <button type="button" class="boards-page__zoom-btn" title="放大" @click="zoomIn">
            <PhMagnifyingGlassPlus :size="16" />
          </button>
          <span class="boards-page__zoom-level">{{ zoomPct }}%</span>
          <button type="button" class="boards-page__zoom-btn" title="缩小" @click="zoomOut">
            <PhMagnifyingGlassMinus :size="16" />
          </button>
          <button v-if="zoom > 1" type="button" class="boards-page__zoom-btn boards-page__zoom-btn--reset" title="重置" @click="resetZoom">
            <PhArrowsOutSimple :size="16" />
          </button>
        </div>
      </div>
    </main>

    <div v-if="selectedBoardCode" class="boards-page__detail">
      <template v-for="row in rows" :key="row.code">
        <div v-if="row.code === selectedBoardCode" class="boards-page__detail-content">
          <span class="boards-page__detail-name">{{ row.name }}</span>
          <span class="boards-page__detail-pct" :style="{ color: pctTextColor(row.pct) }">{{ fmtPct(row.pct) }}</span>
          <span v-if="row.leaderName" class="boards-page__detail-leader">领涨 {{ row.leaderName }} {{ fmtPct(row.leaderPct) }}</span>
          <span v-if="row.upCount || row.downCount" class="boards-page__detail-count">{{ row.upCount }} 涨 / {{ row.downCount }} 跌</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.boards-page {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: #0d1117;
  color: #c9d1d9;
  overflow: hidden;
}

.boards-page__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem;
  height: 52px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.boards-page__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #8b949e;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: var(--color-accent, #2dd4bf);
    background: rgba(45, 212, 191, 0.1);
  }
}

.boards-page__title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-accent, #2dd4bf);

  h1 {
    margin: 0;
    color: #f0f6fc;
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.2;
  }

  p {
    margin: 0;
    color: #6e7681;
    font-size: 0.7rem;
  }
}

.boards-page__stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  font-size: 0.75rem;
}

.boards-page__stat {
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  &--up { color: #ff6b6b; }
  &--down { color: #51cf66; }
  &--flat { color: #8b949e; }
}

.boards-page__stat-total {
  color: #6e7681;
  margin-left: 0.25rem;
}

.boards-page__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}

.boards-page__tabs {
  display: inline-flex;
  gap: 2px;
  background: #0d1117;
  border-radius: 6px;
  padding: 2px;

  button {
    padding: 5px 14px;
    color: #8b949e;
    background: transparent;
    border: 0;
    border-radius: 5px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      color: #c9d1d9;
    }
  }

  .boards-page__tab--active {
    color: #f0f6fc;
    background: #21262d;
    font-weight: 600;
  }
}

.boards-page__legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.7rem;
  color: #6e7681;
}

.boards-page__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.boards-page__legend-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;

  &--area {
    background: linear-gradient(135deg, #21262d, #30363d);
    border: 1px solid #484f58;
  }

  &--color {
    background: linear-gradient(90deg, rgba(34, 160, 100, 0.6), rgba(80, 80, 90, 0.3), rgba(224, 58, 62, 0.6));
  }
}

.boards-page__legend-meta {
  color: #8b949e;
  font-variant-numeric: tabular-nums;
}

.boards-page__body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.boards-page__treemap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;

  &--zoomed {
    cursor: grab;
  }

  &--zoomed:active {
    cursor: grabbing;
  }
}

.boards-page__treemap-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
  will-change: transform;
}

.boards-page__zoom-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(22, 27, 34, 0.92);
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 4px;
  z-index: 20;
  backdrop-filter: blur(8px);
}

.boards-page__zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: #8b949e;
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: var(--color-accent, #2dd4bf);
    background: rgba(45, 212, 191, 0.1);
  }
}

.boards-page__zoom-level {
  min-width: 42px;
  text-align: center;
  font-size: 0.7rem;
  color: #8b949e;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.boards-page__cell {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, z-index 0s;

  &:hover {
    border-color: var(--color-accent, #2dd4bf);
    z-index: 10;
  }

  &--selected {
    border-color: var(--color-accent, #2dd4bf);
    z-index: 10;
  }
}

.boards-page__cell-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.boards-page__cell-pct {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.boards-page__cell-leader {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.boards-page__loading,
.boards-page__notice {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6e7681;
  font-size: 0.85rem;
}

.boards-page__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 100%;
  color: #f85149;
  font-size: 0.85rem;

  button {
    padding: 6px 16px;
    color: var(--color-accent, #2dd4bf);
    background: transparent;
    border: 1px solid var(--color-accent, #2dd4bf);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;

    &:hover {
      background: rgba(45, 212, 191, 0.1);
    }
  }
}

.boards-page__detail {
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  background: #161b22;
  border-top: 1px solid #21262d;
  font-size: 0.78rem;
}

.boards-page__detail-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.boards-page__detail-name {
  color: #f0f6fc;
  font-weight: 600;
}

.boards-page__detail-pct {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.boards-page__detail-leader {
  color: #8b949e;
}

.boards-page__detail-count {
  color: #6e7681;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}

@media (max-width: 640px) {
  .boards-page__header {
    padding: 0 0.5rem;
    height: 48px;
  }

  .boards-page__toolbar {
    padding: 0.5rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .boards-page__legend {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .boards-page__stats {
    font-size: 0.7rem;
    gap: 0.3rem;
  }
}
</style>
