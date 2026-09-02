<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowLeft, PhDownloadSimple, PhPause, PhPlay, PhSnowflake, PhSmiley } from '@phosphor-icons/vue'
import BloubBot from '@/components/BloubBot.vue'
import { defaultCycle, MIN_BLOCK, type Block } from '@/bot/cycles'
import { DEFAULT_EXPRESSION, EXPRESSIONS } from '@/bot/expressions'
import { COLORS, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPES } from '@/bot/skins'
import { POSES, SEQUENCE, STATE_BY_ID, type StateId } from '@/bot/states'

const shape = ref(DEFAULT_SHAPE)
const color = ref(DEFAULT_COLOR)
const expression = ref(DEFAULT_EXPRESSION)

/** true = joue tout le montage ; false = isole un seul etat. */
const previewAll = ref(true)
const selectedState = ref<StateId>('idle')
const block = ref(0)
const state = ref<StateId>('idle')
const elapsed = ref(0)
const playing = ref(true)

/** Fige le rendu a une date precise : veritable pause, sans boucle rAF. */
const frozen = ref(false)
const freezeTime = ref(1.2)

const bot = ref<InstanceType<typeof BloubBot> | null>(null)

const DEFAULT_BLOCKS = defaultCycle().blocks
const cycle = computed<Block[]>(() => {
  if (previewAll.value) return DEFAULT_BLOCKS
  const def = STATE_BY_ID.get(selectedState.value)!
  return [{ state: selectedState.value, duration: Math.max(def.duration, MIN_BLOCK) }]
})

const order = SEQUENCE.map((id) => STATE_BY_ID.get(id)!)

function selectState(id: StateId) {
  previewAll.value = false
  selectedState.value = id
}

function selectAll() {
  previewAll.value = true
}

// Le cycle a change (montage <-> etat isole) : on force la reprise du bloc 0 une
// fois que le composant a bien recu le nouveau cycle, sinon le watcher de cycle,
// voyant le meme index, ne reapplique rien et le moteur reste sur l'etat precedent.
watch([previewAll, selectedState], async () => {
  await nextTick()
  bot.value?.seek(0)
})

function toggleFreeze() {
  if (frozen.value) {
    frozen.value = false
    playing.value = true
  } else {
    frozen.value = true
    playing.value = false
    freezeTime.value = POSES[state.value] ?? 1.2
  }
}

/* ------------------------------------------------------------------ export */

const EXPORT_SIZE = 1024

function svgMarkup(): string {
  const svg = bot.value!.$el as SVGSVGElement
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(EXPORT_SIZE))
  clone.setAttribute('height', String(EXPORT_SIZE))
  // Stripe les commentaires : le XML livre ne doit pas transporter les notes de
  // conception du composant.
  return new XMLSerializer().serializeToString(clone).replace(/<!--[\s\S]*?-->/g, '')
}

function telecharge(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  // Differe : Safari lit encore l'URL apres le clic sur un gros blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function exportSvg() {
  telecharge(new Blob([svgMarkup()], { type: 'image/svg+xml' }), `gs-bot-${state.value}.svg`)
}

