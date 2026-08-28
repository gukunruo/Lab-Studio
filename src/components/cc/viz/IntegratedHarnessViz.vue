<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhTray,
  PhShieldCheck,
  PhGitBranch,
  PhWrench,
  PhStack,
  PhSparkle,
  PhFileText,
  PhRobot,
  PhArchive,
  PhClock,
  PhNetwork,
  PhCheckCircle,
} from '@phosphor-icons/vue'

// s15 — Integrated Harness Turn。One-turn journey 阶段 + Turn packet + transcript + 工作表面。

type StageId =
  | 'intake'
  | 'guardrails'
  | 'route'
  | 'execute'
  | 'external'
  | 'recover'
  | 'append'

interface StageDef {
  id: StageId
  label: string
  detail: string
  icon: Component
}

const STAGES: StageDef[] = [
  { id: 'intake', label: 'Intake', detail: 'request, memory, background notes', icon: PhTray },
  { id: 'guardrails', label: 'Guardrails', detail: 'permissions, hooks, policy', icon: PhShieldCheck },
  { id: 'route', label: 'Route', detail: 'choose the right work surface', icon: PhGitBranch },
  { id: 'execute', label: 'Execute', detail: 'local tools, teams, task-bound worktrees', icon: PhWrench },
  { id: 'external', label: 'External', detail: 'MCP toolboxes return results', icon: PhStack },
  { id: 'recover', label: 'Recover', detail: 'retry, compact, repair state', icon: PhSparkle },
  { id: 'append', label: 'Append', detail: 'one transcript stays authoritative', icon: PhFileText },
]

interface SurfaceDef {
  label: string
  icon: Component
  text: string
}

const SURFACES: SurfaceDef[] = [
  { label: 'background', icon: PhClock, text: 'slow commands can finish later' },
  { label: 'team', icon: PhNetwork, text: 'teammates work through mailboxes' },
  { label: 'worktree', icon: PhGitBranch, text: 'task-bound cwd selects a separate checkout' },
  { label: 'MCP', icon: PhStack, text: 'external tools are normalized' },
]

interface Packet {
  request: string
  carried: string[]
  decision: string
  result: string
}

interface StepDef {
  title: string
  desc: string
  stage: StageId
  used: StageId[]
  packet: Packet
  transcript: string[]
}

const STEPS: StepDef[] = [
  {
    title: 'A Turn Starts as a Packet',
    desc: 'The integrated harness first gathers everything the model should see, instead of scattering context across hidden places.',
    stage: 'intake',
    used: ['intake'],
    packet: {
      request: 'Fix the web lesson visuals and verify the pages.',
      carried: ['recent messages', 'relevant memory', 'background notes'],
      decision: 'build one model-visible input packet',
      result: 'ready for a model call',
    },
    transcript: ['user request enters', 'memory and notes are attached'],
  },
  {
    title: 'Guardrails Check the Packet',
    desc: 'Permissions and hooks are not separate side quests; they are the inspection gate before work happens.',
    stage: 'guardrails',
    used: ['intake', 'guardrails'],
    packet: {
      request: 'Edit files, run build, open browser.',
      carried: ['permission mode', 'hook output', 'workspace rules'],
      decision: 'allowed work continues; risky work asks first',
      result: 'safe action envelope',
    },
    transcript: ['policy checked', 'allowed actions are visible'],
  },
  {
    title: 'The Agent Picks Work Surfaces',
    desc: 'The model does not need every mechanism at once. It chooses the smallest surface that matches the job.',
    stage: 'route',
    used: ['route', 'execute', 'external'],
    packet: {
      request: 'Search code, patch UI, verify rendered pages.',
      carried: ['available tools', 'team status', 'MCP registry'],
      decision: 'local edit first, external tools only when needed',
      result: 'work split into clear lanes',
    },
    transcript: ['route: code search', 'route: browser check', 'route: no teammate needed'],
  },
  {
    title: 'Work Runs in Bounded Places',
    desc: 'Tools, teammates, and worktrees all produce small result cards, so parallel work does not become one unreadable chat log.',
    stage: 'execute',
    used: ['execute', 'route'],
    packet: {
      request: 'Apply the patch and run the build.',
      carried: ['tool call', 'worktree lane', 'expected output'],
      decision: 'execute, then return summarized results',
      result: 'local evidence collected',
    },
    transcript: ['patch applied', 'build output summarized'],
  },
  {
    title: 'External Results Re-enter the Same Lane',
    desc: 'MCP tools expand capability, but they still come back as ordinary tool results the agent can reason over.',
    stage: 'external',
    used: ['external', 'execute'],
    packet: {
      request: 'Use an external source or tool if local context is missing.',
      carried: ['MCP tool name', 'structured arguments', 'returned artifact'],
      decision: 'normalize external output before the next model step',
      result: 'outside work is no longer special',
    },
    transcript: ['MCP result received', 'result card appended'],
  },
  {
    title: 'Recovery Keeps the Turn Understandable',
    desc: 'Long context, command errors, and retries are handled as named recovery moves, not as mysterious branches.',
    stage: 'recover',
    used: ['recover', 'intake'],
    packet: {
      request: 'If context or execution gets messy, repair before continuing.',
      carried: ['error text', 'retry count', 'compact summary'],
      decision: 'retry once, compact old detail, keep the reason visible',
      result: 'the turn remains legible',
    },
    transcript: ['error classified', 'recovery note added', 'work resumes'],
  },
  {
    title: 'Everything Writes Back to One Transcript',
    desc: 'The big lesson is boring in the best way: all mechanisms eventually append evidence to the same source of truth.',
    stage: 'append',
    used: ['append', 'intake'],
    packet: {
      request: 'Report what changed and what was verified.',
      carried: ['tool evidence', 'browser checks', 'remaining risks'],
      decision: 'answer from the transcript, not from memory alone',
      result: 'next turn has a clean starting point',
    },
    transcript: ['tests pass', 'visual checks recorded', 'final answer drafted'],
  },
]

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 7,
  autoPlayInterval: 2800,
})

