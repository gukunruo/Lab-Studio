<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'
import { PhMagnifyingGlass, PhPlus, PhX, PhSparkle, PhStop } from '@phosphor-icons/vue'
import { getAiConfig, streamChat, type ChatMessage } from '@/learn/ai'
import { useFinance, itemToSymbol, type Quote, type WatchItem } from './useFinance'
import type { SearchItem } from './types'
import KlineChart from './chart/KlineChart.vue'
import QuoteHeader from './components/QuoteHeader.vue'

const finance = useFinance()

const domesticBoards = computed(() => finance.boards.value?.domestic ?? [])
const overseasBoards = computed(() => finance.boards.value?.overseas ?? [])

const activeIndex = ref(-1)
const analyzing = ref(false)
const aiText = ref('')
const aiError = ref('')
const aiAvailable = ref(false)
let controller: AbortController | null = null

const renderedAi = computed(() => marked.parse(aiText.value, { async: false }) as string)

function pctClass(pct: number): string {
  if (pct > 0) return 'fin__up'
  if (pct < 0) return 'fin__down'
  return ''
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtPrice(p: number): string {
  return p ? p.toFixed(2) : '-'
}

// 自选行实时行情
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
  void finance.loadWatchlist()
  const config = await getAiConfig()
  aiAvailable.value = config.available
})
</script>

<template>
  <div class="fin">
    <!-- 搜索 -->
    <div class="fin__search">
      <PhMagnifyingGlass :size="16" class="fin__search-icon" />
      <input
        v-model="finance.query.value"
        class="fin__search-input"
        type="search"
        placeholder="搜索股票/基金/板块/ETF（回车选中，点 + 加入自选）"
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
            <PhPlus :size="14" weight="bold" />
          </button>
        </li>
      </ul>
    </div>

    <!-- 重点板块 -->
    <section class="fin__section">
      <h2 class="fin__section-title">国内重点板块</h2>
      <div class="fin__cards">
        <button
          v-for="q in domesticBoards"
          :key="q.symbol"
          class="fin__card"
          :class="pctClass(q.pct)"
          type="button"
          @click="finance.selectBoard(q)"
        >
          <div class="fin__card-name">{{ q.name }}</div>
          <div class="fin__card-price">{{ fmtPrice(q.price) }}</div>
          <div class="fin__card-pct">{{ fmtPct(q.pct) }}</div>
        </button>
        <div v-if="finance.boardsLoading && !finance.boards" class="fin__card fin__card--loading">
          加载中…
        </div>
      </div>
    </section>

    <section class="fin__section">
      <h2 class="fin__section-title">国外重点板块</h2>
      <div class="fin__cards">
        <button
          v-for="q in overseasBoards"
          :key="q.symbol"
          class="fin__card"
          :class="pctClass(q.pct)"
          type="button"
          @click="finance.selectBoard(q)"
        >
          <div class="fin__card-name">{{ q.name }}</div>
          <div class="fin__card-price">{{ fmtPrice(q.price) }}</div>
          <div class="fin__card-pct">{{ fmtPct(q.pct) }}</div>
        </button>
      </div>
    </section>

    <!-- 自选 / 关注列表 -->
    <section class="fin__section">
      <div class="fin__section-head">
        <h2 class="fin__section-title">自选 / 关注</h2>
        <span class="fin__section-hint">搜索后点 + 添加</span>
      </div>
      <div v-if="!finance.watchlist.value.length" class="fin__empty">
        暂无自选。在上方搜索股票 / 基金 / 板块 / ETF，点「+」加入关注列表。
      </div>
      <ul v-else class="fin__watch">
        <li v-for="w in finance.watchlist.value" :key="w.id" class="fin__watch-item">
          <button class="fin__watch-main" type="button" @click="finance.viewWatch(w)">
            <span class="fin__watch-name">{{ w.name }}</span>
            <span class="fin__watch-code">{{ w.code }}</span>
            <span class="fin__watch-type">{{ w.typeName }}</span>
          </button>
          <template v-if="quoteOf(w)">
            <span class="fin__watch-price" :class="pctClass(quoteOf(w)!.pct)">
              {{ fmtPrice(quoteOf(w)!.price) }}
            </span>
            <span class="fin__watch-pct" :class="pctClass(quoteOf(w)!.pct)">
              {{ fmtPct(quoteOf(w)!.pct) }}
            </span>
          </template>
          <span v-else class="fin__watch-na">—</span>
          <button class="fin__remove" type="button" :aria-label="`移除 ${w.name}`" @click="finance.removeWatch(w.id)">
            <PhX :size="14" />
          </button>
        </li>
      </ul>
    </section>

    <!-- 选中标的：K 线 + AI 分析 -->
    <section v-if="finance.selected.value" class="fin__detail">
      <div class="fin__detail-head">
        <h2 class="fin__detail-name">{{ finance.selected.value.name }}</h2>
        <span class="fin__detail-code">{{ finance.selected.value.code }}</span>
        <span class="fin__detail-type">{{ finance.selected.value.typeName }}</span>
        <button class="fin__detail-close" type="button" @click="finance.selected.value = null">关闭</button>
      </div>

      <QuoteHeader v-if="finance.detail.value" :detail="finance.detail.value" />

      <div class="fin__detail-grid">
        <div class="fin__chart">
          <div v-if="finance.loading.value" class="fin__state">加载中…</div>
          <div v-else-if="finance.error.value" class="fin__state fin__state--error">
            <p>{{ finance.error.value }}</p>
            <button class="fin__retry" @click="finance.loadKline()">重试</button>
          </div>
          <KlineChart v-else :klines="finance.klines.value" @period-change="finance.setPeriod" />
        </div>

        <aside class="fin__ai">
          <p class="fin__disclaimer">
            本分析基于公开历史行情与 AI 研判，仅供研究参考，不构成任何投资建议。
          </p>
          <div v-if="!aiAvailable" class="fin__ai-unavailable">未配置 AI，无法进行分析。</div>
          <template v-else>
            <div class="fin__ai-actions">
              <button
                class="fin__analyze"
                :disabled="analyzing || !finance.klines.value.length"
                @click="runAnalysis"
              >
                <PhSparkle :size="15" weight="fill" />
                {{ analyzing ? '生成中…' : '开始分析' }}
              </button>
              <button v-if="analyzing" class="fin__stop" @click="stopAnalysis">
                <PhStop :size="14" weight="fill" />
                停止
              </button>
            </div>
            <div v-if="aiError" class="fin__ai-error">{{ aiError }}</div>
            <div v-if="aiText" class="fin__ai-body markdown" v-html="renderedAi" />
            <div v-else-if="!analyzing" class="fin__ai-empty">
              点击「开始分析」，AI 将基于当前 K 线与技术指标给出走势研判、量价关系与推演。
            </div>
          </template>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.fin {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 1100px;
  margin: 0 auto;
}

