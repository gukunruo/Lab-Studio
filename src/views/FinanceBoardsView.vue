<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { PhArrowLeft, PhChartLine } from '@phosphor-icons/vue'
import BoardTable from '@/apps/finance/components/BoardTable.vue'
import { boardPageQuery, createBoardPageState, heatmapAvailability, heatmapFlexWeights, type BoardKind, type BoardOrder } from '@/apps/finance/boards'
import type { BoardRow } from '@/apps/finance/types'

const route = useRoute()
const router = useRouter()
const state = computed(() => createBoardPageState(route.query as Record<string, unknown>))
const rows = ref<BoardRow[]>([])
const loading = ref(false)
const error = ref('')
const heatmapRows = computed(() => rows.value as Array<BoardRow & { weight?: number; weightProvider?: string; weightSource?: string }>)
const heatmap = computed(() => heatmapAvailability(heatmapRows.value))
const heatmapWeights = computed(() => heatmapFlexWeights(heatmapRows.value))
let sequence = 0

function updateQuery(kind: BoardKind, order: BoardOrder, view = state.value.view) {
  void router.replace({ query: boardPageQuery({ kind, order, view }) })
}

async function loadBoards() {
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/api/finance/boards/${state.value.kind}?order=${state.value.order}`, { credentials: 'include' })
    const data = (await res.json().catch(() => null)) as { items?: BoardRow[]; error?: string } | null
    if (!res.ok) throw new Error(data?.error ?? '板块数据暂时不可用')
    if (current === sequence) rows.value = data?.items ?? []
  } catch (e) {
    if (current !== sequence) return
    rows.value = []
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
          :style="{ flex: `${heatmapWeights[index] ?? 0} 1 0%` }"
          @click="() => undefined"
        >
          <strong>{{ row.name }}</strong>
          <span>{{ row.pct > 0 ? '+' : '' }}{{ row.pct.toFixed(2) }}%</span>
        </button>
      </div>
      <BoardTable
        v-else
        :kind="state.kind"
        :order="state.order"
        :rows="rows"
        :loading="loading"
        @set-kind="setKind"
        @set-order="setOrder"
        @select="() => undefined"
      />
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
  gap: 0.4rem;
  padding: 0.75rem;
  color: var(--color-text);
  background: var(--color-accent-soft);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
}

.boards-page__heatmap-cell:hover {
  border-color: var(--color-accent);
}

.boards-page__heatmap-cell strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.boards-page__heatmap-cell span {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.8rem;
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
