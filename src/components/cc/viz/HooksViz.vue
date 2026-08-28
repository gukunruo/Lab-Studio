<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhRadio,
  PhScroll,
  PhPlugCharging,
  PhWrench,
  PhFileMagnifyingGlass,
  PhClipboardText,
  PhSignOut,
} from '@phosphor-icons/vue'

// s04 — Hook Workbench。注册表 + “本回合”卡片：hook 回调挂在循环之外，事件名触发。

defineProps<{ title?: string }>()

type HookId = 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop'
type Tone = 'blue' | 'amber' | 'emerald' | 'zinc'

interface Hook {
  id: HookId
  when: string
  callbacks: string[]
  color: Tone
}

const HOOKS: Hook[] = [
  {
    id: 'UserPromptSubmit',
    when: 'after input, before LLM',
    callbacks: ['context_inject_hook'],
    color: 'blue',
  },
  {
    id: 'PreToolUse',
    when: 'after tool_use, before handler',
    callbacks: ['permission_hook', 'log_hook'],
    color: 'amber',
  },
  {
    id: 'PostToolUse',
    when: 'after handler, before next turn',
    callbacks: ['large_output_hook'],
    color: 'emerald',
  },
  {
    id: 'Stop',
    when: 'before final output',
    callbacks: ['summary_hook'],
    color: 'zinc',
  },
]

interface StepInfo {
  title: string
  desc: string
  active: HookId | null
}

const STEP_INFO: StepInfo[] = [
  {
    title: 'Hooks Are Registered Outside the Loop',
    desc: 'The loop only knows event names; callback behavior lives in the registry.',
    active: null,
  },
  {
    title: 'UserPromptSubmit',
    desc: 'Input hooks can log, validate, or inject context before the model sees the prompt.',
    active: 'UserPromptSubmit',
  },
  {
    title: 'The Core Loop Still Chooses a Tool',
    desc: 'Calling the model and receiving tool_use remains the same as before.',
    active: null,
  },
  {
    title: 'PreToolUse',
    desc: 'Permission and logging hooks run before the handler touches the workspace.',
    active: 'PreToolUse',
  },
  {
    title: 'PostToolUse',
    desc: 'Result hooks inspect output or trigger side effects after execution.',
    active: 'PostToolUse',
  },
  {
    title: 'Stop',
    desc: 'Cleanup and summary hooks run when the model stops asking for tools.',
    active: 'Stop',
  },
]

interface TurnState {
  title: string
  body: string
  icon: Component
}

const TURN_STATES: TurnState[] = [
  { title: 'User input', body: 'Read README.md and summarize it.', icon: PhScroll },
  { title: 'User input', body: 'Read README.md and summarize it.', icon: PhScroll },
  { title: 'LLM chooses tool', body: "tool_use: read_file({ path: 'README.md' })", icon: PhWrench },
  { title: 'Tool waits at pre-hook', body: 'permission_hook + log_hook inspect the call.', icon: PhFileMagnifyingGlass },
  { title: 'Handler returned output', body: 'large_output_hook checks result size.', icon: PhClipboardText },
  { title: 'No more tool_use', body: 'summary_hook records final session stats.', icon: PhSignOut },
]

const AUDIT_ITEMS = [
  '[registry] four hook slots registered',
  '[UserPromptSubmit] working directory logged',
  '[loop] model returned read_file tool_use',
  '[PreToolUse] permission allowed; tool call logged',
  '[PostToolUse] output size checked',
  '[Stop] session used 1 tool call',
]

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEP_INFO.length,
  autoPlayInterval: 2500,
})

const stepInfo = computed(() => STEP_INFO[currentStep.value] ?? STEP_INFO[0]!)
const activeHook = computed(() => stepInfo.value.active)
const isRegistryActive = computed(() => currentStep.value === 0 || activeHook.value !== null)
const isThisTurnActive = computed(() => currentStep.value >= 1)
const turnState = computed(() => TURN_STATES[currentStep.value] ?? TURN_STATES[0]!)
const auditItems = computed(() => AUDIT_ITEMS.slice(0, currentStep.value + 1))
</script>

