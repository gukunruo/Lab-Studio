<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhCheckCircle,
  PhClipboardText,
  PhFileJs,
  PhLockKey,
  PhPlayCircle,
} from '@phosphor-icons/vue'

// s10 — Task Board Dependencies。任务卡上的 blocker 徽章可视化任务依赖，而非箭头拓扑图。

type Status = 'blocked' | 'ready' | 'active' | 'done'

interface TaskCard {
  id: string
  title: string
  blockers: string[]
  status: Status
}

interface Lane {
  key: string
  title: string
  subtitle: string
  tone: Status
  list: () => TaskCard[]
}

const STEPS = [
  { title: 'Tasks Become Files', desc: 'The agent writes work as task cards on disk, so the plan survives compaction and restarts.' },
  { title: 'Find the First Ready Card', desc: 'A task with no blockers is ready immediately. Everything else waits visibly.' },
  { title: 'Work One Card', desc: "The active task is not just text in the model's head; it has a durable status." },
  { title: 'Completion Unlocks Dependents', desc: 'When T1 is done, the cards that depended on T1 become ready.' },
  { title: 'Parallel Ready Work', desc: 'T2 and T3 can run independently, while T4 still waits for both.' },
  { title: 'All Blockers Cleared', desc: 'Once T2 and T3 are done, T4 moves from waiting to active.' },
  { title: 'Board Resolved', desc: 'Every card reaches done. The dependency idea is visible without drawing a graph.' },
] as const

const BASE_TASKS: Omit<TaskCard, 'status'>[] = [
  { id: 'T1', title: 'Set up database', blockers: [] },
  { id: 'T2', title: 'Add API routes', blockers: ['T1'] },
  { id: 'T3', title: 'Build auth module', blockers: ['T1'] },
  { id: 'T4', title: 'Integration pass', blockers: ['T2', 'T3'] },
  { id: 'T5', title: 'Deploy', blockers: ['T4'] },
]

function taskStatus(id: string, step: number): Status {
  const table: Record<string, Status[]> = {
    T1: ['ready', 'ready', 'active', 'done', 'done', 'done', 'done'],
    T2: ['blocked', 'blocked', 'blocked', 'ready', 'active', 'done', 'done'],
    T3: ['blocked', 'blocked', 'blocked', 'ready', 'active', 'done', 'done'],
    T4: ['blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'active', 'done'],
    T5: ['blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked', 'done'],
  }
  return table[id]?.[step] ?? 'blocked'
}

function getTasks(step: number): TaskCard[] {
  return BASE_TASKS.map((task) => ({ ...task, status: taskStatus(task.id, step) }))
}

function statusIcon(status: Status): Component {
  if (status === 'done') return PhCheckCircle
  if (status === 'active') return PhPlayCircle
  if (status === 'ready') return PhClipboardText
  return PhLockKey
}

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2500,
})

const tasks = computed(() => getTasks(currentStep.value))
const blocked = computed(() => tasks.value.filter((task) => task.status === 'blocked'))
const ready = computed(() => tasks.value.filter((task) => task.status === 'ready'))
const active = computed(() => tasks.value.filter((task) => task.status === 'active'))
const done = computed(() => tasks.value.filter((task) => task.status === 'done'))
const stepInfo = computed(() => STEPS[currentStep.value]!)

const LANES: Lane[] = [
  { key: 'waiting', title: 'Waiting', subtitle: 'blocked by another card', tone: 'blocked', list: () => blocked.value },
  { key: 'ready', title: 'Ready', subtitle: 'can be claimed now', tone: 'ready', list: () => ready.value },
  { key: 'working', title: 'Working', subtitle: 'currently in progress', tone: 'active', list: () => active.value },
  { key: 'done', title: 'Done', subtitle: 'unlocks dependents', tone: 'done', list: () => done.value },
]
</script>

