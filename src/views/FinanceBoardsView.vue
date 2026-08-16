<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { PhArrowLeft, PhChartLine } from '@phosphor-icons/vue'
import BoardTable from '@/apps/finance/components/BoardTable.vue'
import { boardPageQuery, createBoardPageState, heatmapAvailability, heatmapFlexWeights, type BoardKind, type BoardOrder, type BoardWeightMeta } from '@/apps/finance/boards'
import type { BoardResponseMeta, BoardRow } from '@/apps/finance/types'

const route = useRoute()
const router = useRouter()
const state = computed(() => createBoardPageState(route.query as Record<string, unknown>))
const rows = ref<BoardRow[]>([])
const meta = ref<BoardResponseMeta | null>(null)
const loading = ref(false)
const error = ref('')
const selectedBoardCode = ref('')
const heatmapRows = computed(() => rows.value)
const weightMeta = computed<BoardWeightMeta | undefined>(() => meta.value?.weight)
const heatmap = computed(() => heatmapAvailability(heatmapRows.value, weightMeta.value))
const heatmapWeights = computed(() => heatmapFlexWeights(heatmapRows.value, weightMeta.value))
const selectedRow = computed(() => rows.value.find((row) => row.code === selectedBoardCode.value) ?? null)
let sequence = 0

function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtMarketCap(row: BoardRow): string {
  if (!Number.isFinite(row.marketCap)) return '—'
  return `${row.marketCap!.toLocaleString('zh-CN')} ${row.marketCapUnit ?? '万元'}`
}

function fmtWeight(weight: number): string {
  return `${(weight * 100).toFixed(2)}%`
}

function selectRow(row: BoardRow) {
  selectedBoardCode.value = row.code
}

function updateQuery(kind: BoardKind, order: BoardOrder, view = state.value.view) {
  void router.replace({ query: boardPageQuery({ kind, order, view }) })
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

function setKind(kind: BoardKind) {
  updateQuery(kind, state.value.order)
}

function setOrder(order: BoardOrder) {
  updateQuery(state.value.kind, order)
}

function setView(view: 'list' | 'heatmap') {
  if (view === 'heatmap' && !heatmap.value.available) return
  updateQuery(state.value.kind, state.value.order, view)
}

watch(() => [state.value.kind, state.value.order], loadBoards, { immediate: true })
</script>

<template>
  <div class="boards-page">
    <header class="boards-page__header">
      <RouterLink to="/finance" class="boards-page__back" aria-label="返回金融终端" title="返回金融终端">
        <PhArrowLeft :size="18" />
      </RouterLink>
      <div class="boards-page__title">
        <PhChartLine :size="18" weight="bold" />
        <div>
          <h1>板块研究</h1>
          <p>行业与概念排行</p>
        </div>
      </div>
      <div class="boards-page__modes" aria-label="板块视图">
        <button
          class="boards-page__mode"
          :class="{ 'boards-page__mode--active': state.view === 'list' }"
          type="button"
          @click="setView('list')"
        >列表</button>
        <button
          class="boards-page__mode"
          :class="{ 'boards-page__mode--active': state.view === 'heatmap' }"
          type="button"
          :disabled="!heatmap.available"
          :title="heatmap.available ? '按真实权重展示' : heatmap.reason"
          @click="setView('heatmap')"
        >热力图</button>
      </div>
    </header>

    <main class="boards-page__main">
      <div class="boards-page__legend" aria-label="热力图图例">
        <span class="boards-page__legend-title">板块跟踪</span>
        <span>面积 = 成员总市值</span>
        <span>颜色 = 涨跌幅</span>
        <span v-if="meta?.weight.tradeDate">交易日 {{ meta.weight.tradeDate }}</span>
        <span v-if="meta?.weight.status === 'available'">来源 {{ meta.weight.source }}</span>
      </div>
      <div v-if="!heatmap.available" class="boards-page__notice" role="status">
        {{ heatmap.reason }}
      </div>
      <div v-if="error" class="boards-page__error" role="alert">
        <strong>板块数据暂时不可用</strong>
        <span>{{ error }}</span>
        <button type="button" @click="loadBoards">重试</button>
      </div>
      <div v-else-if="state.view === 'heatmap' && heatmap.available" class="boards-page__heatmap" aria-label="板块权重热力图">
        <button
          v-for="(row, index) in heatmapRows"
          :key="row.code"
          type="button"
          class="boards-page__heatmap-cell"
          :class="{ 'boards-page__heatmap-cell--up': row.pct > 0, 'boards-page__heatmap-cell--down': row.pct < 0, 'boards-page__heatmap-cell--selected': row.code === selectedBoardCode }"
          :style="{ flex: `${heatmapWeights[index] ?? 0} 1 0%` }"
          :aria-label="`${row.name}，涨跌幅 ${fmtPct(row.pct)}，权重 ${fmtWeight(heatmapWeights[index] ?? 0)}，市值 ${fmtMarketCap(row)}，成员覆盖 ${row.coveredMemberCount}/${row.memberCount}，交易日 ${row.weightTradeDate}`"
          @click="selectRow(row)"
        >
          <strong>{{ row.name }}</strong>
          <span>{{ fmtPct(row.pct) }}</span>
          <small>权重 {{ fmtWeight(heatmapWeights[index] ?? 0) }}</small>
          <small>{{ fmtMarketCap(row) }}</small>
          <small>{{ row.coveredMemberCount }}/{{ row.memberCount }} 成员 · {{ row.weightTradeDate }}</small>
        </button>
      </div>
      <div v-if="selectedRow" class="boards-page__selection" role="status">
        已选择：{{ selectedRow.name }}（{{ selectedRow.code }}）
      </div>
      <BoardTable
        v-if="state.view !== 'heatmap'"
        :kind="state.kind"
        :order="state.order"
        :rows="rows"
        :loading="loading"
        @set-kind="setKind"
        @set-order="setOrder"
        @select="selectRow"
      />
      <div v-if="state.view === 'heatmap' && heatmap.available" class="boards-page__table-fallback">
        <button type="button" @click="setView('list')">切换列表查看精确数据</button>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.boards-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.boards-page__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 64px;
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.boards-page__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  color: var(--color-text-muted);
  border-radius: var(--radius-sm);
}

