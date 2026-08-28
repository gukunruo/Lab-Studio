<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s03 — TodoWrite Nag System。Kanban 面板 + Nag gauge：可见计划 + nag 压力。

type TaskStatus = 'pending' | 'in_progress' | 'done'

interface Task {
  id: number
  label: string
  status: TaskStatus
}

const TASK_STATES: Task[][] = [
  [
    { id: 1, label: 'Write auth tests', status: 'pending' },
    { id: 2, label: 'Fix mobile layout', status: 'pending' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'pending' },
    { id: 2, label: 'Fix mobile layout', status: 'pending' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'pending' },
    { id: 2, label: 'Fix mobile layout', status: 'pending' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'in_progress' },
    { id: 2, label: 'Fix mobile layout', status: 'pending' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'done' },
    { id: 2, label: 'Fix mobile layout', status: 'pending' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'done' },
    { id: 2, label: 'Fix mobile layout', status: 'in_progress' },
    { id: 3, label: 'Add error handling', status: 'pending' },
    { id: 4, label: 'Update config loader', status: 'pending' },
  ],
  [
    { id: 1, label: 'Write auth tests', status: 'done' },
    { id: 2, label: 'Fix mobile layout', status: 'done' },
    { id: 3, label: 'Add error handling', status: 'done' },
    { id: 4, label: 'Update config loader', status: 'in_progress' },
  ],
]

const NAG_TIMER_PER_STEP: number[] = [0, 1, 2, 3, 0, 0, 0]
const NAG_THRESHOLD = 3
const NAG_FIRES_PER_STEP: boolean[] = [false, false, false, true, false, false, false]

const STEP_INFO = [
  { title: 'The Plan', desc: 'TodoWrite gives the model a visible plan. All tasks start as pending.' },
  { title: 'Round 1 -- Idle', desc: "The model does work but doesn't touch its todos. The nag counter increments." },
  { title: 'Round 2 -- Still Idle', desc: 'Two rounds without progress. Pressure builds.' },
  { title: 'NAG!', desc: "Threshold reached! System message injected: 'You have pending tasks. Pick one up now!'" },
  { title: 'Task Complete', desc: 'The model completes the task. Timer stays at 0 -- working on todos resets the counter.' },
  { title: 'Self-Directed', desc: 'Once the model learns the pattern, it picks up tasks voluntarily.' },
  { title: 'Mission Accomplished', desc: 'Visible plan + nag pressure = reliable task completion.' },
]

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 7,
  autoPlayInterval: 2500,
})

const tasks = computed(() => TASK_STATES[currentStep.value] ?? [])
const pendingTasks = computed(() => tasks.value.filter((t) => t.status === 'pending'))
const inProgressTasks = computed(() => tasks.value.filter((t) => t.status === 'in_progress'))
const doneTasks = computed(() => tasks.value.filter((t) => t.status === 'done'))
const nagValue = computed(() => NAG_TIMER_PER_STEP[currentStep.value] ?? 0)
const nagFires = computed(() => NAG_FIRES_PER_STEP[currentStep.value] ?? false)
const nagPct = computed(() => Math.min((nagValue.value / NAG_THRESHOLD) * 100, 100))
const stepInfo = computed(() => STEP_INFO[currentStep.value]!)

function nagColor(value: number): string {
  if (value === 0) return 'var(--cc-node-stroke)'
  if (value === 1) return '#22c55e'
  if (value === 2) return '#eab308'
  return '#ef4444'
}

function statusLabel(status: TaskStatus): string {
  return status.replace('_', ' ')
}
</script>

