<script setup lang="ts">
import { PhArrowLeft, PhArrowRight, PhCheckCircle, PhCircle } from '@phosphor-icons/vue'
import { useLocaleStore } from '@/stores/locale'

defineProps<{
  done: boolean
  prev: string | null
  next: string | null
}>()

defineEmits<{ toggle: []; prev: []; next: [] }>()

const i18n = useLocaleStore()
</script>

<template>
  <footer class="rfoot">
    <button
      type="button"
      class="rfoot__done"
      :class="{ 'rfoot__done--on': done }"
      @click="$emit('toggle')"
    >
      <PhCheckCircle v-if="done" :size="15" weight="fill" />
      <PhCircle v-else :size="15" />
      <span>{{ done ? i18n.tl({ zh: '已完成', en: 'Completed' }) : i18n.tl({ zh: '标记完成', en: 'Mark done' }) }}</span>
    </button>
    <div class="rfoot__nav">
      <button v-if="prev" type="button" class="rfoot__link" @click="$emit('prev')">
        <PhArrowLeft :size="14" />
        <span>{{ prev }}</span>
      </button>
      <button v-if="next" type="button" class="rfoot__link" @click="$emit('next')">
        <span>{{ next }}</span>
        <PhArrowRight :size="14" />
      </button>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.rfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--color-border-subtle);
}

.rfoot__done {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.rfoot__done:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.rfoot__done--on {
  color: var(--color-accent-strong);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.rfoot__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.rfoot__link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 260px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s;
}

.rfoot__link:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.rfoot__link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
