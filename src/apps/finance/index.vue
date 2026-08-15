<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { marked } from 'marked'
import { PhMagnifyingGlass, PhPlus, PhX, PhSparkle, PhStop, PhCaretDown, PhCaretUp } from '@phosphor-icons/vue'
import { getAiConfig, streamChat, type ChatMessage } from '@/learn/ai'
import { useFinance, itemToSymbol, clampSplitterWidth, type Quote, type WatchItem } from './useFinance'
import type { ChartPrefs, SearchItem } from './types'
import KlineChart from './chart/KlineChart.vue'
import QuoteHeader from './components/QuoteHeader.vue'
import IndexStrip from './components/IndexStrip.vue'
import BoardTable from './components/BoardTable.vue'
import ResizeGutter from '@/components/ResizeGutter.vue'

const finance = useFinance()

const domesticBoards = computed(() => finance.boards.value?.domestic ?? [])
const overseasBoards = computed(() => finance.boards.value?.overseas ?? [])

const activeIndex = ref(-1)
const analyzing = ref(false)
const aiText = ref('')
const aiError = ref('')
const aiAvailable = ref(false)
const aiExpanded = ref(true)
const watchlistCollapsed = ref(false)
const leftDrawerOpen = ref(false)
const rightDrawerOpen = ref(false)
const leftWidth = ref(210)
const rightWidth = ref(280)
const LEFT_MIN = 200
const LEFT_MAX = 360
const RIGHT_MIN = 280
const RIGHT_MAX = 480
const workspaceTab = ref<'ai' | 'boards' | 'settings'>('ai')
const colorSchemeLabel = ref('中国市场')
const chartPrefs = ref<ChartPrefs | undefined>(undefined)
let prefsLoaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null

const renderedAi = computed(() => marked.parse(aiText.value, { async: false }) as string)

function pctClass(pct: number): string {
  if (pct > 0) return 'fin__up'
  if (pct < 0) return 'fin__down'
  return ''
}

function onLeftResize(w: number) {
  leftWidth.value = clampSplitterWidth(w, LEFT_MIN, LEFT_MAX)
}
function onRightResize(w: number) {
  rightWidth.value = clampSplitterWidth(w, RIGHT_MIN, RIGHT_MAX)
}

const anyDrawerOpen = computed(() => leftDrawerOpen.value || rightDrawerOpen.value)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    leftDrawerOpen.value = false
    rightDrawerOpen.value = false
  }
}

watch(anyDrawerOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
  if (saveTimer) clearTimeout(saveTimer)
})

function currentLayoutPrefs() {
  return {
    leftCollapsed: watchlistCollapsed.value,
    leftWidth: leftWidth.value,
    rightWidth: rightWidth.value,
    rightPanel: workspaceTab.value,
    chartView: chartPrefs.value?.chartView ?? 'candle',
    candlePeriod: chartPrefs.value?.candlePeriod ?? 'day',
    interval: chartPrefs.value?.interval ?? '5',
    showMA: chartPrefs.value?.showMA ?? true,
    enabledMA: chartPrefs.value?.enabledMA ?? [5, 10, 20, 60],
    subIndicator: chartPrefs.value?.subIndicator ?? 'VOL',
  }
}

function scheduleSave() {
  if (!prefsLoaded) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/finance/preferences', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(currentLayoutPrefs()),
      })
    } catch {
      // 保存失败不阻塞行情或覆盖当前交互
    }
  }, 300)
}

function onChartPrefsChange(prefs: ChartPrefs) {
  chartPrefs.value = prefs
  scheduleSave()
}

watch([watchlistCollapsed, leftWidth, rightWidth, workspaceTab], scheduleSave)

const gridTemplate = computed(() => {
  if (watchlistCollapsed.value) {
    return `3.25rem 6px minmax(520px, 1fr) 6px ${rightWidth.value}px`
  }
  return `${leftWidth.value}px 6px minmax(520px, 1fr) 6px ${rightWidth.value}px`
})

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtPrice(p: number): string {
  return p ? p.toFixed(2) : '-'
}

function quoteOf(item: WatchItem): Quote | null {
  const symbol = itemToSymbol(item)
  return symbol ? (finance.quotes.value[symbol] ?? null) : null
}

function resetAi() {
  controller?.abort()
  analyzing.value = false
  aiText.value = ''
  aiError.value = ''
}

