<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ name: 'ResizeGutter' })

const props = defineProps<{
  min: number
  max: number
  value: number
  reverse?: boolean
}>()
const emit = defineEmits<{ resize: [number]; dragstart: []; dragend: [] }>()

const dragging = ref(false)
let startX = 0
let startW = 0

function onDown(e: PointerEvent) {
  dragging.value = true
  startX = e.clientX
  startW = props.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
  emit('dragstart')
}
function onMove(e: PointerEvent) {
  if (!dragging.value) return
  const delta = e.clientX - startX
  emit('resize', props.reverse ? startW - delta : startW + delta)
}
function onUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  emit('dragend')
}
function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 32 : 8
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    emit('resize', props.reverse ? props.value + step : props.value - step)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    emit('resize', props.reverse ? props.value - step : props.value + step)
  }
}
</script>

<template>
  <div
    class="gutter"
    :class="{ 'gutter--drag': dragging }"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown="onKeydown"
  >
    <span class="gutter__line" />
  </div>
</template>

<style scoped lang="scss">
.gutter {
  position: relative;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  z-index: 6;
  outline: none;
}

.gutter::before {
  content: '';
  position: absolute;
  inset: 0 -3px;
  z-index: 1;
}

.gutter__line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  transform: translateX(-50%);
  background: var(--color-border);
  transition:
    background 0.15s,
    width 0.15s,
    opacity 0.15s;
  opacity: 0.7;
}

.gutter:hover .gutter__line,
.gutter:focus-visible .gutter__line,
.gutter--drag .gutter__line {
  background: var(--color-accent);
  width: 2px;
  opacity: 1;
}

.gutter--drag {
  cursor: grabbing;
}
</style>
