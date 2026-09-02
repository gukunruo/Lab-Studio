<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowLeft, PhCaretUp, PhDownloadSimple, PhPause, PhPlay, PhSmiley, PhSnowflake } from '@phosphor-icons/vue'
import BloubBot from '@/components/BloubBot.vue'
import BloubTimeline from '@/components/BloubTimeline.vue'
import {
  blockAt,
  blocksWith,
  cycleFromJson,
  cycleToJson,
  defaultCycle,
  totalDuration,
  type Block
} from '@/bot/cycles'
import {
  copyPng,
  copySvg,
  EXPORT_SIZE,
  filmStrip,
  frameCount,
  frameInnerMarkup,
  frameMarkup,
  GIF_SIZE,
  gifFromMarkups,
  pngFromMarkup
} from '@/bot/exporter'
import { DEFAULT_EXPRESSION, EXPRESSIONS } from '@/bot/expressions'
import { COLORS, DEFAULT_COLOR, DEFAULT_SHAPE, SHAPES } from '@/bot/skins'
import { POSES, SEQUENCE, STATE_BY_ID, type StateId } from '@/bot/states'

const shape = ref(DEFAULT_SHAPE)
const color = ref(DEFAULT_COLOR)
const expression = ref(DEFAULT_EXPRESSION)

/**
 * Le montage edite par la piste du bas. Il est relu du stockage local (comme le
 * hash de l'URL, le localStorage est modifiable a la main : `cycleFromJson` jette
 * ce qui ne se relit pas), sinon il part du montage mesure sur la video.
 */
const CYCLE_KEY = 'lab-studio.bloub.cycle'
const blocks = ref<Block[]>(
  cycleFromJson(localStorage.getItem(CYCLE_KEY))?.blocks ?? defaultCycle().blocks
)

const block = ref(0)
const state = ref<StateId>('idle')
const elapsed = ref(0)
const playing = ref(true)

/** Fige le rendu a une date precise : veritable pause, sans boucle rAF. */
const frozen = ref(false)
const freezeTime = ref(1.2)

const bot = ref<InstanceType<typeof BloubBot> | null>(null)
const exporter = ref<InstanceType<typeof BloubBot> | null>(null)

const order = SEQUENCE.map((id) => STATE_BY_ID.get(id)!)

/** Ajoute un etat de la palette a la fin du montage (bloub-style, pas un apercu isole). */
function appendState(id: StateId) {
  blocks.value = blocksWith(blocks.value, id)
  // Le bot est en haut de la colonne ; sur un ecran etroit il faut defiler pour
  // le retrouver. On le ramene en vue pour voir la pose sans re-scroller.
  nextTick(() => bot.value?.$el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
}

/** Deplace la tete de lecture a la date absolue `t`, en tombant au milieu du bloc. */
function seekTo(t: number) {
  const { index, elapsed: off } = blockAt(blocks.value, t)
  bot.value?.seek(index, off)
}

/** Restaure le montage mesure sur la video — la piste fait office de « tout ». */
function resetCycle() {
  blocks.value = defaultCycle().blocks
}

watch(blocks, (b) => localStorage.setItem(CYCLE_KEY, cycleToJson({ id: 'defaut', name: '', blocks: b })), { deep: true })

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

const menu = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const busy = ref(false)
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function showNotice(message: string) {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), 2200)
}

