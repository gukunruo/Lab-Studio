<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowRight } from '@phosphor-icons/vue'
import { ccCrosswalkFor } from '@/learn/cc-crosswalks'

const props = defineProps<{ labId: string }>()

const crosswalk = computed(() => ccCrosswalkFor(props.labId))
</script>

<template>
  <div v-if="crosswalk" class="cc-xw">
    <section class="cc-xw__sec">
      <p class="cc-xw__intro">{{ crosswalk.intro }}</p>

      <div class="cc-xw__rows">
        <div
          v-for="(row, i) in crosswalk.rows"
          :key="i"
          class="cc-xw__row"
        >
          <div class="cc-xw__cell">
            <span class="cc-xw__label">课程</span>
            <p class="cc-xw__concept">{{ row.concept }}</p>
          </div>
          <PhArrowRight :size="16" class="cc-xw__arrow" />
          <div class="cc-xw__cell">
            <span class="cc-xw__label">你的实现</span>
            <p class="cc-xw__impl">{{ row.implementation }}</p>
            <p v-if="row.note" class="cc-xw__note">{{ row.note }}</p>
          </div>
        </div>
      </div>

      <p class="cc-xw__tip">{{ crosswalk.tip }}</p>

      <div class="cc-xw__files">
        <span class="cc-xw__files-label">相关文件</span>
        <code
          v-for="f in crosswalk.files"
          :key="f"
          class="cc-xw__file"
        >{{ f }}</code>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.cc-xw__sec {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cc-xw__intro {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--color-text);
}

.cc-xw__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-xw__row {
  display: grid;
  grid-template-columns: 1fr auto 1.4fr;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.cc-xw__arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.cc-xw__label {
  display: inline-block;
  margin-bottom: 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.cc-xw__concept,
.cc-xw__impl {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}

.cc-xw__impl {
  color: var(--color-text-muted);
}

.cc-xw__note {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.cc-xw__tip {
  margin: 0;
  padding: 12px 14px;
  border-left: 3px solid var(--cc-accent, var(--color-accent));
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  background: var(--color-surface-2);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text);
}

.cc-xw__files {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.cc-xw__files-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.cc-xw__file {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  color: var(--color-text-muted);
  background: var(--color-surface-2);
  padding: 2px 7px;
  border-radius: 6px;
}
</style>