async function exportPng() {
  const markup = svgMarkup()
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = EXPORT_SIZE
    canvas.height = EXPORT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    ctx.drawImage(img, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob) telecharge(blob, `gs-bot-${state.value}.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ------------------------------------------------------------------ labels */

const shapeLabels: Record<string, string> = {
  cercle: '圆形',
  galet: '卵石',
  squircle: '方圆形',
  capsule: '胶囊',
  triangle: '三角',
  hexagone: '六边形',
  nuage: '云朵',
  goutte: '水滴'
}

const expressionLabels: Record<string, string> = {
  neutre: '中性',
  attentif: '专注',
  surpris: '惊讶',
  excite: '兴奋',
  heureux: '开心',
  hilare: '大笑',
  colere: '生气',
  triste: '难过',
  effraye: '害怕',
  mefiant: '怀疑',
  confus: '困惑',
  curieux: '好奇',
  fier: '自豪',
  timide: '害羞',
  blase: '冷漠',
  somnolent: '困倦'
}

const stateLabels: Record<string, string> = {
  idle: '待机',
  thinking: '思考',
  wink: '眨眼',
  wide: '睁大',
  alert: '警告',
  notify: '通知',
  exclaim: '感叹',
  sleep: '睡眠',
  egg: '蛋',
  hexagon: '六边形',
  play: '播放',
  orbit: '轨道',
  burst: '爆发',
  comet: '彗星',
  swirl: '入场'
}

</script>

<template>
  <div class="bloub">
    <header class="bloub__bar">
      <RouterLink to="/" class="bloub__back" aria-label="返回 Lab" title="返回 Lab">
        <PhArrowLeft :size="18" />
      </RouterLink>
      <div class="bloub__title">
        <PhSmiley :size="18" weight="bold" />
        <span>G's bot 工作台</span>
      </div>
      <div class="bloub__actions">
        <button class="bloub__export" type="button" @click="exportSvg">
          <PhDownloadSimple :size="15" />
          导出 SVG
        </button>
        <button class="bloub__export" type="button" @click="exportPng">
          <PhDownloadSimple :size="15" />
          导出 PNG
        </button>
      </div>
    </header>

    <div class="bloub__stage">
      <section class="bloub__bot">
        <BloubBot
          v-if="!frozen"
          ref="bot"
          :size="440"
          :shape="shape"
          :color="color"
          :expression="expression"
          :follow="true"
          :cycle="cycle"
          v-model:state="state"
          v-model:block="block"
          v-model:elapsed="elapsed"
          v-model:playing="playing"
        />
        <BloubBot
          v-else
          ref="bot"
          :size="440"
          :shape="shape"
          :color="color"
          :expression="expression"
          :frozen-at="freezeTime"
        />

        <div class="bloub__playback">
          <button
            class="bloub__ctl"
            type="button"
            :class="{ 'bloub__ctl--active': playing }"
            :disabled="frozen"
            @click="playing = !playing"
          >
            <component :is="playing ? PhPause : PhPlay" :size="15" />
            {{ playing ? '暂停' : '播放' }}
          </button>
          <button
            class="bloub__ctl"
            type="button"
            :class="{ 'bloub__ctl--active': frozen }"
            @click="toggleFreeze"
          >
            <PhSnowflake :size="15" />
            {{ frozen ? '取消冻结' : '冻结帧' }}
          </button>
          <label v-if="frozen" class="bloub__freeze">
            <input
              v-model.number="freezeTime"
              type="range"
              min="0"
              max="3"
              step="0.05"
            />
            <span>{{ freezeTime.toFixed(2) }}s</span>
          </label>
          <span class="bloub__state-name">{{ stateLabels[state] }}</span>
        </div>

        <p class="bloub__hint">让鼠标在页面上移动，它的眼睛会跟着你。</p>
      </section>

      <aside class="bloub__panel">
        <section class="bloub__group">
          <h3 class="bloub__group-title">形状</h3>
          <div class="bloub__chips">
            <button
              v-for="s in SHAPES"
              :key="s.id"
              type="button"
              class="bloub__chip"
              :class="{ 'bloub__chip--active': shape === s.id }"
              @click="shape = s.id"
            >
              {{ shapeLabels[s.id] }}
            </button>
          </div>
        </section>

        <section class="bloub__group">
          <h3 class="bloub__group-title">颜色</h3>
          <div class="bloub__colors">
            <button
              v-for="c in COLORS"
              :key="c.id"
              type="button"
              class="bloub__color"
              :class="{ 'bloub__color--active': color === c.id }"
              :style="{ background: c.hex }"
              :title="c.id"
              @click="color = c.id"
            />
          </div>
        </section>

        <section class="bloub__group">
          <h3 class="bloub__group-title">表情</h3>
          <div class="bloub__chips">
            <button
              v-for="e in EXPRESSIONS"
              :key="e.id"
              type="button"
              class="bloub__chip"
              :class="{ 'bloub__chip--active': expression === e.id }"
              @click="expression = e.id"
            >
              {{ expressionLabels[e.id] }}
            </button>
          </div>
        </section>

        <section class="bloub__group">
          <h3 class="bloub__group-title">状态</h3>
          <div class="bloub__states">
            <button
              type="button"
              class="bloub__state"
              :class="{ 'bloub__state--active': previewAll }"
              @click="selectAll"
            >
              <BloubBot :size="72" :shape="shape" :color="color" :expression="expression" :frozen-at="1" />
              <span>全部</span>
            </button>
            <button
              v-for="s in order"
              :key="s.id"
              type="button"
              class="bloub__state"
              :class="{
                'bloub__state--active': previewAll ? state === s.id : selectedState === s.id
              }"
              @click="selectState(s.id)"
            >
              <BloubBot
                :size="72"
                :state="s.id"
                :frozen-at="POSES[s.id]"
                :shape="shape"
                :color="color"
                :expression="expression"
              />
              <span>{{ stateLabels[s.id] }}</span>
            </button>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bloub {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
}

.bloub__bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  position: sticky;
  top: 0;
  z-index: 5;
}

.bloub__back {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--color-border);
    color: var(--color-text);
  }
}

.bloub__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.bloub__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.bloub__export {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--color-border-strong);
    background: var(--color-border);
  }
}

.bloub__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 28px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

@media (max-width: 960px) {
  .bloub__stage {
    grid-template-columns: minmax(0, 1fr);
  }
}

.bloub__bot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 24px;
}

.bloub__playback {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.bloub__ctl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }

  &--active {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }
}

.bloub__freeze {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  input[type='range'] {
    width: 120px;
    accent-color: var(--color-accent);
  }

  span {
    font-size: 12px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
}

.bloub__state-name {
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 7px 12px;
  border-radius: var(--radius-md);
  background: var(--color-border);
  font-variant-numeric: tabular-nums;
}

.bloub__hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.bloub__panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.bloub__group {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 14px;
}

.bloub__group-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.bloub__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bloub__chip {
  padding: 6px 11px;
  font-size: 13px;
  color: var(--color-text);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--color-border-strong);
  }

  &--active {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }
}

.bloub__colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bloub__color {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s;
  position: relative;

  &:hover {
    transform: scale(1.08);
  }

  &--active {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-soft);
  }
}

.bloub__states {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 10px;
}

.bloub__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--color-border-strong);
  }

  span {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  &--active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);

    span {
      color: var(--color-accent);
    }
  }
}
</style>