.boards-page__back:hover {
  color: var(--color-accent);
  background: var(--color-accent-soft);
}

.boards-page__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-accent);
}

.boards-page__title h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 1rem;
}

.boards-page__title p {
  margin: 0.15rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.boards-page__modes {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.boards-page__mode {
  padding: 0.4rem 0.8rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.boards-page__mode--active {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.boards-page__mode:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.boards-page__main {
  width: min(100%, 1180px);
  flex: 1;
  min-height: 0;
  margin: 0 auto;
  padding: var(--space-5);
}

.boards-page__legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem 0.9rem;
  margin-bottom: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.boards-page__legend-title {
  color: var(--color-text);
  font-weight: 700;
}

.boards-page__heatmap {
  display: flex;
  gap: 0.3rem;
  min-height: 420px;
  padding: 0.3rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.boards-page__heatmap-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.75rem;
  color: var(--color-text);
  background: var(--color-surface-2);
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
}

.boards-page__heatmap-cell--up {
  background: color-mix(in srgb, var(--fin-up) 18%, var(--color-surface));
}

.boards-page__heatmap-cell--down {
  background: color-mix(in srgb, var(--fin-down) 18%, var(--color-surface));
}

.boards-page__heatmap-cell:hover,
.boards-page__heatmap-cell:focus-visible,
.boards-page__heatmap-cell--selected {
  border-color: var(--color-accent);
  outline: none;
}

.boards-page__heatmap-cell strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boards-page__heatmap-cell span {
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 700;
}

.boards-page__heatmap-cell small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boards-page__selection,
.boards-page__table-fallback {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.boards-page__table-fallback button {
  padding: 0.35rem 0.65rem;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.boards-page__notice {
  margin-bottom: var(--space-3);
  padding: 0.65rem 0.8rem;
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
}

.boards-page__error {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: var(--space-6);
  color: var(--color-danger);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: center;
}

.boards-page__error span {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.boards-page__error button {
  align-self: center;
  padding: 0.35rem 0.8rem;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-full);
  cursor: pointer;
}

@media (max-width: 640px) {
  .boards-page__header {
    padding: 0 var(--space-3);
  }

  .boards-page__main {
    padding: var(--space-3);
  }
}
</style>
