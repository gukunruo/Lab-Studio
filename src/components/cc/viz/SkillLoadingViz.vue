<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'

// s07 — On-Demand Skill Loading。系统提示词里的技能目录 + load_skill 注入 SKILL.md。

interface SkillEntry {
  name: string
  summary: string
  content: string[]
}

const SKILLS: SkillEntry[] = [
  { name: 'code-review', summary: 'Review code for bugs, security, and maintainability', content: ['# Code Review Skill', '1. Inspect the change and its surrounding code', '2. Prioritize bugs and behavioral regressions', '3. Report missing tests and residual risk'] },
  { name: 'pdf', summary: 'Read, create, and modify PDF files', content: ['# PDF Processing Skill', '1. Choose text extraction or rendered inspection', '2. Preserve page order and layout where needed', '3. Verify the produced PDF before returning it'] },
  { name: 'agent-builder', summary: 'Design and build agents for a target domain', content: ['# Agent Builder Skill', "1. Define the agent's task and boundaries", '2. Select tools and state', '3. Test the complete loop'] },
  { name: 'mcp-builder', summary: 'Build MCP servers and expose external tools', content: ['# MCP Server Building Skill', '1. Define tool schemas', '2. Connect handlers to external services', '3. Verify discovery and tool calls'] },
]

const LOADED_STATES = [0, 0, 1, 1, 2, 2]

const STEPS = [
  { title: 'Scan the Catalog', description: 'Startup adds skill names and descriptions to the system prompt.' },
  { title: 'A Specialized Task', description: 'The user asks for work covered by one of the listed skills.' },
  { title: 'Load the Skill', description: 'The full skill instructions are injected as a tool_result, not into the system prompt.' },
  { title: 'Follow the Instructions', description: 'The detailed instructions appear as if a tool returned them. The model follows them precisely.' },
  { title: 'Load Another Skill', description: 'A later task can load a different SKILL.md through the same tool.' },
  { title: 'Catalog and Full Content', description: 'The catalog supports discovery; load_skill returns the selected instructions.' },
]

defineProps<{ title?: string }>()

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: 6,
  autoPlayInterval: 2500,
})

const loadedCount = computed(() => LOADED_STATES[currentStep.value] ?? 0)
const highlightedSkill = computed(() =>
  currentStep.value >= 1 && currentStep.value <= 3 ? 0 : currentStep.value >= 4 ? 1 : -1,
)
const showFirstContent = computed(() => currentStep.value >= 2)
const showSecondContent = computed(() => currentStep.value >= 4)
const firstContentFaded = computed(() => currentStep.value >= 5)
const showConnectingArrow = computed(() => showFirstContent.value || showSecondContent.value)
const showFirstAsk = computed(() => currentStep.value === 1)
const showSecondAsk = computed(() => currentStep.value === 4)
const showAnnotation = computed(() => currentStep.value === 3)
const showOverview = computed(() => currentStep.value === 5)

const firstContent = computed(() => SKILLS[0]?.content ?? [])
const secondContent = computed(() => SKILLS[1]?.content ?? [])

const stepInfo = computed(() => STEPS[currentStep.value]!)
</script>

