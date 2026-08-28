<script setup lang="ts">
import { computed } from 'vue'
import type { LabDiff } from '@/learn/cc-lab'

const props = defineProps<{ diff: LabDiff | null }>()

const hasContent = computed(
  () =>
    !!props.diff &&
    (props.diff.newClasses.length > 0 ||
      props.diff.newTools.length > 0 ||
      props.diff.newFunctions.length > 0 ||
      props.diff.locDelta !== 0),
)

const visible = computed(() => (hasContent.value ? props.diff : null))
</script>

<template>
  <div v-if="visible" class="cc-wn">
    <div class="cc-wn__grid">
      <div v-if="visible.newClasses.length > 0" class="cc-wn__card">
        <h3 class="cc-wn__card-title">新类</h3>
        <div class="cc-wn__cls-list">
          <div v-for="cls in visible.newClasses" :key="cls" class="cc-wn__cls">{{ cls }}</div>
        </div>
      </div>

      <div v-if="visible.newTools.length > 0" class="cc-wn__card">
        <h3 class="cc-wn__card-title">新工具</h3>
        <div class="cc-wn__tool-list">
          <span v-for="tool in visible.newTools" :key="tool" class="cc-wn__tool">{{ tool }}</span>
        </div>
      </div>

      <div v-if="visible.newFunctions.length > 0" class="cc-wn__card">
        <h3 class="cc-wn__card-title">新函数</h3>
        <ul class="cc-wn__fn-list">
          <li v-for="fn in visible.newFunctions" :key="fn" class="cc-wn__fn">
            <span class="cc-wn__fn-def">def </span>{{ fn }}()
          </li>
        </ul>
      </div>

      <div v-if="visible.locDelta !== 0" class="cc-wn__card cc-wn__card--loc">
        <div>
          <h3 class="cc-wn__card-title">代码行数</h3>
          <p class="cc-wn__loc">+{{ visible.locDelta }} 行</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cc-wn__grid {
  display: grid;
  gap: 12px;
}

@media (min-width: 640px) {
  .cc-wn__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.cc-wn__card {
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.cc-wn__card--loc {
  display: flex;
  align-items: center;
}

.cc-wn__card-title {
  margin: 0 0 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.cc-wn__cls-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cc-wn__cls {
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: rgba(16, 185, 129, 0.1);
  color: #0f9d63;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
}

[data-theme='dark'] .cc-wn__cls {
  color: #6ee7b7;
}

.cc-wn__tool-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cc-wn__tool {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
}

[data-theme='dark'] .cc-wn__tool {
  color: #93c5fd;
}

.cc-wn__fn-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cc-wn__fn {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text);
}

.cc-wn__fn-def {
  color: var(--color-text-muted);
}

.cc-wn__loc {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #0f9d63;
}

[data-theme='dark'] .cc-wn__loc {
  color: #34d399;
}
</style>
