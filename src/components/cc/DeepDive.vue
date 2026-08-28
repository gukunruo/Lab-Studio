<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { loadVersions, type LabDiff } from '@/learn/cc-lab'
import ExecutionFlow from './ExecutionFlow.vue'
import ArchDiagram from './ArchDiagram.vue'
import WhatsNew from './WhatsNew.vue'
import DesignDecisions from './DesignDecisions.vue'

const props = defineProps<{ labId: string }>()

const versions = ref<Awaited<ReturnType<typeof loadVersions>>>(null)

watch(
  () => props.labId,
  async () => {
    versions.value = await loadVersions()
  },
  { immediate: true },
)

const diff = computed<LabDiff | null>(() => {
  const d = versions.value?.diffs.find((x) => x.to === props.labId)
  return d ?? null
})

const hasDiffContent = computed(() => {
  const d = diff.value
  return !!d && (d.newClasses.length > 0 || d.newTools.length > 0 || d.newFunctions.length > 0 || d.locDelta !== 0)
})
</script>

<template>
  <div class="cc-dd-wrap">
    <section class="cc-dd-sec">
      <h2 class="cc-dd-sec-title">执行流程</h2>
      <ExecutionFlow :lab-id="labId" />
    </section>

    <section class="cc-dd-sec">
      <h2 class="cc-dd-sec-title">架构</h2>
      <ArchDiagram :lab-id="labId" />
    </section>

    <section v-if="hasDiffContent" class="cc-dd-sec">
      <h2 class="cc-dd-sec-title">版本亮点</h2>
      <WhatsNew :diff="diff" />
    </section>

    <section class="cc-dd-sec">
      <h2 class="cc-dd-sec-title">设计决策</h2>
      <DesignDecisions :lab-id="labId" />
    </section>
  </div>
</template>

<style scoped lang="scss">
.cc-dd-sec {
  margin-bottom: 28px;
}

.cc-dd-sec:last-child {
  margin-bottom: 0;
}

.cc-dd-sec-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
</style>