<template>
  <section class="cc-viz cc-viz--skill">
    <div class="cc-viz__panel">
      <h2 class="cc-viz__title">{{ title || 'On-Demand Skill Loading' }}</h2>

      <div class="cc-viz__body">
        <!-- Main content area -->
        <div class="cc-viz__main">
          <!-- System Prompt Block -->
          <div>
            <div class="cc-viz__sec-head">
              <span class="cc-viz__dot" />
              <span class="cc-viz__sec-label">System Prompt</span>
              <span class="cc-viz__badge">always present</span>
            </div>
            <div class="cc-viz__system">
              <div class="cc-viz__system-title"># Available Skills</div>
              <div class="cc-viz__skill-list">
                <div
                  v-for="(skill, i) in SKILLS"
                  :key="skill.name"
                  class="cc-viz__skill-item"
                  :class="{ 'cc-viz__skill-item--active': i === highlightedSkill }"
                >
                  <span class="cc-viz__skill-name">{{ skill.name }}</span>
                  <span class="cc-viz__skill-sep"> - </span>
                  <span class="cc-viz__skill-summary">{{ skill.summary }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- User invocation indicator (step 1) -->
          <div v-if="showFirstAsk" class="cc-viz__ask">
            <span class="cc-viz__ask-label">User asks:</span>
            <code class="cc-viz__ask-code">Review this change for bugs and regressions.</code>
          </div>

          <!-- User invocation indicator (step 4) -->
          <div v-if="showSecondAsk" class="cc-viz__ask">
            <span class="cc-viz__ask-label">User asks:</span>
            <code class="cc-viz__ask-code">Extract the tables from this PDF.</code>
          </div>

          <!-- Connecting arrow -->
          <div v-if="showConnectingArrow" class="cc-viz__arrow">
            <div class="cc-viz__arrow-line" />
            <div class="cc-viz__arrow-head" />
          </div>

          <!-- Expanded Skill Content: code-review -->
          <div v-if="showFirstContent" class="cc-viz__content">
            <div class="cc-viz__card" :class="{ 'cc-viz__card--faded': firstContentFaded }">
              <div class="cc-viz__card-head">
                <div class="cc-viz__card-title-group">
                  <span class="cc-viz__card-dot" />
                  <span class="cc-viz__card-title">SKILL.md: code-review</span>
                </div>
                <span class="cc-viz__card-badge">tool_result</span>
              </div>
              <div class="cc-viz__lines">
                <div
                  v-for="(line, i) in firstContent"
                  :key="i"
                  class="cc-viz__line"
                  :style="{ animationDelay: i * 0.08 + 's' }"
                >
                  {{ line }}
                </div>
              </div>
            </div>
          </div>

          <!-- Expanded Skill Content: pdf -->
          <div v-if="showSecondContent" class="cc-viz__content">
            <div class="cc-viz__card cc-viz__card--purple">
              <div class="cc-viz__card-head">
                <div class="cc-viz__card-title-group">
                  <span class="cc-viz__card-dot" />
                  <span class="cc-viz__card-title">SKILL.md: pdf</span>
                </div>
                <span class="cc-viz__card-badge">tool_result</span>
              </div>
              <div class="cc-viz__lines">
                <div
                  v-for="(line, i) in secondContent"
                  :key="i"
                  class="cc-viz__line"
                  :style="{ animationDelay: i * 0.08 + 's' }"
                >
                  {{ line }}
                </div>
              </div>
            </div>
          </div>

          <!-- Mechanism annotation (step 3) -->
          <div v-if="showAnnotation" class="cc-viz__annot">
            The Skill tool returns content as a tool_result message.
            The model sees it in context and follows the instructions.
            The full file is now part of the message history.
          </div>

          <!-- Final overview (step 5) -->
          <div v-if="showOverview" class="cc-viz__overview">
            <div class="cc-viz__overview-box">
              <div class="cc-viz__overview-label">CATALOG</div>
              <div class="cc-viz__overview-text">Names and descriptions in the system prompt</div>
            </div>
            <div class="cc-viz__overview-box cc-viz__overview-box--blue">
              <div class="cc-viz__overview-label">FULL CONTENT</div>
              <div class="cc-viz__overview-text">Selected SKILL.md returned by load_skill</div>
            </div>
          </div>
        </div>

        <!-- Loaded skill count -->
        <div class="cc-viz__loaded">
          <div class="cc-viz__loaded-label">Loaded</div>
          <div class="cc-viz__load-track">
            <div
              class="cc-viz__load-fill"
              :class="loadedCount > 1 ? 'cc-viz__load-fill--blue' : 'cc-viz__load-fill--emerald'"
              :style="{ height: loadedCount * 35 + '%' }"
            />
          </div>
          <div :key="loadedCount" class="cc-viz__load-count">{{ loadedCount }}</div>
        </div>
      </div>
    </div>

    <div class="cc-viz__controls">
      <StepControls
        :current-step="currentStep"
        :total-steps="6"
        :is-playing="isPlaying"
        :step-title="stepInfo.title"
        :step-description="stepInfo.description"
        @prev="prev"
        @next="next"
        @reset="reset"
        @toggle="toggleAutoPlay"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.cc-viz__panel {
  padding: 16px;
}

.cc-viz__title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 500px;
}

.cc-viz__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
}

@media (min-width: 720px) {
  .cc-viz__body {
    flex-direction: row;
  }
}

/* System Prompt 头部 */
.cc-viz__sec-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cc-viz__dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--cc-label);
}

.cc-viz__sec-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.cc-viz__badge {
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--color-border);
  color: var(--color-text-muted);
}

