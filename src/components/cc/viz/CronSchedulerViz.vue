<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhCalendarDots,
  PhDatabase,
  PhClock,
  PhTray,
  PhCheckCircle,
  PhRobot,
} from '@phosphor-icons/vue'

// s12 — Cron Scheduler。weekly clock + schedule book + due queue + agent inbox 逐步可视化。

type ActiveKey = 'composer' | 'ledger' | 'clock' | 'queue' | 'inbox' | 'done'

interface Step {
  title: string
  desc: string
  active: ActiveKey
}

const STEPS: Step[] = [
  { title: 'Make It Repeatable', desc: 'The user turns one normal prompt into a reusable schedule card.', active: 'composer' },
  { title: 'Store the Card', desc: 'The schedule lives in durable data, so it is not tied to the current chat turn.', active: 'ledger' },
  { title: 'Time Keeps Moving', desc: 'A tiny scheduler watches the clock while the agent can do other work.', active: 'clock' },
  { title: 'Copy Goes to the Queue', desc: 'When the cron expression matches, the scheduler puts a due copy in the queue.', active: 'queue' },
  { title: 'Run as a Normal Turn', desc: 'The queue processor hands the due prompt to the same agent loop beginners already know.', active: 'inbox' },
  { title: 'Keep the Original', desc: 'The result is recorded, and the schedule card remains ready for the next matching time.', active: 'done' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2500,
})

const current = computed(() => STEPS[currentStep.value] ?? STEPS[0]!)

function isActive(...keys: ActiveKey[]): boolean {
  return keys.includes(current.value.active)
}

function scheduleTone(tone: 'blue' | 'amber' | 'emerald'): string {
  return `cc-viz__schedule--${tone}`
}
</script>

