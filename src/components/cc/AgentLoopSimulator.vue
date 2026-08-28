<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import {
  PhUser,
  PhRobot,
  PhTerminal,
  PhArrowRight,
  PhWarningCircle,
  PhPlay,
  PhPause,
  PhSkipForward,
  PhArrowCounterClockwise,
} from '@phosphor-icons/vue'
import { useSimulator } from './useSimulator'
import { loadScenario, type SimStep } from '@/learn/cc-lab'

const props = defineProps<{ labId: string }>()

const scenario = ref<{ description: string; steps: SimStep[] } | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

const SPEEDS = [0.5, 1, 2, 4]

const sim = useSimulator(computed(() => scenario.value?.steps ?? []))

watch(
  () => props.labId,
  async (labId) => {
    scenario.value = null
    sim.reset()
    if (!labId) return
    scenario.value = await loadScenario(labId)
  },
  { immediate: true },
)

watch(
  () => sim.visibleSteps.value.length,
  () => {
    scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight, behavior: 'smooth' })
  },
)

const TYPE_CONFIG: Record<string, { icon: unknown; label: string; cls: string }> = {
  user_message: { icon: PhUser, label: 'User', cls: 'cc-sim--user' },
  assistant_text: { icon: PhRobot, label: 'Assistant', cls: 'cc-sim--assistant' },
  tool_call: { icon: PhTerminal, label: 'Tool Call', cls: 'cc-sim--tool' },
  tool_result: { icon: PhArrowRight, label: 'Tool Result', cls: 'cc-sim--result' },
  system_event: { icon: PhWarningCircle, label: 'System', cls: 'cc-sim--system' },
}

const FALLBACK_CONFIG = TYPE_CONFIG.assistant_text!

function configFor(step: SimStep) {
  return TYPE_CONFIG[step.type] ?? FALLBACK_CONFIG
}

const currentLabel = computed(() => Math.max(0, sim.currentIndex.value + 1))
</script>

<template>
  <section class="cc-sim">
    <template v-if="!scenario">
      <div class="cc-sim__na">该章节暂无模拟场景。</div>
    </template>
    <template v-else>
      <p class="cc-sim__desc">{{ scenario.description }}</p>

      <div class="cc-sim__box">
        <div class="cc-sim__controls">
          <button
            v-if="!sim.isPlaying.value"
            type="button"
            class="cc-sim__ctrl cc-sim__ctrl--primary"
            :disabled="sim.isComplete.value"
            title="播放"
            @click="sim.play"
          >
            <PhPlay :size="16" />
          </button>
          <button
            v-else
            type="button"
            class="cc-sim__ctrl cc-sim__ctrl--primary"
            title="暂停"
            @click="sim.pause"
          >
            <PhPause :size="16" />
          </button>
          <button
            type="button"
            class="cc-sim__ctrl"
            :disabled="sim.isComplete.value"
            title="单步"
            @click="sim.stepForward"
          >
            <PhSkipForward :size="16" />
          </button>
          <button
            type="button"
            class="cc-sim__ctrl"
            title="重置"
            @click="sim.reset"
          >
            <PhArrowCounterClockwise :size="16" />
          </button>

          <span class="cc-sim__speed-label">速度:</span>
          <button
            v-for="s in SPEEDS"
            :key="s"
            type="button"
            class="cc-sim__speed"
            :class="{ 'cc-sim__speed--on': sim.speed.value === s }"
            @click="sim.setSpeed(s)"
          >
            {{ s }}x
          </button>

          <span class="cc-sim__step">{{ currentLabel }} / {{ sim.totalSteps.value }}</span>
        </div>

        <div ref="scrollRef" class="cc-sim__stream">
          <div v-if="sim.visibleSteps.value.length === 0" class="cc-sim__hint">
            点击播放或单步开始
          </div>
          <div
            v-for="(step, i) in sim.visibleSteps.value"
            :key="i"
            class="cc-sim__msg"
            :class="configFor(step).cls"
          >
            <div class="cc-sim__msg-head">
              <component :is="configFor(step).icon" :size="14" />
              <span class="cc-sim__msg-label">
                {{ configFor(step).label }}
                <span v-if="step.toolName" class="cc-sim__msg-tool">{{ step.toolName }}</span>
              </span>
            </div>
            <pre v-if="step.type === 'tool_call' || step.type === 'tool_result'" class="cc-sim__code">{{ step.content || '(empty)' }}</pre>
            <pre v-else-if="step.type === 'system_event'" class="cc-sim__code cc-sim__code--system">{{ step.content }}</pre>
            <p v-else class="cc-sim__text">{{ step.content }}</p>
            <p class="cc-sim__annotation">{{ step.annotation }}</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.cc-sim__na {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-sim__desc {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-sim__box {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.cc-sim__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-2);
  flex-wrap: wrap;
}

.cc-sim__ctrl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  transition: background 0.15s;
}

.cc-sim__ctrl:hover {
  background: var(--color-surface-2);
}

.cc-sim__ctrl:disabled {
  opacity: 0.4;
  cursor: default;
}

.cc-sim__ctrl--primary {
  background: var(--color-text);
  color: var(--color-bg);
  border-color: var(--color-text);
}

.cc-sim__ctrl--primary:hover {
  background: var(--color-text);
  opacity: 0.85;
}

.cc-sim__speed-label {
  margin-left: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-sim__speed {
  padding: 3px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.cc-sim__speed:hover {
  color: var(--color-text);
}

.cc-sim__speed--on {
  background: var(--color-text);
  color: var(--color-bg);
}

.cc-sim__step {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-sim__stream {
  max-height: 500px;
  min-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.cc-sim__hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-sim__msg {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.cc-sim__msg-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--color-text-muted);
}

.cc-sim__msg-label {
  font-size: 12px;
  font-weight: 500;
}

.cc-sim__msg-tool {
  margin-left: 4px;
  font-family: var(--font-mono);
  color: var(--color-text);
}

.cc-sim__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.cc-sim__code {
  margin: 0;
  padding: 8px 10px;
  background: var(--color-surface-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text);
}

.cc-sim__code--system {
  background: rgba(168, 85, 247, 0.14);
}

.cc-sim__annotation {
  margin: 6px 0 0;
  font-size: 12.5px;
  font-style: italic;
  color: var(--color-text-muted);
}

.cc-sim--user {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.28);
}

.cc-sim--tool {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.28);
}

.cc-sim--result {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.28);
}

.cc-sim--system {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(168, 85, 247, 0.3);
}
</style>
