<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { PhCaretDown } from '@phosphor-icons/vue'
import { loadAnnotations, type LabAnnotations } from '@/learn/cc-lab'

const props = defineProps<{ labId: string }>()

const annotations = ref<LabAnnotations | null>(null)
const openId = ref<string | null>(null)

watch(
  () => props.labId,
  async (labId) => {
    annotations.value = null
    openId.value = null
    if (!labId) return
    annotations.value = await loadAnnotations(labId)
  },
  { immediate: true },
)

interface DecisionView {
  id: string
  title: string
  description: string
  alternatives: string
}

const decisions = computed<DecisionView[]>(() =>
  (annotations.value?.decisions ?? []).map((d) => ({
    id: d.id,
    title: d.zh?.title ?? d.title,
    description: d.zh?.description ?? d.description,
    alternatives: d.alternatives,
  })),
)

function toggle(id: string) {
  openId.value = openId.value === id ? null : id
}
</script>

<template>
  <div class="cc-dd">
    <template v-if="decisions.length === 0">
      <div class="cc-dd__na">该章节暂无设计决策。</div>
    </template>
    <template v-else>
      <div class="cc-dd__list">
        <div
          v-for="(d, i) in decisions"
          :key="d.id"
          class="cc-dd__item"
          :style="{ animationDelay: `${i * 0.05}s` }"
        >
          <button
            type="button"
            class="cc-dd__head"
            :aria-expanded="openId === d.id"
            @click="toggle(d.id)"
          >
            <span class="cc-dd__title">{{ d.title }}</span>
            <PhCaretDown
              :size="16"
              class="cc-dd__chev"
              :class="{ 'cc-dd__chev--open': openId === d.id }"
            />
          </button>
          <div v-show="openId === d.id" class="cc-dd__body">
            <p class="cc-dd__desc">{{ d.description }}</p>
            <div v-if="d.alternatives" class="cc-dd__alt">
              <h4 class="cc-dd__alt-title">备选方案</h4>
              <p class="cc-dd__alt-text">{{ d.alternatives }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cc-dd__na {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-dd__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-dd__item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  animation: cc-dd-enter 0.3s ease both;
}

@keyframes cc-dd-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.cc-dd__head {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.cc-dd__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-dd__chev {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}

.cc-dd__chev--open {
  transform: rotate(180deg);
}

.cc-dd__body {
  padding: 0 16px 14px;
  border-top: 1px solid var(--color-border-subtle);
}

.cc-dd__desc {
  margin: 12px 0 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--color-text-muted);
}

.cc-dd__alt {
  margin-top: 12px;
}

.cc-dd__alt-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.cc-dd__alt-text {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
}
</style>
