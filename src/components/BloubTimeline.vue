<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PhArrowCounterClockwise,
  PhDownloadSimple,
  PhPause,
  PhPlay,
  PhPlus,
  PhX
} from '@phosphor-icons/vue'
import BloubBot from '@/components/BloubBot.vue'
import { clampDuration, moveBlock, offsetOf, removeBlock, type Block } from '@/bot/cycles'
import { POSES, type StateId } from '@/bot/states'

/**
 * Editeur de sequence : la piste du bas, calquee sur bloub.vercel.app. Chaque
 * bloc est une vignette fige de l'etat, etirable a la duree choisie. Le moteur
 * restant une fonction pure du temps, toute l'edition passe par les fonctions
 * pures de `cycles.ts` (moveBlock/clampDuration/removeBlock) — aucune horloge,
 * aucun tableau manipule a la main.
 *
 * La vue ne tient pas l'etat du montage : elle recoit `blocks` et rend
 * `update:blocks` quand elle l'edite, puis `scrub`/`toggle-play`/`export-anim`/
 * `reset` pour piloter la lecture, l'export et la remise a zero par le haut.
 */
const props = withDefaults(
  defineProps<{
    blocks: Block[]
    /** index du bloc courant, pour la surbrillance et la tete de lecture */
    current: number
    /** secondes ecoulees dans le bloc courant */
    elapsed: number
    playing: boolean
    total: number
    shape: string
    color: string
    expression: string
  }>(),
  { current: 0, elapsed: 0, playing: false }
)

const emit = defineEmits<{
  (e: 'update:blocks', blocks: Block[]): void
  (e: 'scrub', t: number): void
  (e: 'toggle-play'): void
  (e: 'export-anim'): void
  (e: 'reset'): void
  (e: 'add', state: StateId): void
}>()

/** Largeur fixe par seconde : la piste est un axe temporel, pas une liste de cases. */
const PX = 60

const cur = computed(() => Math.min(props.current, props.blocks.length - 1))
const globalElapsed = computed(() => offsetOf(props.blocks, cur.value) + props.elapsed)
const trackWidth = computed(() => Math.max(props.total * PX, 560))
const playheadLeft = computed(() => Math.min(Math.max(globalElapsed.value, 0), props.total) * PX)

/** Graduations toutes les 2 secondes, comme la regle de la reference. */
const ticks = computed(() => {
  const out: number[] = []
  for (let t = 0; t <= props.total + 1e-6; t += 2) out.push(Math.round(t * 10) / 10)
  return out
})

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function blockWidth(b: Block): number {
  return b.duration * PX
}

function seekTo(i: number) {
  emit('scrub', offsetOf(props.blocks, i) + 0.001)
}

function remove(i: number) {
  if (props.blocks.length <= 1) return
  emit('update:blocks', removeBlock(props.blocks, i))
}

/* ------------------------------------------------------- trier par glisser */

const dragIndex = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(e: DragEvent, i: number) {
  dragIndex.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}

function onDragOver(e: DragEvent, i: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragIndex.value === null || i === dragIndex.value) return
  dragOver.value = i
}

function onDrop(e: DragEvent, i: number) {
  e.preventDefault()
  const from = dragIndex.value
  dragIndex.value = null
  dragOver.value = null
  if (from === null || from === i) return
  emit('update:blocks', moveBlock(props.blocks, from, i))
}

function onDragEnd() {
  dragIndex.value = null
  dragOver.value = null
}

/* ----------------------------------------------------------- etirer la duree */

const resizing = ref<number | null>(null)
let resizeStartX = 0
let resizeStartDur = 0

function onResizeStart(e: PointerEvent, i: number) {
  e.preventDefault()
  e.stopPropagation()
  resizing.value = i
  resizeStartX = e.clientX
  resizeStartDur = props.blocks[i]!.duration
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent) {
  if (resizing.value === null) return
  const i = resizing.value
  const delta = (e.clientX - resizeStartX) / PX
  const dur = clampDuration(props.blocks[i]!.state, resizeStartDur + delta)
  const next = props.blocks.slice()
  next[i] = { ...next[i]!, duration: dur }
  emit('update:blocks', next)
}

function onResizeEnd(e: PointerEvent) {
  resizing.value = null
  try {
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  } catch {
    /* deja relache */
  }
}

/* -------------------------------------------------------- regle + tete de lecture */

const scrubbing = ref(false)

function onScrubStart(e: PointerEvent) {
  scrubbing.value = true
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('scrub', clampT((e.clientX - rect.left) / PX))
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
}

