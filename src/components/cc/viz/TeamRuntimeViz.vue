<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhUsers,
  PhClipboardText,
  PhGitBranch,
  PhMailbox,
  PhMagnifyingGlass,
  PhLockKey,
  PhCheckCircle,
  PhTerminal,
} from '@phosphor-icons/vue'

// s13 — Team Runtime。Lead/Teammate/Protocol 状态面板 + Task board + Task directory +
// Runtime events 时间线，演示多代理运行时的分工、锁、计划门禁与工作树路由。

defineProps<{ title?: string }>()

type Tone = 'zinc' | 'blue' | 'amber' | 'emerald'

const STEPS = [
  {
    title: 'Confirm a Small Team',
    desc: 'The Lead proposes focused roles and waits for the user before starting persistent teammates.',
    event: 'lead proposes: backend + tests',
  },
  {
    title: 'Claim Atomically',
    desc: 'A ready task moves to one owner while the task-store file lock protects the persisted transition.',
    event: 'task_store_lock: task_1a2b3c4d -> backend',
  },
  {
    title: 'Require and Review a Plan',
    desc: 'The gate is active before the teammate starts; the Lead reviews the typed request for this task and work version.',
    event: 'review_plan(req_000007, approve=true)',
  },
  {
    title: 'Route Tools to the Task Directory',
    desc: 'The claimed task carries its worktree binding; bash, read, and write derive their cwd from that record.',
    event: 'cwd -> .worktrees/auth-refactor',
  },
  {
    title: 'Execute the Approved Work',
    desc: "Mutating tools run only after the current assignment's plan is approved.",
    event: 'bash / write: allowed',
  },
  {
    title: 'Return the Result, Keep the Teammate',
    desc: 'Completion keeps the task cwd through the turn; IDLE releases the assignment and keeps the teammate available.',
    event: 'complete -> result -> IDLE',
  },
] as const

const EVENTS = STEPS.map((step) => step.event)

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2800,
})

const stepInfo = computed(() => STEPS[currentStep.value] ?? STEPS[0]!)

// RuntimePanel
const runtimeTone = computed<Tone>(() =>
  currentStep.value === 0 ? 'zinc' : currentStep.value === 5 ? 'emerald' : 'blue',
)
const runtimeState = computed(() => {
  const s = currentStep.value
  return s === 0 ? 'awaiting confirmation' : s === 1 ? 'working' : s === 5 ? 'idle' : 'active'
})
const runtimeLead = computed(() => {
  const s = currentStep.value
  return s === 0 ? 'proposes roles' : s === 5 ? 'receives result' : 'coordinates'
})
const runtimeProtocol = computed(() => (currentStep.value < 2 ? '-' : 'request_id=req_000007'))
const runtimeMessage = computed(() => {
  const s = currentStep.value
  if (s === 0) return 'No mailbox is created before confirmation.'
  if (s === 2) return 'The approval is tied to the claimed task and work version.'
  if (s === 5) return 'The result wakes the Lead; IDLE releases the cwd lease.'
  return 'The runtime owns delivery while the teammate works.'
})

// TaskPanel
const taskStatus = computed(() =>
  currentStep.value < 1 ? 'pending' : currentStep.value < 5 ? 'in_progress' : 'completed',
)
const taskTone = computed<Tone>(() =>
  taskStatus.value === 'pending' ? 'zinc' : taskStatus.value === 'in_progress' ? 'amber' : 'emerald',
)
const taskOwner = computed(() => (currentStep.value < 1 ? '-' : 'backend'))
const taskMessage = computed(() => {
  const s = currentStep.value
  if (s < 1) return 'Waiting for the teammate loop.'
  if (s === 1) return 'The claim check and update share one lock.'
  return 'The claimed task remains owned through the work turn.'
})
const taskFooterActive = computed(() => currentStep.value === 1)