/* 常暗的系统提示词块 */
.cc-viz__system {
  margin-top: 8px;
  padding: 16px;
  border: 1px solid #3f3f46;
  border-radius: var(--radius-md);
  background: #18181b;
}

.cc-viz__system-title {
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #71717a;
}

.cc-viz__skill-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cc-viz__skill-item {
  padding: 6px 12px;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  background: #27272a;
  color: #a1a1aa;
  transition: box-shadow 0.4s, background 0.3s, color 0.3s;
}

.cc-viz__skill-item--active {
  background: rgba(30, 58, 138, 0.6);
  color: #93c5fd;
  box-shadow: 0 0 12px 2px rgba(59, 130, 246, 0.5);
}

.cc-viz__skill-name {
  font-weight: 600;
  color: #e4e4e7;
}

/* 用户请求指示（蓝色） */
.cc-viz__ask {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--cc-blue-border);
  border-radius: var(--radius-sm);
  background: var(--cc-blue-bg);
  animation: cc-skill-in 0.4s ease both;
}

.cc-viz__ask-label {
  font-size: 12px;
  color: var(--cc-blue-text);
}

.cc-viz__ask-code {
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

/* 连接箭头 */
.cc-viz__arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: cc-skill-in 0.4s ease both;
}

.cc-viz__arrow-line {
  width: 1px;
  height: 24px;
  background: var(--cc-blue-fill);
}

.cc-viz__arrow-head {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid var(--cc-blue-fill);
}

/* 展开的 SKILL.md 卡片 */
.cc-viz__content {
  animation: cc-skill-in 0.4s ease both;
}

.cc-viz__card {
  padding: 16px;
  border: 2px solid var(--cc-active-stroke);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  opacity: 1;
  transition: opacity 0.4s;
}

.cc-viz__card--faded {
  opacity: 0.4;
}

.cc-viz__card--purple {
  border-color: var(--cc-violet-border);
}

.cc-viz__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cc-viz__card-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cc-viz__card-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--cc-blue-fill);
}

.cc-viz__card--purple .cc-viz__card-dot {
  background: var(--cc-violet-fill);
}

.cc-viz__card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--cc-blue-text);
}

.cc-viz__card--purple .cc-viz__card-title {
  color: var(--cc-violet-text);
}

.cc-viz__card-badge {
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-viz__card--purple .cc-viz__card-badge {
  background: var(--cc-violet-bg);
  color: var(--cc-violet-text);
}

.cc-viz__lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cc-viz__line {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text);
  animation: cc-skill-line-in 0.4s ease both;
}

/* 机制标注（amber） */
.cc-viz__annot {
  padding: 8px 12px;
  border: 1px solid var(--cc-amber-border);
  border-radius: 6px;
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
  font-size: 12px;
  animation: cc-skill-in 0.4s ease both;
}

/* 最终总览 */
.cc-viz__overview {
  display: flex;
  gap: 12px;
  animation: cc-skill-in 0.4s ease both;
}

.cc-viz__overview-box {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface-2);
  text-align: center;
}

.cc-viz__overview-box--blue {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
}

.cc-viz__overview-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.cc-viz__overview-box--blue .cc-viz__overview-label {
  color: var(--cc-blue-text);
}

.cc-viz__overview-text {
  font-size: 12px;
  color: var(--color-text);
}

.cc-viz__overview-box--blue .cc-viz__overview-text {
  color: var(--cc-blue-text);
}

/* Loaded 计数 */
.cc-viz__loaded {
  display: flex;
  flex-shrink: 0;
  width: 64px;
  flex-direction: column;
  align-items: center;
}

.cc-viz__loaded-label {
  margin-bottom: 4px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-text-muted);
}

.cc-viz__load-track {
  position: relative;
  width: 32px;
  height: 300px;
  overflow: hidden;
  border-radius: 9999px;
  background: var(--cc-node-fill);
}

.cc-viz__load-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-radius: 9999px;
  transition: height 0.5s;
}

.cc-viz__load-fill--blue {
  background: var(--cc-blue-fill);
}

.cc-viz__load-fill--emerald {
  background: var(--cc-emerald-fill);
}

.cc-viz__load-count {
  margin-top: 8px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  animation: cc-skill-count 0.3s ease both;
}

.cc-viz__controls {
  margin-top: 16px;
}

@keyframes cc-skill-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cc-skill-line-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes cc-skill-count {
  from {
    transform: scale(0.8);
  }
  to {
    transform: scale(1);
  }
}
</style>