function moveDown() {
  if (!finance.suggestions.value.length) return
  activeIndex.value = (activeIndex.value + 1) % finance.suggestions.value.length
}

function moveUp() {
  if (!finance.suggestions.value.length) return
  activeIndex.value =
    (activeIndex.value - 1 + finance.suggestions.value.length) % finance.suggestions.value.length
}

function confirmSelection() {
  const item = finance.suggestions.value[activeIndex.value]
  if (item) void selectItem(item)
}

async function selectItem(item: SearchItem) {
  resetAi()
  activeIndex.value = -1
  await finance.select(item)
}

function addItem(item: SearchItem) {
  void finance.addWatch(item)
}

function buildSnapshot(): string {
  const item = finance.selected.value
  const ks = finance.klines.value
  if (!item) return ''
  const last = ks[ks.length - 1]
  const lines = [
    `标的：${item.name}（${item.code}，${item.typeName}）`,
    `最新交易日：${last?.date ?? '-'}，收盘 ${last?.close ?? '-'}，涨跌幅 ${last?.pct ?? '-'}%`,
    `近 20 根 K 线（日期/开/收/高/低/成交量）：`,
  ]
  ks.slice(-20).forEach((k) => {
    lines.push(`${k.date} ${k.open}/${k.close}/${k.high}/${k.low} ${k.volume}`)
  })
  return lines.join('\n')
}

async function runAnalysis() {
  if (!finance.selected.value || !finance.klines.value.length || analyzing.value) return
  analyzing.value = true
  aiText.value = ''
  aiError.value = ''
  controller = new AbortController()
  const system = [
    '你是一名严谨的金融分析师，面向个人投资者做研究辅助。',
    '你只基于用户提供的真实行情数据进行分析，不得编造数据。',
    '严格合规：不承诺收益，不使用「必涨、稳赚、保证」等表述，',
    '必须输出风险提示，并声明「本分析仅供研究参考，不构成投资建议」。',
    '输出固定四段结构（Markdown 二级标题）：',
    '## 走势研判\n## 量价关系\n## 技术指标验证\n## 推演与风险',
    '每段给出所依据的具体数据，指标结论要与数据一致。',
  ].join('\n')
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `请分析以下标的：\n\n${buildSnapshot()}\n\n结合均线、MACD、RSI、KDJ、BOLL 与量价关系，给出走势研判、量价关系、技术指标验证、推演与风险。`,
    },
  ]
  try {
    await streamChat({
      messages,
      system,
      maxTokens: 2500,
      onToken: (t) => {
        aiText.value += t
      },
      onDone: () => {
        analyzing.value = false
      },
      signal: controller.signal,
    })
  } catch (e) {
    if ((e as Error).name !== 'AbortError') aiError.value = '分析失败，请重试'
    analyzing.value = false
  }
}

function stopAnalysis() {
  controller?.abort()
  analyzing.value = false
}

onMounted(async () => {
  void finance.loadBoards()
  void finance.loadBoardRank()
  void finance.loadWatchlist()
  // 拉取服务端偏好并应用到布局
  try {
    const res = await fetch('/api/finance/preferences', { credentials: 'include' })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (data) {
      const leftW = typeof data.leftWidth === 'number' ? data.leftWidth : 210
      const rightW = typeof data.rightWidth === 'number' ? data.rightWidth : 280
      leftWidth.value = clampSplitterWidth(leftW, LEFT_MIN, LEFT_MAX)
      rightWidth.value = clampSplitterWidth(rightW, RIGHT_MIN, RIGHT_MAX)
      watchlistCollapsed.value = data.leftCollapsed === true
      const rp = data.rightPanel
      if (rp === 'ai' || rp === 'boards' || rp === 'settings') workspaceTab.value = rp
      chartPrefs.value = {
        chartView: data.chartView === 'minute' ? 'minute' : 'candle',
        candlePeriod: data.candlePeriod === 'week' ? 'week' : data.candlePeriod === 'month' ? 'month' : 'day',
        interval: ['1', '5', '15', '30', '60'].includes(data.interval as string) ? (data.interval as string) as ChartPrefs['interval'] : '5',
        showMA: typeof data.showMA === 'boolean' ? data.showMA : true,
        enabledMA: Array.isArray(data.enabledMA) ? data.enabledMA.filter((n): n is number => typeof n === 'number') : [5, 10, 20, 60],
        subIndicator: ['VOL', 'MACD', 'KDJ', 'RSI', 'BOLL'].includes(data.subIndicator as string) ? (data.subIndicator as string) as ChartPrefs['subIndicator'] : 'VOL',
      }
    }
  } catch {
    // 偏好加载失败不阻塞行情
  }
  prefsLoaded = true
  // 自动选中上证指数，让 K 线立即可见
  finance.selectBoard({
    symbol: 'sh000001',
    name: '上证指数',
    code: '000001',
    price: 0,
    prevClose: 0,
    change: 0,
    pct: 0,
    open: 0,
    high: 0,
    low: 0,
    volume: 0,
    amount: 0,
    time: '',
  })
  const config = await getAiConfig()
  aiAvailable.value = config.available
  colorSchemeLabel.value = document.documentElement.style.getPropertyValue('--fin-up') ? '国际' : '中国市场'
})
</script>