<template>
  <section class="cc-viz cc-viz--tasks">
    <div class="cc-viz__panel">
      <div class="cc-tasks__boardhead">
        <div class="cc-tasks__boardlabel">
          <PhFileJs :size="16" />
          <span>.tasks board</span>
        </div>
        <div class="cc-tasks__counts">
          <div class="cc-tasks__count cc-tasks__count--blocked">{{ blocked.length }} blocked</div>
          <div class="cc-tasks__count cc-tasks__count--ready">{{ ready.length }} ready</div>
          <div class="cc-tasks__count cc-tasks__count--active">{{ active.length }} active</div>
          <div class="cc-tasks__count cc-tasks__count--done">{{ done.length }} done</div>
        </div>
      </div>

      <div class="cc-tasks__lanes">
        <div v-for="lane in LANES" :key="lane.key" class="cc-tasks__lane">
          <div class="cc-tasks__lane-head">
            <div class="cc-tasks__lane-title">{{ lane.title }}</div>
            <div class="cc-tasks__lane-sub">{{ lane.subtitle }}</div>
          </div>
          <div class="cc-tasks__cards">
            <div
              v-for="task in lane.list()"
              :key="`${task.id}-${task.status}`"
              class="cc-tasks__card"
              :class="`cc-tasks__card--${lane.tone}`"
            >
              <div class="cc-tasks__card-head">
                <div class="cc-tasks__card-id">{{ task.id }}</div>
                <div class="cc-tasks__card-status">
                  <component :is="statusIcon(task.status)" :size="15" />
                  {{ task.status }}
                </div>
              </div>
              <div class="cc-tasks__card-title">{{ task.title }}</div>
              <div class="cc-tasks__card-blockers">
                <span v-if="task.blockers.length === 0" class="cc-tasks__chip">no blockers</span>
                <span v-for="blocker in task.blockers" :key="blocker" class="cc-tasks__chip">waits for {{ blocker }}</span>
              </div>
            </div>
            <div v-if="lane.list().length === 0" class="cc-tasks__empty">empty</div>
          </div>
        </div>
      </div>

      <div class="cc-tasks__note">
        A dependency is not an arrow students must trace. It is a visible blocker badge on the card.
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
  </section>
</template>

<style scoped lang="scss">
.cc-viz--tasks {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

.cc-viz__panel {
  padding: 16px;
}

.cc-tasks__boardhead {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

@media (min-width: 640px) {
  .cc-tasks__boardhead {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.cc-tasks__boardlabel {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-tasks__counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  text-align: center;
  font-size: 12px;
}

.cc-tasks__count {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.cc-tasks__count--blocked {
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.cc-tasks__count--ready {
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-tasks__count--active {
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-tasks__count--done {
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

.cc-tasks__lanes {
  display: grid;
  gap: 12px;
}

@media (min-width: 1024px) {
  .cc-tasks__lanes {
    grid-template-columns: repeat(4, 1fr);
  }
}

.cc-tasks__lane {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.cc-tasks__lane-head {
  margin-bottom: 12px;
}

.cc-tasks__lane-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-tasks__lane-sub {
  font-size: 11px;
  color: var(--color-text-muted);
}

.cc-tasks__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-tasks__card {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  animation: cc-tasks-card-in 0.22s ease both;
}

@keyframes cc-tasks-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.cc-tasks__card--blocked {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.cc-tasks__card--ready {
  border-color: var(--cc-amber-border);
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-tasks__card--active {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-tasks__card--done {
  border-color: var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

.cc-tasks__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.cc-tasks__card-id {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}

.cc-tasks__card-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
}

.cc-tasks__card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.375;
  color: inherit;
}

.cc-tasks__card-blockers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.cc-tasks__chip {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.7);
  font-size: 10px;
}

[data-theme='dark'] .cc-tasks__chip {
  background: rgba(9, 9, 11, 0.3);
}

.cc-tasks__empty {
  padding: 24px 0;
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-sm);
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  animation: cc-tasks-empty-in 0.2s ease both;
}

@keyframes cc-tasks-empty-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.cc-tasks__note {
  margin-top: 16px;
  padding: 8px 12px;
  border: 1px solid var(--cc-blue-border);
  border-radius: var(--radius-sm);
  background: var(--cc-blue-bg);
  font-size: 12px;
  line-height: 1.625;
  color: var(--cc-blue-text);
}
</style>
