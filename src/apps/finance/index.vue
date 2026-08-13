<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'
import { PhMagnifyingGlass, PhSparkle, PhStop } from '@phosphor-icons/vue'
import { getAiConfig, streamChat, type ChatMessage } from '@/learn/ai'
import { useFinance } from './useFinance'
import KlineChart from './chart/KlineChart.vue'

const finance = useFinance()

const activeIndex = ref(-1)
const analyzing = ref(false)
const aiText = ref('')
const aiError = ref('')
const aiAvailable = ref(false)
let controller: AbortController | null = null

const renderedAi = computed(() => marked.parse(aiText.value, { async: false }) as string)

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

async function selectItem(item: NonNullable<typeof finance.selected.value>) {
  resetAi()
  activeIndex.value = -1
  await finance.select(item)
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
  const config = await getAiConfig()
  aiAvailable.value = config.available
})
</script>

<template>
  <div class="fin">
    <div class="fin__search">
      <PhMagnifyingGlass :size="16" class="fin__search-icon" />
      <input
        v-model="finance.query.value"
        class="fin__search-input"
        type="search"
        placeholder="输入股票/基金代码、名称或板块关键词"
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
        </li>
      </ul>
    </div>

    <div class="fin__body">
      <section class="fin__chart-pane">
        <div v-if="finance.selected.value" class="fin__info">
          <h2 class="fin__name">{{ finance.selected.value.name }}</h2>
          <span class="fin__code">{{ finance.selected.value.code }}</span>
          <span class="fin__type">{{ finance.selected.value.typeName }}</span>
        </div>
        <div v-if="finance.loading.value" class="fin__state">加载中…</div>
        <div v-else-if="finance.error.value" class="fin__state fin__state--error">
          <p>{{ finance.error.value }}</p>
          <button class="fin__retry" @click="finance.loadKline()">重试</button>
        </div>
        <div v-else-if="!finance.klines.value.length" class="fin__state">
          搜索并选择标的后，这里会显示 K 线与技术指标。
        </div>
        <KlineChart v-else :klines="finance.klines.value" />
      </section>

      <aside class="fin__ai">
        <p class="fin__disclaimer">
          本分析基于公开历史行情与 AI 研判，仅供研究参考，不构成任何投资建议。市场有风险，决策需谨慎。
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
            选择标的后点击「开始分析」，AI 将基于当前 K 线与技术指标给出走势研判、量价关系与推演。
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fin {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-height: 100%;
}

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
  padding: 0.75rem 0.9rem 0.75rem 2.4rem;
  font: inherit;
  font-size: 0.95rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.fin__search-input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.fin__search-input:focus {
  border-color: var(--color-accent);
  background: var(--color-bg);
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

.fin__body {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--space-5);
  align-items: start;
}

.fin__chart-pane {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4);
  min-width: 0;
}

.fin__info {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.fin__name {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.fin__code,
.fin__type {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-muted);
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
  transition: background 0.15s;
}

.fin__retry:hover {
  background: var(--color-accent-soft);
}

.fin__ai {
  position: sticky;
  top: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: calc(100vh - 180px);
  overflow-y: auto;
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
  transition: background 0.15s, transform 0.12s;
}

.fin__analyze:hover:not(:disabled) {
  background: var(--color-accent-strong);
}

.fin__analyze:active:not(:disabled) {
  transform: scale(0.97);
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

.fin__stop:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
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

.fin__ai-body :deep(h1),
.fin__ai-body :deep(h2),
.fin__ai-body :deep(h3) {
  font-size: 0.95rem;
  margin: 0.8em 0 0.4em;
}

.fin__ai-body :deep(ul),
.fin__ai-body :deep(ol) {
  padding-left: 1.1rem;
  margin: 0.4rem 0;
}

.fin__ai-body :deep(li) {
  margin: 0.15rem 0;
}

.fin__ai-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

@media (max-width: 720px) {
  .fin__body {
    grid-template-columns: 1fr;
  }

  .fin__ai {
    position: static;
    max-height: none;
  }
}
</style>