<template>
  <div class="fin">
    <!-- 顶部：搜索 + 指数条 -->
    <div class="fin__top">
      <button class="fin__drawer-btn fin__drawer-btn--left" type="button" aria-label="打开自选" @click="leftDrawerOpen = true">自选</button>
      <div class="fin__search">
        <PhMagnifyingGlass :size="15" class="fin__search-icon" />
        <input
          v-model="finance.query.value"
          class="fin__search-input"
          type="search"
          placeholder="搜索股票/基金/板块/ETF"
          @input="finance.scheduleSearch()"
          @keydown.down.prevent="moveDown"
          @keydown.up.prevent="moveUp"
          @keydown.enter.prevent="confirmSelection"
          @keydown.esc="finance.suggestions.value = []"
        />
        <ul v-if="finance.suggestions.value.length" class="fin__suggest">
          <li
            v-for="(s, i) in finance.suggestions.value"
            :key="s.quoteId + s.code"
            class="fin__suggest-item"
            :class="{ 'fin__suggest-item--active': i === activeIndex }"
            @mouseenter="activeIndex = i"
            @click="selectItem(s)"
          >
            <span class="fin__suggest-name">{{ s.name }}</span>
            <span class="fin__suggest-code">{{ s.code }}</span>
            <span class="fin__suggest-type">{{ s.typeName }}</span>
            <button class="fin__add" type="button" :aria-label="`添加 ${s.name}`" @click.stop="addItem(s)">
              <PhPlus :size="13" weight="bold" />
            </button>
          </li>
        </ul>
      </div>
      <IndexStrip
        class="fin__top-indices"
        :domestic="domesticBoards"
        :overseas="overseasBoards"
        @select="finance.selectBoard"
      />
      <button class="fin__drawer-btn fin__drawer-btn--right" type="button" aria-label="打开工作区" @click="rightDrawerOpen = true">工作区</button>
    </div>

    <!-- 三栏主体 -->
    <div class="fin__grid" :style="{ gridTemplateColumns: gridTemplate }">
      <!-- 左栏：自选列表 -->
      <aside class="fin__col fin__col--left" :class="{ 'fin__col--collapsed': watchlistCollapsed, 'fin__drawer--open': leftDrawerOpen }">
        <div class="fin__col-head">
          <span v-if="!watchlistCollapsed">自选</span>
          <span v-else class="fin__col-collapsed-label">自选</span>
          <div class="fin__col-head-actions">
            <span v-if="!watchlistCollapsed" class="fin__col-count">{{ finance.watchlist.value.length }}</span>
            <button
              type="button"
              class="fin__collapse"
              :aria-label="watchlistCollapsed ? '展开自选栏' : '收起自选栏'"
              :title="watchlistCollapsed ? '展开自选栏' : '收起自选栏'"
              @click="watchlistCollapsed = !watchlistCollapsed"
            >
              {{ watchlistCollapsed ? '›' : '‹' }}
            </button>
          </div>
        </div>
        <div v-if="!finance.watchlist.value.length && !watchlistCollapsed" class="fin__empty">
          搜索后点 + 添加
        </div>
        <ul v-else-if="!watchlistCollapsed" class="fin__watch">
          <li
            v-for="w in finance.watchlist.value"
            :key="w.id"
            class="fin__watch-item"
            :class="{ 'fin__watch-item--active': finance.selected.value?.code === w.code }"
            @click="finance.viewWatch(w)"
          >
            <div class="fin__watch-info">
              <span class="fin__watch-name">{{ w.name }}</span>
              <span class="fin__watch-code">{{ w.code }}</span>
            </div>
            <template v-if="quoteOf(w)">
              <span class="fin__watch-price" :class="pctClass(quoteOf(w)!.pct)">
                {{ fmtPrice(quoteOf(w)!.price) }}
              </span>
              <span class="fin__watch-pct" :class="pctClass(quoteOf(w)!.pct)">
                {{ fmtPct(quoteOf(w)!.pct) }}
              </span>
            </template>
            <span v-else class="fin__watch-na">—</span>
            <button
              class="fin__watch-remove"
              type="button"
              :aria-label="`移除 ${w.name}`"
              @click.stop="finance.removeWatch(w.id)"
            >
              <PhX :size="12" />
            </button>
          </li>
        </ul>
      </aside>

      <ResizeGutter
        v-if="!watchlistCollapsed"
        class="fin__gutter fin__gutter--left"
        :min="LEFT_MIN"
        :max="LEFT_MAX"
        :value="leftWidth"
        @resize="onLeftResize"
      />

      <!-- 中栏：标的详情 + K 线 + AI 分析 -->
      <main class="fin__col fin__col--center">
        <template v-if="finance.selected.value">
          <div class="fin__detail-head">
            <span class="fin__detail-name">{{ finance.selected.value.name }}</span>
            <span class="fin__detail-code">{{ finance.selected.value.code }}</span>
            <span class="fin__detail-type">{{ finance.selected.value.typeName }}</span>
            <button class="fin__detail-close" type="button" @click="finance.selected.value = null">
              <PhX :size="14" />
            </button>
          </div>

          <QuoteHeader v-if="finance.detail.value" :detail="finance.detail.value" />

          <div class="fin__chart-wrap">
            <div v-if="finance.loading.value && !finance.klines.value.length" class="fin__state">加载中…</div>
            <div v-else-if="finance.error.value && !finance.klines.value.length" class="fin__state fin__state--error">
              <p>{{ finance.error.value }}</p>
              <button class="fin__retry" @click="finance.loadKline()">重试</button>
            </div>
            <KlineChart
              v-else
              :klines="finance.klines.value"
              :minute="finance.minutePoints.value"
              :loading-history="finance.loadingHistory.value"
              :has-more-history="finance.hasMoreHistory.value"
              :chart-prefs="chartPrefs"
              @period-change="finance.setPeriod"
              @load-more-history="finance.loadMoreHistory"
              @prefs-change="onChartPrefsChange"
            />
            <p v-if="finance.error.value && finance.klines.value.length" class="fin__chart-error">
              {{ finance.error.value }}，当前数据仍可查看
            </p>
          </div>

        </template>
        <div v-else class="fin__placeholder">
          <p>点击左侧自选、顶部指数或右侧工作区以查看 K 线</p>
        </div>
      </main>

      <ResizeGutter
        class="fin__gutter fin__gutter--right"
        :min="RIGHT_MIN"
        :max="RIGHT_MAX"
        :value="rightWidth"
        reverse
        @resize="onRightResize"
      />

      <aside class="fin__col fin__col--right" :class="{ 'fin__drawer--open': rightDrawerOpen }">
        <nav class="fin__workspace-tabs" aria-label="右侧工作区">
          <button type="button" :class="{ 'fin__workspace-tab--active': workspaceTab === 'ai' }" @click="workspaceTab = 'ai'">
            AI 分析
          </button>
          <button type="button" :class="{ 'fin__workspace-tab--active': workspaceTab === 'boards' }" @click="workspaceTab = 'boards'">
            板块
          </button>
          <button type="button" :class="{ 'fin__workspace-tab--active': workspaceTab === 'settings' }" @click="workspaceTab = 'settings'">
            设置
          </button>
        </nav>

        <div v-if="workspaceTab === 'ai'" class="fin__workspace-panel">
          <div v-if="!aiAvailable" class="fin__ai-unavailable">未配置 AI，无法进行分析。</div>
          <template v-else>
            <button class="fin__ai-toggle" type="button" @click="aiExpanded = !aiExpanded">
              <component :is="aiExpanded ? PhCaretDown : PhCaretUp" :size="14" />
              <span>当前标的分析</span>
              <span v-if="!aiExpanded && aiText" class="fin__ai-preview">已生成</span>
            </button>
            <div v-if="aiExpanded" class="fin__ai-body-wrap">
              <p class="fin__disclaimer">基于公开历史行情与 AI 研判，仅供研究参考，不构成投资建议。</p>
              <div class="fin__ai-actions">
                <button class="fin__analyze" :disabled="analyzing || !finance.klines.value.length" @click="runAnalysis">
                  <PhSparkle :size="14" weight="fill" />
                  {{ analyzing ? '生成中…' : '开始分析' }}
                </button>
                <button v-if="analyzing" class="fin__stop" @click="stopAnalysis">
                  <PhStop :size="13" weight="fill" />停止
                </button>
              </div>
              <div v-if="aiError" class="fin__ai-error">{{ aiError }}</div>
              <div v-if="aiText" class="fin__ai-body markdown" v-html="renderedAi" />
              <div v-else-if="!analyzing" class="fin__ai-empty">点击「开始分析」，AI 将基于当前 K 线与技术指标给出走势研判。</div>
            </div>
          </template>
        </div>

        <div v-else-if="workspaceTab === 'boards'" class="fin__workspace-panel fin__workspace-panel--boards">
          <BoardTable
            :kind="finance.boardKind.value"
            :order="finance.boardOrder.value"
            :rows="finance.boardRows.value"
            :loading="finance.boardsRankLoading.value"
            @set-kind="finance.setBoardKind"
            @set-order="finance.setBoardOrder"
            @select="finance.selectBoardRow"
          />
        </div>

        <div v-else class="fin__workspace-panel fin__workspace-panel--settings">
          <h2>工作区设置</h2>
          <p>当前布局：三栏终端</p>
          <p>涨跌配色：{{ colorSchemeLabel }}</p>
          <p>左侧自选栏：{{ watchlistCollapsed ? '已收起' : '已展开' }}</p>
        </div>
      </aside>
    </div>

    <div v-if="anyDrawerOpen" class="fin__scrim" @click="leftDrawerOpen = false; rightDrawerOpen = false" />
  </div>