/** `<svg>` autonome de la frame affichee a l'ecran (regard et pose compris). */
function svgMarkup(): string {
  return frameMarkup(bot.value!.$el as SVGSVGElement, EXPORT_SIZE)
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

function doExportSvg() {
  runExport(() => {
    telecharge(new Blob([svgMarkup()], { type: 'image/svg+xml' }), `gs-bot-${state.value}.svg`)
  })
}

async function doExportPng() {
  await runExport(async () => {
    telecharge(await pngFromMarkup(svgMarkup(), EXPORT_SIZE), `gs-bot-${state.value}.png`)
  })
}

async function doExportSvgAnim() {
  await runExport(async () => {
    const { els, total } = await collectFrames()
    const inners = els.map((el, i) => frameInnerMarkup(el, `-f${i}`))
    telecharge(
      new Blob([filmStrip(inners, total, EXPORT_SIZE)], { type: 'image/svg+xml' }),
      `gs-bot-${state.value}-anime.svg`
    )
  })
}

async function doExportGif() {
  await runExport(async () => {
    const { els } = await collectFrames()
    const markups = els.map((el) => frameMarkup(el, GIF_SIZE))
    telecharge(await gifFromMarkups(markups, GIF_SIZE), `gs-bot-${state.value}.gif`)
  })
}

async function doCopyPng() {
  await runExport(async () => {
    await copyPng(svgMarkup(), EXPORT_SIZE)
    showNotice('图片已复制')
  })
}

async function doCopySvg() {
  await runExport(async () => {
    await copySvg(svgMarkup())
    showNotice('SVG 已复制')
  })
}

/**
 * Capture un cycle entier sur l'instance hors ecran : une frame par date du
 * montage, pilotee par `rendAt` (le composant est monte avec `frozenAt: 0`, sans
 * horloge). On retourne au debut a la fin pour permettre une seconde passe — le
 * GIF et le SVG anime en font chacun une.
 */
async function collectFrames(): Promise<{ els: SVGSVGElement[]; total: number }> {
  const comp = exporter.value!
  const seq = blocks.value
  const total = totalDuration(seq)
  const n = frameCount(total)
  const step = total / n
  const els: SVGSVGElement[] = []
  for (let i = 0; i < n; i++) {
    comp.rendAt(step * i)
    await nextTick()
    els.push(comp.$el as SVGSVGElement)
  }
  comp.rendAt(0)
  await nextTick()
  return { els, total }
}

async function runExport(task: () => Promise<void> | void) {
  if (busy.value) return
  busy.value = true
  menuOpen.value = false
  try {
    await task()
  } catch (err) {
    showNotice(err instanceof Error ? err.message : '导出失败')
  } finally {
    busy.value = false
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!menuOpen.value) return
  if (menu.value?.contains(event.target as Node)) return
  menuOpen.value = false
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  if (noticeTimer) clearTimeout(noticeTimer)
})

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
    <!-- Instance hors ecran montee figee (sans horloge), pilotee par rendAt
         pour capturer un cycle image par image : SVG anime et GIF. -->
    <div class="bloub__exporter" aria-hidden="true">
      <BloubBot
        ref="exporter"
        :size="64"
        :shape="shape"
        :color="color"
        :expression="expression"
        :cycle="blocks"
        :frozen-at="0"
      />
    </div>

    <!-- Infos en blocs flottants : pas de barre de titre, comme la reference. -->
    <div class="bloub__floats">
      <RouterLink to="/" class="bloub__float bloub__back" aria-label="返回 Lab" title="返回 Lab">
        <PhArrowLeft :size="16" />
      </RouterLink>
      <span class="bloub__float bloub__brand">
        <PhSmiley :size="15" weight="bold" />
        G's bot
      </span>
      <span ref="menu" class="bloub__float bloub__export">
        <div class="bloub__split">
          <button
            type="button"
            class="bloub__split-btn"
            :class="{ 'bloub__split-btn--busy': busy }"
            :disabled="busy"
            aria-label="导出 PNG"
            @click="doExportPng"
          >
            <PhDownloadSimple :size="14" />
            <span>{{ busy ? '导出中…' : '导出 PNG' }}</span>
          </button>
          <span class="bloub__split-divider" aria-hidden="true"></span>
          <button
            type="button"
            class="bloub__split-btn bloub__split-btn--caret"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            :disabled="busy"
            @click="menuOpen = !menuOpen"
          >
            <PhCaretUp :size="12" class="bloub__caret" :class="{ 'bloub__caret--open': menuOpen }" />
          </button>
        </div>
        <transition name="bloub-pop">
          <div v-if="menuOpen" class="bloub__dropdown" role="menu">
            <button type="button" class="bloub__item" role="menuitem" @click="doExportPng">
              下载 PNG
            </button>
            <button type="button" class="bloub__item" role="menuitem" @click="doExportSvg">
              下载 SVG
            </button>
            <button type="button" class="bloub__item" role="menuitem" @click="doExportSvgAnim">
              下载 SVG 动图
            </button>
            <button type="button" class="bloub__item" role="menuitem" @click="doExportGif">
              下载 GIF 动图
            </button>
            <div class="bloub__dropdown-sep"></div>
            <button type="button" class="bloub__item" role="menuitem" @click="doCopyPng">
              复制图片
            </button>
            <button type="button" class="bloub__item" role="menuitem" @click="doCopySvg">
              复制 SVG
            </button>
          </div>
        </transition>
        <transition name="bloub-pop">
          <span v-if="notice" class="bloub__notice">{{ notice }}</span>
        </transition>
      </span>
    </div>

    <div class="bloub__stage">
      <!-- Colonne apercu : le bot, ses controles et la grille d'etats cote a cote,
           pour qu'un clic sur un etat se voie sans defiler. -->
      <section class="bloub__bot">
        <BloubBot
          v-if="!frozen"
          ref="bot"
          :size="420"
          :shape="shape"
          :color="color"
          :expression="expression"
          :follow="true"
          :cycle="blocks"
          v-model:state="state"
          v-model:block="block"
          v-model:elapsed="elapsed"
          v-model:playing="playing"
        />
        <BloubBot
          v-else
          ref="bot"
          :size="420"
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
            <input v-model.number="freezeTime" type="range" min="0" max="3" step="0.05" />
            <span>{{ freezeTime.toFixed(2) }}s</span>
          </label>
          <span class="bloub__state-name">{{ stateLabels[state] }}</span>
        </div>

        <p class="bloub__hint">让鼠标在页面上移动，它的眼睛会跟着你。</p>

        <div class="bloub__states">
          <h3 class="bloub__states-title">动画 · 点击添加到序列</h3>
          <button
            v-for="s in order"
            :key="s.id"
            type="button"
            class="bloub__state"
            :class="{ 'bloub__state--active': state === s.id }"
            @click="appendState(s.id)"
          >
            <BloubBot
              :size="46"
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

      <!-- Colonne personnalisation : silhouettes encreees + pastilles. -->
      <aside class="bloub__panel">
        <div class="bloub__panel-inner">
          <section class="bloub__group">
            <h3 class="bloub__group-title">形状</h3>
            <div class="bloub__shapes">
              <button
                v-for="s in SHAPES"
                :key="s.id"
                type="button"
                class="bloub__shape"
                :class="{ 'bloub__shape--active': shape === s.id }"
                @click="shape = s.id"
              >
                <BloubBot :size="40" :shape="s.id" :frozen-at="1.2" />
                <span>{{ shapeLabels[s.id] }}</span>
              </button>
            </div>
          </section>

          <section class="bloub__group">
            <h3 class="bloub__group-title">表情</h3>
            <div class="bloub__exprs">
              <button
                v-for="e in EXPRESSIONS"
                :key="e.id"
                type="button"
                class="bloub__expr"
                :class="{ 'bloub__expr--active': expression === e.id }"
                @click="expression = e.id"
              >
                <BloubBot :size="40" :state="'idle'" :frozen-at="1.5" :expression="e.id" />
                <span>{{ expressionLabels[e.id] }}</span>
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
        </div>
      </aside>
    </div>

    <BloubTimeline
      v-model:blocks="blocks"
      :current="block"
      :elapsed="elapsed"
      :playing="playing"
      :total="totalDuration(blocks)"
      :shape="shape"
      :color="color"
      :expression="expression"
      @scrub="seekTo"
      @toggle-play="playing = !playing"
      @export-anim="doExportGif"
      @reset="resetCycle"
      @add="appendState"
    />
  </div>