const step = computed(() => STEPS[currentStep.value] ?? STEPS[0]!)
const stepInfo = computed(() => ({ title: step.value.title, desc: step.value.desc }))
const currentStageIndex = computed(() => STAGES.findIndex((s) => s.id === step.value.stage))
const stepBadge = computed(() => `step ${currentStep.value + 1}/${STEPS.length}`)

function stageState(index: number): 'active' | 'done' | 'idle' {
  if (index === currentStageIndex.value) return 'active'
  if (index < currentStageIndex.value) return 'done'
  return 'idle'
}
</script>

<template>
  <section class="cc-viz cc-viz--harness">
    <div class="cc-viz__panel">
      <div class="cc-viz__grid">
        <!-- Left: One-turn journey stages -->
        <div class="cc-viz__col">
          <div class="cc-viz__col-head">
            <PhRobot :size="16" />
            <span>One-turn journey</span>
          </div>
          <div class="cc-viz__stages">
            <div
              v-for="(stage, index) in STAGES"
              :key="stage.id"
              class="cc-viz__stage"
              :class="'cc-viz__stage--' + stageState(index)"
            >
              <div
                class="cc-viz__stage-icon"
                :class="'cc-viz__stage-icon--' + stageState(index)"
              >
                <component :is="stageState(index) === 'done' ? PhCheckCircle : stage.icon" :size="15" />
              </div>
              <div class="cc-viz__stage-body">
                <div class="cc-viz__stage-title">{{ index + 1 }}. {{ stage.label }}</div>
                <div class="cc-viz__stage-detail">{{ stage.detail }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right column: turn packet + transcript -->
        <div class="cc-viz__right">
          <div class="cc-viz__packet-panel">
            <div class="cc-viz__packet-head">
              <div class="cc-viz__packet-head-left">
                <PhArchive :size="16" />
                <span>Turn packet</span>
              </div>
              <span class="cc-viz__step-badge">{{ stepBadge }}</span>
            </div>

            <Transition name="cc-harness-packet" mode="out-in">
              <div :key="step.title" class="cc-viz__packet-body">
                <div class="cc-viz__packet cc-viz__packet--blue">
                  <div class="cc-viz__packet-label">request</div>
                  <div class="cc-viz__packet-value">{{ step.packet.request }}</div>
                </div>

                <div class="cc-viz__carried-grid">
                  <div class="cc-viz__carried">
                    <div class="cc-viz__carried-label">carried context</div>
                    <div class="cc-viz__chips">
                      <span
                        v-for="item in step.packet.carried"
                        :key="item"
                        class="cc-viz__chip"
                      >{{ item }}</span>
                    </div>
                  </div>
                  <div class="cc-viz__packet">
                    <div class="cc-viz__packet-label">decision</div>
                    <div class="cc-viz__packet-value">{{ step.packet.decision }}</div>
                  </div>
                </div>

                <div class="cc-viz__packet cc-viz__packet--emerald">
                  <div class="cc-viz__packet-label">result</div>
                  <div class="cc-viz__packet-value">{{ step.packet.result }}</div>
                </div>
              </div>
            </Transition>
          </div>

          <div class="cc-viz__transcript">
            <div class="cc-viz__transcript-head">
              <PhFileText :size="15" />
              <span>Source-of-truth transcript</span>
            </div>
            <TransitionGroup name="cc-harness-transcript" tag="div" class="cc-viz__transcript-list">
              <div
                v-for="(item, i) in step.transcript"
                :key="item + '-' + i"
                class="cc-viz__transcript-item"
              >{{ item }}</div>
            </TransitionGroup>
          </div>
        </div>
      </div>

      <!-- Work surfaces -->
      <div class="cc-viz__surfaces">
        <div
          v-for="surface in SURFACES"
          :key="surface.label"
          class="cc-viz__surface"
        >
          <div class="cc-viz__surface-head">
            <span class="cc-viz__surface-icon">
              <component :is="surface.icon" :size="14" />
            </span>
            <span class="cc-viz__surface-label">{{ surface.label }}</span>
          </div>
          <div class="cc-viz__surface-text">{{ surface.text }}</div>
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
.cc-viz--harness {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

.cc-viz__panel {
  padding: 16px;
}

// 主网格
.cc-viz__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 1024px) {
  .cc-viz__grid {
    grid-template-columns: 0.9fr 1.2fr;
  }
}

.cc-viz__right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// 通用子面板外框
.cc-viz__col,
.cc-viz__packet-panel,
.cc-viz__transcript {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--cc-bg-subtle);
  padding: 12px;
}