</template>

<style scoped lang="scss">
.fin {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  min-height: 0;
}

.fin__up {
  color: var(--fin-up);
}

.fin__down {
  color: var(--fin-down);
}

// 顶部：搜索 + 指数条并排
.fin__top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.fin__drawer-btn {
  display: none;
  padding: 0.4rem 0.7rem;
  font-size: 0.76rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  flex-shrink: 0;
}

.fin__scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.45);
}

.fin__search {
  position: relative;
  width: 260px;
  flex-shrink: 0;
}

.fin__search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.fin__search-input {
  width: 100%;
  padding: 0.5rem 0.8rem 0.5rem 2.1rem;
  font: inherit;
  font-size: 0.85rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.fin__search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.16);
}

.fin__suggest {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.35);
}

.fin__suggest-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.fin__suggest-item--active {
  background: var(--color-accent-soft);
}

.fin__suggest-name {
  font-weight: 600;
  font-size: 0.85rem;
}

.fin__suggest-code {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.fin__suggest-type {
  margin-left: auto;
  font-size: 0.68rem;
  font-family: var(--font-mono);
  padding: 0.05rem 0.4rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.fin__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: filter 0.15s;
}

.fin__add:hover {
  filter: brightness(1.1);
}

.fin__top-indices {
  flex: 1;
  min-width: 0;
}

// 三栏网格
.fin__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 0;
}