</template>

<style scoped lang="scss">
.bloub {
  // Monochrome, scope a cette vue : les bordures suivent l'encre du theme
  // (noir sur fond clair, blanc sur fond sombre) au lieu de l'accent teal.
  --bloub-line: var(--color-border);
  --bloub-line-strong: var(--color-text);
  --bloub-accent-soft: color-mix(in srgb, var(--color-text) 7%, transparent);

  position: relative;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
}

/* ---------- blocs flottants (pas de barre de titre) ---------- */

.bloub__floats {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }
}

.bloub__float {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}

.bloub__back {
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  color: var(--color-text-muted);
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--color-text);
    border-color: var(--bloub-line-strong);
  }
}

.bloub__brand {
  color: var(--color-text-muted);
}

.bloub__export {
  position: relative;
  margin-left: auto;
  display: flex;
  gap: 8px;
  padding: 6px;
}

/* ---------- export : split button + menu deroulant + notice ---------- */

.bloub__exporter {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.bloub__split {
  display: inline-flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--color-text);
  border-radius: var(--radius-full);
  background: var(--color-text);
  color: var(--color-bg);
}

.bloub__split-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-bg) 12%, transparent);
  }

  &--caret {
    padding: 7px 9px;
  }

  &--busy {
    opacity: 0.6;
    cursor: progress;
  }
}