function onScrubMove(e: PointerEvent) {
  if (!scrubbing.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('scrub', clampT((e.clientX - rect.left) / PX))
}

function onScrubEnd(e: PointerEvent) {
  scrubbing.value = false
  try {
    ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
  } catch {
    /* deja relache */
  }
}

function clampT(t: number): number {
  return Math.min(Math.max(t, 0), props.total)
}
</script>

<template>
  <div class="bloub__timeline">
    <div class="bloub__controls">
      <button
        type="button"
        class="bloub__ctl"
        :class="{ 'bloub__ctl--active': props.playing }"
        @click="emit('toggle-play')"
      >
        <component :is="props.playing ? PhPause : PhPlay" :size="14" />
        {{ props.playing ? '暂停' : '播放' }}
      </button>
      <span class="bloub__time">{{ fmtTime(globalElapsed) }} / {{ fmtTime(props.total) }}</span>
      <span class="bloub__spacer"></span>
      <button type="button" class="bloub__ctl" @click="emit('reset')">
        <PhArrowCounterClockwise :size="14" />
        重置
      </button>
      <button type="button" class="bloub__ctl bloub__ctl--primary" @click="emit('export-anim')">
        <PhDownloadSimple :size="14" />
        导出动画序列
      </button>
    </div>

    <div class="bloub__scroller">
      <div class="bloub__track" :style="{ width: trackWidth + 'px' }">
        <div
          class="bloub__ruler"
          @pointerdown="onScrubStart"
          @pointermove="onScrubMove"
          @pointerup="onScrubEnd"
          @pointercancel="onScrubEnd"
        >
          <span v-for="t in ticks" :key="t" class="bloub__tick" :style="{ left: t * PX + 'px' }">
            {{ t }}秒
          </span>
        </div>

        <div class="bloub__blocks">
          <div
            v-for="(b, i) in props.blocks"
            :key="i"
            class="bloub__block"
            :class="{
              'bloub__block--current': i === cur,
              'bloub__block--over': i === dragOver
            }"
            :style="{ width: blockWidth(b) + 'px' }"
            draggable="true"
            @click.stop="seekTo(i)"
            @dragstart="onDragStart($event, i)"
            @dragover="onDragOver($event, i)"
            @drop="onDrop($event, i)"
            @dragend="onDragEnd"
          >
            <div class="bloub__thumb">
              <BloubBot
                :size="44"
                :state="b.state"
                :frozen-at="POSES[b.state]"
                :shape="props.shape"
                :color="props.color"
                :expression="props.expression"
              />
            </div>
            <span class="bloub__dur">{{ b.duration.toFixed(1) }}秒</span>
            <button
              type="button"
              class="bloub__delete"
              aria-label="删除"
              @click.stop="remove(i)"
              @pointerdown.stop
              @dragstart.stop.prevent
            >
              <PhX :size="12" />
            </button>
            <div
              class="bloub__resize"
              @pointerdown="onResizeStart($event, i)"
              @pointermove="onResizeMove"
              @pointerup="onResizeEnd"
              @pointercancel="onResizeEnd"
              @click.stop
              @dragstart.stop.prevent
              aria-hidden="true"
            ></div>
          </div>

          <button type="button" class="bloub__add" aria-label="添加动画" @click="emit('add', 'idle')">
            <PhPlus :size="16" />
          </button>
        </div>

        <div class="bloub__playhead" :style="{ left: playheadLeft + 'px' }">
          <span class="bloub__playhead-knob"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.bloub__timeline {
  --tl-line: var(--bloub-line, var(--color-border));
  --tl-line-strong: var(--bloub-line-strong, var(--color-text));
  --tl-accent: var(--bloub-accent-soft, color-mix(in srgb, var(--color-text) 7%, transparent));

  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 18px 14px;
  border-top: 1px solid var(--tl-line);
  background: var(--color-surface);
}

/* ---------- rangée de commandes ---------- */

.bloub__controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bloub__ctl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--tl-line);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:hover {
    color: var(--color-text);
    border-color: var(--tl-line-strong);
  }

  &--active {
    color: var(--color-text);
    border-color: var(--tl-line-strong);
    background: var(--tl-accent);
  }

  &--primary {
    color: var(--color-bg);
    background: var(--color-text);
    border-color: var(--color-text);

    &:hover {
      opacity: 0.88;
    }
  }
}

.bloub__time {
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.bloub__spacer {
  flex: 1 1 auto;
}

/* ---------- piste ---------- */

.bloub__scroller {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--tl-line-strong) transparent;
}

.bloub__scroller::-webkit-scrollbar {
  height: 8px;
}

.bloub__scroller::-webkit-scrollbar-thumb {
  background: var(--tl-line-strong);
  border-radius: 4px;
}

.bloub__track {
  position: relative;
}

.bloub__ruler {
  position: relative;
  height: 22px;
  cursor: pointer;
}

.bloub__tick {
  position: absolute;
  top: 5px;
  transform: translateX(2px);
  font-size: 10px;
  color: var(--color-text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ---------- blocs ---------- */

.bloub__blocks {
  display: flex;
  gap: 4px;
  padding: 4px 0 12px;
}

.bloub__block {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 34px;
  padding: 5px 0 6px;
  border: 2px solid var(--tl-line);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  overflow: hidden;
  cursor: grab;
  transition: border-color 0.12s, background 0.12s;

  &:active {
    cursor: grabbing;
  }

  &--current {
    border-color: var(--tl-line-strong);
    background: var(--tl-accent);
  }

  &--over {
    border-color: var(--tl-accent);
    background: var(--tl-accent);
  }
}

.bloub__thumb {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
}

.bloub__dur {
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bloub__delete {
  position: absolute;
  top: 2px;
  right: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--tl-line-strong);
  color: var(--color-bg);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, transform 0.12s;

  &:hover {
    transform: scale(1.1);
  }
}

.bloub__block:hover .bloub__delete {
  opacity: 1;
}

.bloub__resize {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 7px;
  cursor: ew-resize;
}

.bloub__add {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-end;
  width: 44px;
  height: 56px;
  padding: 0;
  border: 2px dashed var(--tl-line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;

  &:hover {
    color: var(--color-text);
    border-color: var(--tl-line-strong);
  }
}

/* ---------- tête de lecture ---------- */

.bloub__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--tl-line-strong);
  pointer-events: none;
}

.bloub__playhead-knob {
  position: absolute;
  top: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: var(--tl-line-strong);
}
</style>