// WorkspacePanel
const workspaceRouted = computed(() => currentStep.value >= 3 && currentStep.value < 5)
const workspaceRetained = computed(() => currentStep.value >= 5)
const workspaceTone = computed<Tone>(() => (workspaceRouted.value ? 'emerald' : 'zinc'))
const workspaceLabel = computed(() =>
  workspaceRouted.value ? 'active cwd' : workspaceRetained.value ? 'binding retained' : 'reserved',
)
const workspaceCard2Sub = computed(() => {
  if (workspaceRouted.value) return 'bash / read / write cwd'
  if (workspaceRetained.value) return 'task binding remains after IDLE'
  return 'task.worktree binding'
})
const workspaceFooter = computed(() => {
  if (workspaceRouted.value) return 'Tools follow the claimed task.'
  if (workspaceRetained.value) return 'IDLE released active tool routing.'
  return 'No implicit directory switching.'
})

// Runtime events
interface EventItem {
  event: string
  visible: boolean
  isCurrent: boolean
}
const events = computed<EventItem[]>(() =>
  EVENTS.map((event, index) => ({
    event,
    visible: index <= currentStep.value,
    isCurrent: index === currentStep.value,
  })),
)
</script>

<template>
  <section class="cc-viz cc-viz--team">
    <div class="cc-viz__panel">
      <div class="cc-team__grid">
        <div class="cc-team__panel">
          <div class="cc-team__panel-head">
            <div class="cc-team__panel-title">
              <PhUsers :size="16" class="cc-team__icon cc-team__icon--blue" />
              <span>Team runtime</span>
            </div>
            <span class="cc-team__badge" :class="`cc-team__badge--${runtimeTone}`">{{ runtimeState }}</span>
          </div>
          <div class="cc-team__rows">
            <span class="cc-team__row-label">Lead</span>
            <span class="cc-team__row-value">{{ runtimeLead }}</span>
            <span class="cc-team__row-label">Teammate</span>
            <span class="cc-team__row-value">backend</span>
            <span class="cc-team__row-label">Protocol</span>
            <span class="cc-team__row-value cc-team__row-value--mono">{{ runtimeProtocol }}</span>
          </div>
          <div class="cc-team__note cc-team__note--blue">
            <PhMailbox :size="15" class="cc-team__note-icon" />
            <span>{{ runtimeMessage }}</span>
          </div>
        </div>

        <div class="cc-team__panel">
          <div class="cc-team__panel-head">
            <div class="cc-team__panel-title">
              <PhClipboardText :size="16" class="cc-team__icon cc-team__icon--amber" />
              <span>Task board</span>
            </div>
            <span class="cc-team__badge" :class="`cc-team__badge--${taskTone}`">{{ taskStatus }}</span>
          </div>
          <div class="cc-team__task-card">
            <div class="cc-team__task-id">task_1a2b3c4d</div>
            <div class="cc-team__task-name">Refactor authentication</div>
            <div class="cc-team__task-rows">
              <span class="cc-team__task-label">owner</span>
              <span class="cc-team__task-value">{{ taskOwner }}</span>
              <span class="cc-team__task-label">blockedBy</span>
              <span class="cc-team__task-value">[]</span>
            </div>
          </div>
          <div
            class="cc-team__task-foot"
            :class="{ 'cc-team__task-foot--active': taskFooterActive }"
          >
            <PhMagnifyingGlass v-if="currentStep < 1" :size="15" class="cc-team__task-foot-icon" />
            <PhLockKey v-else :size="15" class="cc-team__task-foot-icon" />
            <span>{{ taskMessage }}</span>
          </div>
        </div>

        <div class="cc-team__panel">
          <div class="cc-team__panel-head">
            <div class="cc-team__panel-title">
              <PhGitBranch :size="16" class="cc-team__icon cc-team__icon--emerald" />
              <span>Task directory</span>
            </div>
            <span class="cc-team__badge" :class="`cc-team__badge--${workspaceTone}`">{{ workspaceLabel }}</span>
          </div>
          <div class="cc-team__dir">
            <div
              class="cc-team__dir-card"
              :class="{
                'cc-team__dir-card--coordination': !workspaceRouted,
                'cc-team__dir-card--zinc': workspaceRouted,
              }"
            >
              <div class="cc-team__dir-title">repository root</div>
              <div class="cc-team__dir-sub">coordination state</div>
            </div>
            <div
              class="cc-team__dir-card cc-team__dir-card--worktree"
              :class="{
                'cc-team__dir-card--worktree-active': workspaceRouted,
                'cc-team__worktree--bob': workspaceRouted,
              }"
            >
              <div class="cc-team__dir-title">.worktrees/auth-refactor</div>
              <div class="cc-team__dir-sub">{{ workspaceCard2Sub }}</div>
            </div>
          </div>
          <div class="cc-team__dir-foot">
            <PhTerminal v-if="workspaceRouted" :size="15" />
            <PhGitBranch v-else :size="15" />
            <span>{{ workspaceFooter }}</span>
          </div>
        </div>
      </div>

      <div class="cc-team__events">
        <div class="cc-team__events-head">
          <PhCheckCircle :size="14" />
          <span>Runtime events</span>
        </div>
        <div class="cc-team__events-grid">
          <div
            v-for="ev in events"
            :key="ev.event"
            class="cc-team__event"
            :class="[
              ev.isCurrent ? 'cc-team__event--current' : '',
              { 'cc-team__event--hidden': !ev.visible },
            ]"
            :aria-hidden="!ev.visible"
          >{{ ev.event }}</div>
        </div>
      </div>

      <StepControls
        :current-step="currentStep"
        :total-steps="STEPS.length"
        :is-playing="isPlaying"
        :step-title="stepInfo.title"
        :step-description="stepInfo.desc"
        @prev="prev"
        @next="next"
        @reset="reset"
        @toggle="toggleAutoPlay"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.cc-viz--team {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

.cc-viz__panel {
  padding: 16px;
  border-radius: 8px;
  background: #fafafa;
  border-color: #e4e4e7;
}

[data-theme='dark'] .cc-viz__panel {
  background: #09090b;
  border-color: #3f3f46;
}

.cc-team__grid {
  display: grid;
  gap: 12px;
}

@media (min-width: 1024px) {
  .cc-team__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.cc-team__panel {
  display: flex;
  flex-direction: column;
  min-height: 250px;
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
}

[data-theme='dark'] .cc-team__panel {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-team__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cc-team__panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-team__panel-title {
  color: #f4f4f5;
}

.cc-team__panel-title span {
  overflow-wrap: break-word;
}

.cc-team__icon {
  flex-shrink: 0;
}

.cc-team__icon--blue {
  color: var(--cc-blue-text);
}

.cc-team__icon--amber {
  color: var(--cc-amber-text);
}

.cc-team__icon--emerald {
  color: var(--cc-emerald-text);
}

.cc-team__badge {
  flex-shrink: 0;
  white-space: nowrap;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
}

.cc-team__badge--zinc {
  background: #f4f4f5;
  color: #52525b;
}

[data-theme='dark'] .cc-team__badge--zinc {
  background: #27272a;
  color: #d4d4d8;
}

.cc-team__badge--blue {
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-team__badge--amber {
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-team__badge--emerald {
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

.cc-team__rows {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px 8px;
  margin-top: 16px;
  font-size: 12px;
}

.cc-team__row-label {
  color: #71717a;
}

[data-theme='dark'] .cc-team__row-label {
  color: #a1a1aa;
}

.cc-team__row-value {
  font-weight: 500;
  color: #27272a;
  overflow-wrap: break-word;
}

[data-theme='dark'] .cc-team__row-value {
  color: #e4e4e7;
}

.cc-team__row-value--mono {
  font-family: var(--font-mono);
  color: #3f3f46;
  overflow-wrap: break-all;
}

[data-theme='dark'] .cc-team__row-value--mono {
  color: #d4d4d8;
}

.cc-team__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 72px;
  margin-top: 16px;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.625;
}

.cc-team__note--blue {
  border: 1px solid var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-team__note-icon {
  margin-top: 2px;
  flex-shrink: 0;
}

.cc-team__note span {
  overflow-wrap: break-word;
}

.cc-team__task-card {
  margin-top: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 12px;
}

[data-theme='dark'] .cc-team__task-card {
  border-color: #3f3f46;
}

.cc-team__task-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #71717a;
}

[data-theme='dark'] .cc-team__task-id {
  color: #a1a1aa;
}

.cc-team__task-name {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-team__task-name {
  color: #f4f4f5;
}

.cc-team__task-rows {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
}

.cc-team__task-label {
  color: #71717a;
}

[data-theme='dark'] .cc-team__task-label {
  color: #a1a1aa;
}

.cc-team__task-value {
  font-family: var(--font-mono);
  color: #3f3f46;
}

[data-theme='dark'] .cc-team__task-value {
  color: #d4d4d8;
}

.cc-team__task-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  min-height: 56px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #e4e4e7;
  background: #fafafa;
  color: #52525b;
  font-size: 12px;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}

[data-theme='dark'] .cc-team__task-foot {
  border-color: #3f3f46;
  background: #27272a;
  color: #d4d4d8;
}

.cc-team__task-foot--active {
  border-color: var(--cc-amber-border);
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-team__task-foot-icon {
  flex-shrink: 0;
}

.cc-team__task-foot span {
  overflow-wrap: break-word;
}

.cc-team__dir {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.cc-team__dir-card {
  padding: 12px;
  border-radius: 6px;
  transition: border-color 0.3s, background 0.3s;
}

.cc-team__dir-card--coordination {
  border: 1px solid var(--cc-blue-border);
  background: var(--cc-blue-bg);
}

.cc-team__dir-card--zinc {
  border: 1px solid #e4e4e7;
  background: #fafafa;
}

[data-theme='dark'] .cc-team__dir-card--zinc {
  border-color: #3f3f46;
  background: #27272a;
}

.cc-team__dir-card--worktree {
  border: 1px dashed #d4d4d8;
  background: #ffffff;
}

[data-theme='dark'] .cc-team__dir-card--worktree {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-team__dir-card--worktree-active {
  border: 1px solid var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
}

.cc-team__dir-title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: #27272a;
  overflow-wrap: break-all;
}

[data-theme='dark'] .cc-team__dir-title {
  color: #e4e4e7;
}

.cc-team__dir-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #71717a;
}

[data-theme='dark'] .cc-team__dir-sub {
  color: #a1a1aa;
}

.cc-team__dir-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: #52525b;
}

[data-theme='dark'] .cc-team__dir-foot {
  color: #d4d4d8;
}

.cc-team__dir-foot svg {
  flex-shrink: 0;
}

.cc-team__dir-foot span {
  overflow-wrap: break-word;
}

.cc-team__worktree--bob {
  animation: cc-team-bob 0.8s ease-in-out infinite;
}

@keyframes cc-team-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

.cc-team__events {
  margin-top: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
}

[data-theme='dark'] .cc-team__events {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-team__events-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #71717a;
}

[data-theme='dark'] .cc-team__events-head {
  color: #a1a1aa;
}

.cc-team__events-grid {
  display: grid;
  gap: 8px;
}

@media (min-width: 768px) {
  .cc-team__events-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .cc-team__events-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.cc-team__event {
  padding: 6px 8px;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  background: #fafafa;
  color: #52525b;
  font-family: var(--font-mono);
  font-size: 10px;
  overflow-wrap: break-all;
  transition: opacity 0.3s, border-color 0.3s, background 0.3s, color 0.3s;
}

[data-theme='dark'] .cc-team__event {
  border-color: #3f3f46;
  background: #27272a;
  color: #d4d4d8;
}

.cc-team__event--current {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-team__event--hidden {
  opacity: 0.18;
}
</style>