<template>
  <section class="cc-viz cc-viz--todo">
    <div class="cc-viz__panel">
      <div class="cc-viz__todo-title">TodoWrite Nag System</div>

      <!-- Nag gauge + nag message -->
      <div class="cc-viz__nag">
        <div class="cc-viz__nag-head">
          <span class="cc-viz__nag-label">Nag Timer</span>
          <span class="cc-viz__nag-value">{{ nagValue }}/{{ NAG_THRESHOLD }}</span>
        </div>
        <div class="cc-viz__nag-track">
          <div
            class="cc-viz__nag-fill"
            :style="{ width: nagPct + '%', backgroundColor: nagColor(nagValue) }"
          />
          <div v-if="nagFires" class="cc-viz__nag-pulse" />
        </div>
      </div>

      <div v-if="nagFires" class="cc-viz__nag-msg">
        SYSTEM: "You have pending tasks. Pick one up now!"
      </div>

      <!-- Kanban board -->
      <div class="cc-viz__board">
        <div class="cc-viz__col cc-viz__col--pending">
          <div class="cc-viz__col-head">
            <span class="cc-viz__col-title">Pending</span>
            <span class="cc-viz__col-count">{{ pendingTasks.length }}</span>
          </div>
          <div class="cc-viz__col-body">
            <p v-if="pendingTasks.length === 0" class="cc-viz__empty">--</p>
            <div
              v-for="task in pendingTasks"
              :key="task.id"
              class="cc-viz__card"
              :class="'cc-viz__card--' + task.status.replace('_', '-')"
            >
              <div class="cc-viz__card-top">
                <span class="cc-viz__card-id">#{{ task.id }}</span>
                <span class="cc-viz__card-badge">{{ statusLabel(task.status) }}</span>
              </div>
              <div class="cc-viz__card-label">{{ task.label }}</div>
            </div>
          </div>
        </div>

        <div class="cc-viz__col cc-viz__col--progress">
          <div class="cc-viz__col-head">
            <span class="cc-viz__col-title">In Progress</span>
            <span class="cc-viz__col-count">{{ inProgressTasks.length }}</span>
          </div>
          <div class="cc-viz__col-body">
            <p v-if="inProgressTasks.length === 0" class="cc-viz__empty">--</p>
            <div
              v-for="task in inProgressTasks"
              :key="task.id"
              class="cc-viz__card"
              :class="'cc-viz__card--' + task.status.replace('_', '-')"
            >
              <div class="cc-viz__card-top">
                <span class="cc-viz__card-id">#{{ task.id }}</span>
                <span class="cc-viz__card-badge">{{ statusLabel(task.status) }}</span>
              </div>
              <div class="cc-viz__card-label">{{ task.label }}</div>
            </div>
          </div>
        </div>

        <div class="cc-viz__col cc-viz__col--done">
          <div class="cc-viz__col-head">
            <span class="cc-viz__col-title">Done</span>
            <span class="cc-viz__col-count">{{ doneTasks.length }}</span>
          </div>
          <div class="cc-viz__col-body">
            <p v-if="doneTasks.length === 0" class="cc-viz__empty">--</p>
            <div
              v-for="task in doneTasks"
              :key="task.id"
              class="cc-viz__card"
              :class="'cc-viz__card--' + task.status.replace('_', '-')"
            >
              <div class="cc-viz__card-top">
                <span class="cc-viz__card-id">#{{ task.id }}</span>
                <span class="cc-viz__card-badge">{{ statusLabel(task.status) }}</span>
              </div>
              <div class="cc-viz__card-label">{{ task.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Progress summary -->
      <div class="cc-viz__progress">
        <span class="cc-viz__progress-text">Progress: {{ doneTasks.length }}/{{ tasks.length }} complete</span>
        <div class="cc-viz__progress-pips">
          <span
            v-for="task in tasks"
            :key="task.id"
            class="cc-viz__progress-pip"
            :class="'cc-viz__progress-pip--' + task.status.replace('_', '-')"
          />
        </div>
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="7"
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
.cc-viz__panel {
  padding: 16px;
}

.cc-viz__todo-title {
  margin-bottom: 12px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}

// Nag gauge
.cc-viz__nag {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.cc-viz__nag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cc-viz__nag-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cc-node-text);
}

.cc-viz__nag-value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--cc-label);
}

.cc-viz__nag-track {
  position: relative;
  height: 16px;
  width: 100%;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--cc-node-fill);
}

.cc-viz__nag-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  border-radius: 9999px;
  transition: width 0.5s ease, background-color 0.5s ease;
}

.cc-viz__nag-pulse {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 9999px;
  border: 2px solid #ef4444;
  animation: cc-nag-flash 1s ease-in-out infinite;
}

@keyframes cc-nag-flash {
  0%, 100% { opacity: 0; }
  25% { opacity: 1; }
  50% { opacity: 0; }
  75% { opacity: 1; }
}

.cc-viz__nag-msg {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-sm);
  background: #fef2f2;
  color: #b91c1c;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  animation: cc-nag-msg 0.4s ease;
}

[data-theme='dark'] .cc-viz__nag-msg {
  border-color: #b91c1c;
  background: rgba(69, 10, 10, 0.3);
  color: #fca5a5;
}

@keyframes cc-nag-msg {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

// Kanban board
.cc-viz__board {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.cc-viz__col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  border: 1px solid var(--cc-node-stroke);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
}

.cc-viz__col-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cc-viz__col-title {
  min-width: 0;
  overflow-wrap: break-word;
}

.cc-viz__col-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
}

