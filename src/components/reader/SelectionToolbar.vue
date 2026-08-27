<script setup lang="ts">
import { ref } from 'vue'
import { PhHighlighter, PhCopy, PhChatText } from '@phosphor-icons/vue'
import { ANNOTATION_COLORS, type AnnotationColor } from '@/learn/annotations'

defineProps<{ x: number; y: number }>()
const emit = defineEmits<{
  annotate: [color: AnnotationColor]
  copy: []
  explain: []
}>()

const colorMenuOpen = ref(false)

function keepSelection(event: MouseEvent) {
  event.stopPropagation()
}
</script>

<template>
  <div
    class="selection-toolbar"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="toolbar"
    aria-label="选中文本工具"
    @mousedown="keepSelection"
  >
    <div class="selection-toolbar__color-action">
      <button type="button" title="标注颜色" @click.stop="colorMenuOpen = !colorMenuOpen">
        <PhHighlighter :size="15" />
      </button>
      <div v-if="colorMenuOpen" class="selection-toolbar__color-menu" role="menu">
        <button
          v-for="color in ANNOTATION_COLORS"
          :key="color.value"
          type="button"
          role="menuitem"
          :class="`selection-toolbar__swatch selection-toolbar__swatch--${color.value}`"
          :title="color.label"
          @click.stop="emit('annotate', color.value)"
        />
      </div>
    </div>
    <button type="button" title="复制" @click.stop="emit('copy')"><PhCopy :size="15" /></button>
    <button type="button" title="AI 解释" @click.stop="emit('explain')"><PhChatText :size="15" /></button>
  </div>
</template>

<style scoped lang="scss">
.selection-toolbar {
  position: fixed;
  z-index: 80;
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.selection-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.selection-toolbar button:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}

.selection-toolbar > .selection-toolbar__color-action button {
  color: var(--color-accent);
}

.selection-toolbar__color-action {
  position: relative;
}

.selection-toolbar__color-menu {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  display: flex;
  gap: 5px;
  padding: 6px;
  transform: translateX(-50%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}

.selection-toolbar__swatch {
  width: 18px !important;
  height: 18px !important;
  border: 2px solid var(--color-bg) !important;
  border-radius: 50% !important;
  box-shadow: 0 0 0 1px var(--color-border);
}

.selection-toolbar__swatch--yellow { background: #facc15 !important; }
.selection-toolbar__swatch--green { background: #5eead4 !important; }
.selection-toolbar__swatch--blue { background: #60a5fa !important; }
.selection-toolbar__swatch--pink { background: #f9a8d4 !important; }
.selection-toolbar__swatch--purple { background: #c4b5fd !important; }

@media (max-width: 640px) {
  .selection-toolbar {
    left: 0 !important;
    right: 0;
    top: auto !important;
    bottom: calc(60px + env(safe-area-inset-bottom));
    justify-content: center;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }
}
</style>