.bloub__split-divider {
  align-self: stretch;
  width: 1px;
  margin: 6px 0;
  background: color-mix(in srgb, var(--color-bg) 25%, transparent);
}

.bloub__caret {
  transition: transform 0.15s;
}

.bloub__caret--open {
  transform: rotate(180deg);
}

.bloub__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 168px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.12);
  z-index: 20;
}

.bloub__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;

  &:hover {
    background: var(--bloub-accent-soft);
  }
}

.bloub__dropdown-sep {
  height: 1px;
  margin: 6px 4px;
  background: var(--bloub-line);
}

.bloub__notice {
  display: inline-flex;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.bloub-pop-enter-active,
.bloub-pop-leave-active {
  transition: opacity 0.14s, transform 0.14s;
}

.bloub-pop-enter-from,
.bloub-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ---------- stage ---------- */

.bloub__stage {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 64px 20px 20px;
}

.bloub__bot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  min-height: 0;
  padding: 28px 20px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-lg);
}

.bloub__playback {
  display: flex;
  align-items: center;
  gap: 8px;
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
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    color: var(--color-text);
    border-color: var(--bloub-line-strong);
  }

  &--active {
    color: var(--color-text);
    border-color: var(--bloub-line-strong);
    background: var(--bloub-accent-soft);
  }
}

.bloub__freeze {
  display: inline-flex;
  align-items: center;
  gap: 8px;

  input[type='range'] {
    width: 110px;
    accent-color: var(--color-text);
  }

  span {
    font-size: 12px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
}

.bloub__state-name {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 7px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--bloub-line);
  font-variant-numeric: tabular-nums;
}

.bloub__hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* grille d'etats : compacte et toujours pres de l'apercu */
.bloub__states {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
  gap: 8px;
  width: 100%;
  max-width: 560px;
}

.bloub__states-title {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.bloub__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 7px 3px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--bloub-line);
  }

  span {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  &--active {
    border-color: var(--bloub-line-strong);
    background: var(--bloub-accent-soft);

    span {
      color: var(--color-text);
    }
  }
}

/* ---------- panneau personnalisation ---------- */

.bloub__panel {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bloub-line-strong) transparent;
}

.bloub__panel::-webkit-scrollbar {
  width: 8px;
}

.bloub__panel::-webkit-scrollbar-thumb {
  background: var(--bloub-line-strong);
  border-radius: 4px;
}

.bloub__panel-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 2px;
}

.bloub__group {
  background: var(--color-surface);
  border: 1px solid var(--bloub-line);
  border-radius: var(--radius-lg);
  padding: 12px;
}

.bloub__group-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}

/* silhouettes encreees : le bot d'encre, pas un libelle */
.bloub__shapes,
.bloub__exprs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.bloub__shape,
.bloub__expr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: var(--bloub-line);
  }

  span {
    font-size: 11px;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  &--active {
    border-color: var(--bloub-line-strong);
    background: var(--bloub-accent-soft);

    span {
      color: var(--color-text);
    }
  }
}

.bloub__colors {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.bloub__color {
  width: 26px;
  height: 26px;
  justify-self: center;
  border-radius: 50%;
  border: 2px solid var(--bloub-line);
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;

  &:hover {
    transform: scale(1.08);
  }

  &--active {
    border-color: var(--bloub-line-strong);
    box-shadow: 0 0 0 3px var(--bloub-accent-soft);
  }
}

/* ---------- empilement etroit ---------- */

@media (max-width: 960px) {
  .bloub {
    height: auto;
    overflow: visible;
  }

  .bloub__stage {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 64px;
  }

  .bloub__bot {
    justify-content: flex-start;
    overflow: visible;
  }

  .bloub__panel {
    overflow: visible;
  }

  .bloub__floats {
    flex-wrap: wrap;
  }
}
</style>