.cc-viz__col--pending .cc-viz__col-head {
  background: var(--cc-node-fill);
  color: var(--cc-node-text);
}

.cc-viz__col--pending .cc-viz__col-count {
  background: var(--cc-node-fill);
  color: var(--cc-node-text);
}

.cc-viz__col--progress .cc-viz__col-head {
  background: #fef3c7;
  color: #92400e;
}

.cc-viz__col--progress .cc-viz__col-count {
  background: #fde68a;
  color: #b45309;
}

[data-theme='dark'] .cc-viz__col--progress .cc-viz__col-head {
  background: rgba(120, 53, 15, 0.4);
  color: #fcd34d;
}

[data-theme='dark'] .cc-viz__col--progress .cc-viz__col-count {
  background: #92400e;
  color: #fde68a;
}

.cc-viz__col--done .cc-viz__col-head {
  background: #d1fae5;
  color: #065f46;
}

.cc-viz__col--done .cc-viz__col-count {
  background: #a7f3d0;
  color: #047857;
}

[data-theme='dark'] .cc-viz__col--done .cc-viz__col-head {
  background: rgba(6, 78, 59, 0.4);
  color: #6ee7b7;
}

[data-theme='dark'] .cc-viz__col--done .cc-viz__col-count {
  background: #065f46;
  color: #a7f3d0;
}

.cc-viz__col-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
}

.cc-viz__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--cc-label);
}

// Task cards
.cc-viz__card {
  min-width: 0;
  padding: 10px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  transition: border-color 0.3s, background 0.3s;
  animation: cc-card-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes cc-card-in {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

.cc-viz__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.cc-viz__card-id {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--cc-label);
}

.cc-viz__card-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 9999px;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cc-viz__card-label {
  overflow-wrap: break-word;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--cc-node-text);
}

.cc-viz__card--pending {
  border-color: #e4e4e7;
  background: #ffffff;
}

[data-theme='dark'] .cc-viz__card--pending {
  border-color: #3f3f46;
  background: #27272a;
}

.cc-viz__card--pending .cc-viz__card-badge {
  background: #f4f4f5;
  color: #52525b;
}

[data-theme='dark'] .cc-viz__card--pending .cc-viz__card-badge {
  background: #27272a;
  color: #a1a1aa;
}

.cc-viz__card--in-progress {
  border-color: #fcd34d;
  background: #fffbeb;
}

.cc-viz__card--in-progress .cc-viz__card-label {
  color: #b45309;
}

.cc-viz__card--in-progress .cc-viz__card-badge {
  background: #fef3c7;
  color: #b45309;
}

[data-theme='dark'] .cc-viz__card--in-progress {
  border-color: #b45309;
  background: rgba(69, 26, 3, 0.3);
}

[data-theme='dark'] .cc-viz__card--in-progress .cc-viz__card-label {
  color: #fcd34d;
}

[data-theme='dark'] .cc-viz__card--in-progress .cc-viz__card-badge {
  background: rgba(120, 53, 15, 0.4);
  color: #fcd34d;
}

.cc-viz__card--done {
  border-color: #6ee7b7;
  background: #ecfdf5;
}

.cc-viz__card--done .cc-viz__card-label {
  color: #047857;
}

.cc-viz__card--done .cc-viz__card-badge {
  background: #d1fae5;
  color: #047857;
}

[data-theme='dark'] .cc-viz__card--done {
  border-color: #047857;
  background: rgba(2, 44, 34, 0.3);
}

[data-theme='dark'] .cc-viz__card--done .cc-viz__card-label {
  color: #6ee7b7;
}

[data-theme='dark'] .cc-viz__card--done .cc-viz__card-badge {
  background: rgba(6, 78, 59, 0.4);
  color: #6ee7b7;
}

// Progress summary
.cc-viz__progress {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.cc-viz__progress-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--cc-label);
}

.cc-viz__progress-pips {
  display: flex;
  gap: 2px;
}

.cc-viz__progress-pip {
  height: 8px;
  width: 24px;
  border-radius: 3px;
  transition: background 0.3s;
}

.cc-viz__progress-pip--pending {
  background: var(--cc-edge);
}

.cc-viz__progress-pip--in-progress {
  background: #fbbf24;
}

.cc-viz__progress-pip--done {
  background: #10b981;
}

@media (min-width: 640px) {
  .cc-viz__board {
    grid-template-columns: repeat(3, 1fr);
  }

  .cc-viz__col {
    min-height: 280px;
  }
}
</style>