<template>
  <section class="cc-viz cc-viz--cron">
    <div class="cc-viz__panel">
      <div class="cc-viz__clock">
        <div class="cc-viz__clock-head">
          <div class="cc-viz__clock-title">
            <PhCalendarDots :size="16" />
            <span>Weekly clock</span>
          </div>
          <div
            class="cc-viz__clock-time"
            :class="{ 'cc-viz__clock-time--pulse': currentStep >= 2 && currentStep <= 4 }"
          >
            {{ currentStep < 2 ? '08:59' : '09:00' }}
          </div>
        </div>
        <div class="cc-viz__clock-grid">
          <div
            v-for="(day, index) in DAYS"
            :key="day"
            class="cc-viz__day"
            :class="{ 'cc-viz__day--active': currentStep >= 2 && index === 2 }"
          >
            {{ day }}
          </div>
        </div>
      </div>

      <div class="cc-viz__grid">
        <div class="cc-viz__pane" :class="{ 'cc-viz__pane--active': isActive('ledger', 'done') }">
          <div class="cc-viz__pane-head">
            <span class="cc-viz__pane-icon"><PhDatabase :size="15" /></span>
            <span class="cc-viz__pane-title">Schedule book</span>
          </div>
          <div class="cc-viz__pane-body">
            <div v-if="currentStep === 0" class="cc-viz__schedule" :class="scheduleTone('blue')">
              <div class="cc-viz__schedule-title">Draft prompt</div>
              <div class="cc-viz__schedule-sub">review open PR every weekday</div>
            </div>
            <div
              v-if="currentStep >= 1"
              class="cc-viz__schedule"
              :class="currentStep === 5 ? scheduleTone('emerald') : scheduleTone('blue')"
            >
              <div class="cc-viz__schedule-title">0 9 * * 1-5</div>
              <div class="cc-viz__schedule-sub">review open PR every weekday</div>
            </div>
            <div class="cc-viz__placeholder">
              {{ currentStep >= 1 ? 'stored schedules stay here' : 'no saved schedule yet' }}
            </div>
          </div>
        </div>

        <div class="cc-viz__pane" :class="{ 'cc-viz__pane--active': isActive('clock', 'queue') }">
          <div class="cc-viz__pane-head">
            <span class="cc-viz__pane-icon"><PhClock :size="15" /></span>
            <span class="cc-viz__pane-title">Due queue</span>
          </div>
          <div class="cc-viz__pane-body">
            <div class="cc-viz__watcher">watcher: {{ currentStep >= 2 ? 'running' : 'waiting' }}</div>
            <div
              v-if="currentStep >= 3 && currentStep <= 4"
              class="cc-viz__schedule"
              :class="scheduleTone('amber')"
            >
              <div class="cc-viz__schedule-title">due copy</div>
              <div class="cc-viz__schedule-sub">same prompt, current timestamp</div>
            </div>
            <div v-if="currentStep < 3" class="cc-viz__placeholder cc-viz__placeholder--tall">queue is empty</div>
            <div v-if="currentStep === 5" class="cc-viz__schedule" :class="scheduleTone('emerald')">
              <div class="cc-viz__schedule-title">queue drained</div>
              <div class="cc-viz__schedule-sub">ready for next tick</div>
            </div>
          </div>
        </div>

        <div class="cc-viz__pane" :class="{ 'cc-viz__pane--active': isActive('inbox', 'done') }">
          <div class="cc-viz__pane-head">
            <span class="cc-viz__pane-icon"><PhTray :size="15" /></span>
            <span class="cc-viz__pane-title">Agent inbox</span>
          </div>
          <div class="cc-viz__pane-body">
            <div
              v-if="currentStep >= 4"
              class="cc-viz__schedule"
              :class="currentStep >= 5 ? scheduleTone('emerald') : scheduleTone('blue')"
            >
              <div class="cc-viz__schedule-title">agent turn</div>
              <div class="cc-viz__schedule-sub">{{ currentStep >= 5 ? 'result appended' : 'runs like a normal prompt' }}</div>
            </div>
            <div class="cc-viz__inbox-status">
              <PhCheckCircle v-if="currentStep >= 5" :size="14" />
              <PhRobot v-else :size="14" />
              <span>{{ currentStep >= 5 ? 'review summary saved' : 'agent loop available' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cc-viz__controls">
      <StepControls
        :current-step="currentStep"
        :total-steps="6"
        :is-playing="isPlaying"
        :step-title="current.title"
        :step-description="current.desc"
        @prev="prev"
        @next="next"
        @reset="reset"
        @toggle="toggleAutoPlay"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.cc-viz--cron {
  min-height: 500px;
}

.cc-viz__panel {
  padding: 16px;
}

.cc-viz__clock {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
}

[data-theme='dark'] .cc-viz__clock {
  background: rgba(39, 39, 42, 0.7);
}

.cc-viz__clock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cc-viz__clock-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__clock-time {
  border-radius: 6px;
  padding: 4px 8px;
  background: var(--color-bg);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.cc-viz__clock-time--pulse {
  animation: cc-cron-pulse 1.1s ease infinite;
}

@keyframes cc-cron-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

.cc-viz__clock-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.cc-viz__day {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: var(--color-bg);
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}

.cc-viz__day--active {
  border-color: var(--cc-amber-border);
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-viz__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

@media (min-width: 1024px) {
  .cc-viz__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.cc-viz__pane {
  min-height: 230px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 12px;
  transition: border-color 0.3s, background 0.3s;
}

.cc-viz__pane--active {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
}

.cc-viz__pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.cc-viz__pane-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
  background: #f4f4f5;
  color: #71717a;
  transition: background 0.3s, color 0.3s;
}

[data-theme='dark'] .cc-viz__pane-icon {
  background: #27272a;
  color: #d4d4d8;
}

.cc-viz__pane--active .cc-viz__pane-icon {
  background: var(--cc-blue-fill);
  color: #fff;
}

.cc-viz__pane-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__pane-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-viz__schedule {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  animation: cc-cron-card-in 0.25s ease both;
}

@keyframes cc-cron-card-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.cc-viz__schedule-title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}

.cc-viz__schedule-sub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.8;
}

.cc-viz__schedule--blue {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-viz__schedule--amber {
  border-color: var(--cc-amber-border);
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-viz__schedule--emerald {
  border-color: var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

.cc-viz__watcher {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-viz__placeholder {
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 16px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-viz__placeholder--tall {
  padding: 32px 12px;
}

.cc-viz__inbox-status {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-2);
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-viz__controls {
  margin-top: 16px;
}
</style>