<template>
  <section class="cc-viz cc-viz--hooks">
    <h2 class="cc-hooks__title">{{ title || 'Hook Workbench' }}</h2>

    <div class="cc-viz__panel">
      <div class="cc-hooks__note cc-hooks__note--emerald">
        The loop stays boring on purpose: it calls
        <span class="cc-hooks__mono">trigger_hooks(event)</span>, and the registry decides what extra logic runs.
      </div>

      <div class="cc-hooks__grid">
        <div class="cc-hooks__surface" :class="{ 'cc-hooks__surface--active': isRegistryActive }">
          <div class="cc-hooks__surface-head">
            <span
              class="cc-hooks__surface-icon"
              :class="{ 'cc-hooks__surface-icon--active': isRegistryActive }"
            >
              <PhRadio :size="20" />
            </span>
            <span class="cc-hooks__surface-title">Hook registry</span>
          </div>
          <div class="cc-hooks__cards">
            <div
              v-for="hook in HOOKS"
              :key="hook.id"
              class="cc-hooks__hook"
              :class="[
                activeHook === hook.id ? `cc-hooks__hook--${hook.color}` : 'cc-hooks__hook--inactive',
                { 'cc-hooks__hook--active': activeHook === hook.id },
              ]"
            >
              <div class="cc-hooks__hook-head">
                <div class="cc-hooks__hook-id">{{ hook.id }}</div>
                <PhPlugCharging v-if="activeHook === hook.id" :size="16" class="cc-hooks__hook-plug" />
              </div>
              <div class="cc-hooks__hook-when">{{ hook.when }}</div>
              <div class="cc-hooks__chips">
                <span
                  v-for="cb in hook.callbacks"
                  :key="cb"
                  class="cc-hooks__chip"
                >{{ cb }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="cc-hooks__surface" :class="{ 'cc-hooks__surface--active': isThisTurnActive }">
          <div class="cc-hooks__surface-head">
            <span
              class="cc-hooks__surface-icon"
              :class="{ 'cc-hooks__surface-icon--active': isThisTurnActive }"
            >
              <PhScroll :size="20" />
            </span>
            <span class="cc-hooks__surface-title">This turn</span>
          </div>
          <div class="cc-hooks__turn">
            <div :key="turnState.title" class="cc-hooks__turn-card">
              <div class="cc-hooks__turn-head">
                <component :is="turnState.icon" :size="18" />
                <span>{{ turnState.title }}</span>
              </div>
              <div class="cc-hooks__turn-body">{{ turnState.body }}</div>
            </div>
            <div class="cc-hooks__audit">
              <div class="cc-hooks__audit-title">Audit log</div>
              <div class="cc-hooks__audit-list">
                <div
                  v-for="item in auditItems"
                  :key="item"
                  class="cc-hooks__audit-item"
                >{{ item }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cc-hooks__note cc-hooks__note--zinc">
        Beginner rule: adding behavior means registering a callback, not editing the core model-tool-result loop.
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="STEP_INFO.length"
      :is-playing="isPlaying"
      :step-title="stepInfo.title"
      :step-description="stepInfo.desc"
      @prev="prev"
      @next="next"
      @reset="reset"
      @toggle="toggleAutoPlay"
    />
  </section>
</template>

<style scoped lang="scss">
.cc-viz--hooks {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

.cc-hooks__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__panel {
  padding: 16px;
}

.cc-hooks__note {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.625;
}

.cc-hooks__note--emerald {
  border: 1px solid #a7f3d0;
  background: #ecfdf5;
  color: #065f46;
}

[data-theme='dark'] .cc-hooks__note--emerald {
  border-color: #064e3b;
  background: rgba(6, 78, 59, 0.3);
  color: #a7f3d0;
}

.cc-hooks__note--zinc {
  margin-top: 16px;
  border: 1px solid #e4e4e7;
  background: #fafafa;
  color: #52525b;
}

[data-theme='dark'] .cc-hooks__note--zinc {
  border-color: #3f3f46;
  background: #27272a;
  color: #d4d4d8;
}

.cc-hooks__mono {
  font-family: var(--font-mono);
}

.cc-hooks__grid {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.cc-hooks__surface {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  transition: border-color 0.3s, background 0.3s;
}

[data-theme='dark'] .cc-hooks__surface {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-hooks__surface--active {
  border-color: #6ee7b7;
  background: #ecfdf5;
}

[data-theme='dark'] .cc-hooks__surface--active {
  border-color: #064e3b;
  background: rgba(6, 78, 59, 0.3);
}

.cc-hooks__surface-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-hooks__surface-head {
  color: #f4f4f5;
}

.cc-hooks__surface-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #71717a;
}

[data-theme='dark'] .cc-hooks__surface-icon {
  background: #27272a;
  color: #d4d4d8;
}

.cc-hooks__surface-icon--active,
[data-theme='dark'] .cc-hooks__surface-icon--active {
  background: #10b981;
  color: #ffffff;
}

.cc-hooks__cards {
  display: grid;
  gap: 8px;
}

.cc-hooks__hook {
  padding: 12px;
  border-radius: 8px;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}

.cc-hooks__hook--inactive {
  border: 1px solid #e4e4e7;
  background: #ffffff;
  color: #3f3f46;
}

[data-theme='dark'] .cc-hooks__hook--inactive {
  border-color: #3f3f46;
  background: #18181b;
  color: #e4e4e7;
}

.cc-hooks__hook--blue {
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1e40af;
}

[data-theme='dark'] .cc-hooks__hook--blue {
  border-color: #1e3a8a;
  background: rgba(30, 58, 138, 0.4);
  color: #bfdbfe;
}

.cc-hooks__hook--amber {
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
}

[data-theme='dark'] .cc-hooks__hook--amber {
  border-color: #78350f;
  background: rgba(120, 53, 15, 0.4);
  color: #fde68a;
}

.cc-hooks__hook--emerald {
  border: 1px solid #a7f3d0;
  background: #ecfdf5;
  color: #065f46;
}

[data-theme='dark'] .cc-hooks__hook--emerald {
  border-color: #064e3b;
  background: rgba(6, 78, 59, 0.4);
  color: #a7f3d0;
}

.cc-hooks__hook--zinc {
  border: 1px solid #e4e4e7;
  background: #fafafa;
  color: #3f3f46;
}

[data-theme='dark'] .cc-hooks__hook--zinc {
  border-color: #3f3f46;
  background: #27272a;
  color: #e4e4e7;
}

.cc-hooks__hook--active {
  animation: cc-hooks-bob 0.8s ease-in-out infinite;
}

@keyframes cc-hooks-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

.cc-hooks__hook-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.cc-hooks__hook-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
}

.cc-hooks__hook-plug {
  flex-shrink: 0;
}

.cc-hooks__hook-when {
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.625;
  opacity: 0.8;
}

.cc-hooks__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cc-hooks__chip {
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  font-family: var(--font-mono);
  font-size: 11px;
}

[data-theme='dark'] .cc-hooks__chip {
  background: rgba(9, 9, 11, 0.3);
}

.cc-hooks__turn {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-hooks__turn-card {
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  animation: cc-hooks-turn 0.3s ease both;
}

[data-theme='dark'] .cc-hooks__turn-card {
  border-color: #3f3f46;
  background: #18181b;
}

@keyframes cc-hooks-turn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.cc-hooks__turn-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-hooks__turn-head {
  color: #f4f4f5;
}

.cc-hooks__turn-body {
  padding: 12px;
  border-radius: 8px;
  background: #fafafa;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.625;
  color: #52525b;
}

[data-theme='dark'] .cc-hooks__turn-body {
  background: #27272a;
  color: #d4d4d8;
}

.cc-hooks__audit {
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
}

[data-theme='dark'] .cc-hooks__audit {
  border-color: #3f3f46;
  background: rgba(39, 39, 42, 0.7);
}

.cc-hooks__audit-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}

[data-theme='dark'] .cc-hooks__audit-title {
  color: #f4f4f5;
}

.cc-hooks__audit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-hooks__audit-item {
  padding: 8px 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  font-family: var(--font-mono);
  font-size: 12px;
  color: #3f3f46;
  animation: cc-hooks-audit 0.2s ease both;
}

[data-theme='dark'] .cc-hooks__audit-item {
  border-color: #3f3f46;
  background: #18181b;
  color: #e4e4e7;
}

@keyframes cc-hooks-audit {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (min-width: 640px) {
  .cc-hooks__cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1200px) {
  .cc-hooks__grid {
    grid-template-columns: 1.15fr 0.85fr;
  }
}
</style>