.fin__col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space-2);
}

.fin__col--left,
.fin__col--right {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.fin__col--left {
  overflow-y: auto;
}

.fin__col--right {
  overflow: hidden;
}

.fin__workspace-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.2rem;
  padding: 0.35rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.fin__workspace-tabs button {
  padding: 0.4rem 0.25rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  cursor: pointer;
}

.fin__workspace-tabs button:hover,
.fin__workspace-tab--active {
  background: var(--color-accent-soft) !important;
  color: var(--color-accent) !important;
}

.fin__workspace-panel {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.fin__workspace-panel--boards {
  padding: 0.5rem;
}

.fin__workspace-panel--settings {
  padding: 0.9rem;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.fin__workspace-panel--settings h2 {
  margin: 0 0 0.8rem;
  color: var(--color-text);
  font-size: 0.9rem;
}

.fin__workspace-panel--settings p {
  margin: 0.55rem 0;
}

// 左栏：自选
.fin__col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  background: var(--color-surface);
  z-index: 1;
}

.fin__col-head-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.fin__collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.fin__collapse:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.fin__col-collapsed-label {
  writing-mode: vertical-rl;
  letter-spacing: 0.15em;
}

.fin__col-count {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.fin__col--collapsed {
  width: 3.25rem;
}

.fin__col--collapsed .fin__col-head {
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.75rem 0.35rem;
}

.fin__empty {
  padding: var(--space-6) var(--space-3);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.fin__watch {
  list-style: none;
  margin: 0;
  padding: 0;
}

.fin__watch-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.12s;
}

.fin__watch-item:hover {
  background: var(--color-surface-2);
}

.fin__watch-item--active {
  background: var(--color-accent-soft);
}

.fin__watch-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.fin__watch-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fin__watch-code {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.fin__watch-price {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
}

.fin__watch-pct {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  min-width: 4rem;
  text-align: right;
}

.fin__watch-na {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.fin__watch-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.fin__watch-item:hover .fin__watch-remove {
  opacity: 1;
}

.fin__watch-remove:hover {
  color: var(--color-danger);
}

// 中栏：详情 + K 线
.fin__col--center {
  gap: var(--space-2);
}

.fin__detail-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-shrink: 0;
  padding: 0 var(--space-1);
}

.fin__detail-name {
  font-size: 1.05rem;
  font-weight: 700;
}

.fin__detail-code,
.fin__detail-type {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.fin__detail-close {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.fin__detail-close:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.fin__chart-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
}

.fin__chart-error {
  flex: 0 0 auto;
  margin: var(--space-1) var(--space-2) 0;
  color: var(--color-danger);
  font-size: 0.72rem;
}

.fin__state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.fin__state--error p {
  color: var(--color-danger);
  margin-bottom: var(--space-2);
}

.fin__retry {
  padding: 0.35rem 0.8rem;
  font-size: 0.78rem;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.fin__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

// AI 分析面板
.fin__ai {
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.fin__ai-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
  background: transparent;
  border: none;
  cursor: pointer;
}

.fin__ai-preview {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.fin__ai-body-wrap {
  padding: 0 var(--space-3) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 280px;
  overflow-y: auto;
}

.fin__disclaimer {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.fin__ai-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fin__analyze {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-on-accent);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background 0.15s;
}

.fin__analyze:hover:not(:disabled) {
  background: var(--color-accent-strong);
}

.fin__analyze:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fin__stop {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.82rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.fin__ai-error {
  font-size: 0.78rem;
  color: var(--color-danger);
}

.fin__ai-empty {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.fin__ai-body {
  font-size: 0.82rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.fin__ai-body :deep(p) {
  margin: 0 0 0.5em;
}

.fin__ai-body :deep(h2) {
  font-size: 0.9rem;
  margin: 0.6em 0 0.3em;
}

.fin__ai-body :deep(ul),
.fin__ai-body :deep(ol) {
  padding-left: 1.1rem;
  margin: 0.3rem 0;
}

// 响应式：移动端使用 overlay drawer，中央图表始终占据视口
@media (max-width: 1023px) {
  .fin__grid {
    display: flex;
    flex-direction: column;
  }

  .fin__gutter {
    display: none;
  }

  .fin__drawer-btn {
    display: inline-flex;
    align-items: center;
  }

  .fin__scrim {
    display: block;
  }

  .fin__col--left,
  .fin__col--right {
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 50;
    max-height: none;
    width: 80vw;
    max-width: 320px;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    border-radius: 0;
  }

  .fin__col--left {
    left: 0;
    padding-top: env(safe-area-inset-top, 0);
  }

  .fin__col--right {
    right: 0;
    transform: translateX(100%);
    padding-top: env(safe-area-inset-top, 0);
  }

  .fin__drawer--open.fin__col--left {
    transform: translateX(0);
  }

  .fin__drawer--open.fin__col--right {
    transform: translateX(0);
  }
}

@media (max-width: 720px) {
  .fin {
    padding: var(--space-3);
  }

  .fin__top {
    gap: var(--space-2);
  }

  .fin__search {
    width: 100%;
    flex: 1;
  }

  .fin__top-indices {
    display: none;
  }
}
</style>