// 面板头（icon + 标题）
.cc-viz__col-head,
.cc-viz__packet-head-left,
.cc-viz__transcript-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__col-head {
  margin-bottom: 12px;
}

.cc-viz__packet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.cc-viz__step-badge {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

// 阶段列表
.cc-viz__stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-viz__stage {
  min-width: 0;
  display: flex;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  transition: border-color 0.3s, background 0.3s, color 0.3s;
  animation: cc-harness-stage-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.cc-viz__stage--active {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1e40af;
  animation: cc-harness-stage-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
    cc-harness-bounce 0.8s ease-in-out infinite;
}

[data-theme='dark'] .cc-viz__stage--active {
  border-color: #1e40af;
  background: rgba(30, 58, 138, 0.35);
  color: #bfdbfe;
}

.cc-viz__stage--done {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #065f46;
}

[data-theme='dark'] .cc-viz__stage--done {
  border-color: #065f46;
  background: rgba(6, 78, 59, 0.3);
  color: #a7f3d0;
}

.cc-viz__stage-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
  transition: background 0.3s, color 0.3s;
}

.cc-viz__stage-icon--active {
  background: #3b82f6;
  color: #ffffff;
}

.cc-viz__stage-icon--done {
  background: #10b981;
  color: #ffffff;
}

.cc-viz__stage-body {
  min-width: 0;
}

.cc-viz__stage-title {
  overflow-wrap: break-word;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.cc-viz__stage-detail {
  margin-top: 2px;
  overflow-wrap: break-word;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.8;
}

@keyframes cc-harness-stage-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes cc-harness-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

// Turn packet 面板
.cc-viz__packet-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-viz__packet {
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.cc-viz__packet--blue {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1e40af;
}

[data-theme='dark'] .cc-viz__packet--blue {
  border-color: #1e40af;
  background: rgba(30, 58, 138, 0.35);
  color: #bfdbfe;
}

.cc-viz__packet--emerald {
  border-color: #a7f3d0;
  background: #ecfdf5;
  color: #065f46;
}

[data-theme='dark'] .cc-viz__packet--emerald {
  border-color: #065f46;
  background: rgba(6, 78, 59, 0.3);
  color: #a7f3d0;
}

.cc-viz__packet-label {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: normal;
  opacity: 0.7;
}

.cc-viz__packet-value {
  margin-top: 4px;
  overflow-wrap: break-word;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
}

.cc-viz__carried-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

@media (min-width: 640px) {
  .cc-viz__carried-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.cc-viz__carried {
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.cc-viz__carried-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.cc-viz__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.cc-viz__chip {
  max-width: 100%;
  overflow-wrap: break-word;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 11px;
}

// transcript
.cc-viz__transcript-head {
  margin-bottom: 8px;
}

.cc-viz__transcript-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-viz__transcript-item {
  overflow-wrap: break-word;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font-size: 12px;
}

// 工作表面
.cc-viz__surfaces {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-top: 12px;
}

@media (min-width: 640px) {
  .cc-viz__surfaces {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .cc-viz__surfaces {
    grid-template-columns: repeat(4, 1fr);
  }
}

.cc-viz__surface {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--cc-bg-subtle);
}

.cc-viz__surface-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__surface-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--color-surface-2);
  color: var(--color-text-muted);
}

.cc-viz__surface-label {
  overflow-wrap: break-word;
}

.cc-viz__surface-text {
  margin-top: 8px;
  overflow-wrap: break-word;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-muted);
}

// packet body 切换（mode="wait"）
.cc-harness-packet-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.cc-harness-packet-enter-active,
.cc-harness-packet-leave-active {
  transition: all 0.25s ease;
}

.cc-harness-packet-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// transcript 切换（popLayout）
.cc-harness-transcript-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.cc-harness-transcript-enter-active,
.cc-harness-transcript-leave-active {
  transition: all 0.22s ease;
}

.cc-harness-transcript-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

.cc-harness-transcript-move {
  transition: transform 0.22s ease;
}
</style>