.fin__up {
  color: var(--fin-up);
}

.fin__down {
  color: var(--fin-down);
}

// 搜索
.fin__search {
  position: relative;
}

.fin__search-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}

.fin__search-input {
  width: 100%;
  padding: 0.7rem 0.9rem 0.7rem 2.4rem;
  font: inherit;
  font-size: 0.95rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.fin__search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 4px rgba(var(--color-accent-rgb), 0.16);
}

.fin__suggest {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: var(--space-2);
  list-style: none;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.3);
}

.fin__suggest-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.fin__suggest-item--active {
  background: var(--color-accent-soft);
}

.fin__suggest-name {
  font-weight: 600;
}

.fin__suggest-code {
  font-family: var(--font-mono);
  color: var(--color-text-muted);
}

.fin__suggest-type {
  margin-left: auto;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.fin__add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: filter 0.15s;
}

.fin__add:hover {
  filter: brightness(1.05);
}

// 区块
.fin__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.fin__section-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.fin__section-title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.fin__section-hint {
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.fin__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-3);
}

.fin__card {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font: inherit;
  text-align: left;
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s;
}

.fin__card:hover {
  border-color: var(--color-accent);
}

.fin__card:active {
  transform: scale(0.98);
}

.fin__card--loading {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  justify-content: center;
  align-items: center;
}

.fin__card-name {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.fin__card-price {
  font-size: 1.2rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--color-text);
}

.fin__card.fin__up .fin__card-price,
.fin__card.fin__down .fin__card-price {
  color: inherit;
}

.fin__card-pct {
  font-size: 0.85rem;
  font-family: var(--font-mono);
  font-weight: 600;
}

// 自选
.fin__empty {
  padding: var(--space-6);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-align: center;
}

.fin__watch {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.fin__watch-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.6rem var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.fin__watch-item:last-child {
  border-bottom: none;
}

.fin__watch-main {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}

.fin__watch-name {
  font-weight: 600;
  color: var(--color-text);
}

.fin__watch-code {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.fin__watch-type {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.fin__watch-price {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text);
}

.fin__watch-pct {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  min-width: 5.5rem;
  text-align: right;
}

.fin__watch-na {
  color: var(--color-text-muted);
}

.fin__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.fin__remove:hover {
  color: var(--color-danger);
  background: var(--color-surface-2);
}

// 详情
.fin__detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-top: var(--space-2);
}

.fin__detail-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.fin__detail-name {
  font-size: 1.1rem;
  font-weight: 600;
}

.fin__detail-code,
.fin__detail-type {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.fin__detail-close {
  margin-left: auto;
  padding: 0.3rem 0.8rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.fin__detail-close:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.fin__detail-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: var(--space-5);
  align-items: start;
}

.fin__chart {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-4);
  min-width: 0;
}

.fin__state {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.fin__state--error p {
  color: var(--color-danger);
  margin-bottom: var(--space-3);
}

.fin__retry {
  padding: 0.4rem 0.9rem;
  font-size: 0.82rem;
  color: var(--color-accent);
  background: transparent;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.fin__ai {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.fin__disclaimer {
  font-size: 0.76rem;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.fin__ai-unavailable {
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

.fin__ai-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fin__analyze {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
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
  gap: 0.35rem;
  padding: 0.6rem 1rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.fin__ai-error {
  font-size: 0.8rem;
  color: var(--color-danger);
}

.fin__ai-empty {
  font-size: 0.82rem;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.fin__ai-body {
  font-size: 0.86rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.fin__ai-body :deep(p) {
  margin: 0 0 0.6em;
}

.fin__ai-body :deep(h2) {
  font-size: 0.95rem;
  margin: 0.8em 0 0.4em;
}

.fin__ai-body :deep(ul),
.fin__ai-body :deep(ol) {
  padding-left: 1.1rem;
  margin: 0.4rem 0;
}

@media (max-width: 720px) {
  .fin__detail-grid {
    grid-template-columns: 1fr;
  }

  .fin {
    padding: var(--space-4);
  }
}
</style>
