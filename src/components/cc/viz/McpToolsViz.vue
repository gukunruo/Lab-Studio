<script setup lang="ts">
import { computed, TransitionGroup } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhWrench,
  PhHardDrives,
  PhPlugCharging,
  PhMagnifyingGlass,
  PhCheckCircle,
  PhPlugsConnected,
} from '@phosphor-icons/vue'

// s14 — MCP Tool Bridge。内置工具带 + 外部工具盒 + 命名空间工具带 + 调用笔记本。

interface StepInfo {
  title: string
  desc: string
  active: string
}

const STEPS: StepInfo[] = [
  {
    title: 'Need a New Tool',
    desc: 'The agent starts with built-in tools, then notices this task needs an outside capability.',
    active: 'need',
  },
  {
    title: 'Plug In a Server',
    desc: 'MCP is easiest to picture as plugging a named toolbox into the agent workbench.',
    active: 'server',
  },
  {
    title: 'Read the Tool Labels',
    desc: 'The server advertises schemas, so the agent can see what each tool expects.',
    active: 'discover',
  },
  {
    title: 'Name the Tools Clearly',
    desc: 'Each external tool gets a namespaced label, which avoids collisions with built-ins.',
    active: 'belt',
  },
  {
    title: 'Use It Like Any Tool',
    desc: 'Once on the tool belt, the MCP tool follows the same call-and-result rhythm.',
    active: 'call',
  },
  {
    title: 'Result Comes Back',
    desc: 'The returned data is just another tool result for the next model turn.',
    active: 'result',
  },
]

const BUILT_INS = ['read_file', 'edit_file', 'bash']
const SERVER_TOOLS = [
  { raw: 'search', namespaced: 'mcp__docs__search' },
  { raw: 'fetch', namespaced: 'mcp__docs__fetch' },
  { raw: 'list_sections', namespaced: 'mcp__docs__list_sections' },
]
const NAMESPACED_TOOLS = SERVER_TOOLS.slice(0, 2)

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2500,
})

const stepInfo = computed(() => STEPS[currentStep.value] ?? STEPS[0]!)
const activeShelf = computed(() => STEPS[currentStep.value]?.active ?? 'need')
const connected = computed(() => currentStep.value >= 1)
const discovered = computed(() => currentStep.value >= 2)
const namespaced = computed(() => currentStep.value >= 3)
const called = computed(() => currentStep.value >= 4)
const returned = computed(() => currentStep.value >= 5)

function shelfActive(...keys: string[]): boolean {
  return keys.includes(activeShelf.value)
}
</script>

<template>
  <section class="cc-viz cc-viz--mcp">
    <div class="cc-viz__panel">
      <div class="cc-viz__mcp-grid">
        <!-- Built-in belt -->
        <div class="cc-viz__shelf" :class="{ 'cc-viz__shelf--active': shelfActive('need') }">
          <div class="cc-viz__shelf-head">
            <span class="cc-viz__shelf-icon"><PhWrench :size="15" /></span>
            <span class="cc-viz__shelf-title">Built-in belt</span>
          </div>
          <div class="cc-viz__stack">
            <span v-for="tool in BUILT_INS" :key="tool" class="cc-viz__chip">{{ tool }}</span>
            <div class="cc-viz__chip-note">limited to local skills</div>
          </div>
        </div>

        <!-- Middle column: server + workbench -->
        <div class="cc-viz__mcp-mid">
          <div
            class="cc-viz__shelf"
            :class="{ 'cc-viz__shelf--active': shelfActive('server', 'discover') }"
          >
            <div class="cc-viz__shelf-head">
              <span class="cc-viz__shelf-icon"><PhHardDrives :size="15" /></span>
              <span class="cc-viz__shelf-title">External toolbox</span>
            </div>
            <div class="cc-viz__conn">
              <div class="cc-viz__conn-name">
                <PhPlugsConnected :size="14" />
                docs-server
              </div>
              <span
                class="cc-viz__conn-badge"
                :class="{ 'cc-viz__conn-badge--on': connected }"
              >
                {{ connected ? 'connected' : 'offline' }}
              </span>
            </div>
            <TransitionGroup name="cc-viz-card" tag="div" class="cc-viz__chips cc-viz__chips--3">
              <span
                v-for="tool in discovered ? SERVER_TOOLS : []"
                :key="tool.raw"
                class="cc-viz__chip cc-viz__chip--external"
              >{{ tool.raw }}</span>
              <div v-if="!discovered" key="hidden-note" class="cc-viz__chip-note">schemas hidden until connected</div>
            </TransitionGroup>
          </div>

          <div
            class="cc-viz__shelf"
            :class="{ 'cc-viz__shelf--active': shelfActive('belt', 'call') }"
          >
            <div class="cc-viz__shelf-head">
              <span class="cc-viz__shelf-icon"><PhPlugCharging :size="15" /></span>
              <span class="cc-viz__shelf-title">Agent workbench</span>
            </div>
            <TransitionGroup name="cc-viz-card" tag="div" class="cc-viz__chips cc-viz__chips--2">
              <span
                v-for="(tool, i) in namespaced ? NAMESPACED_TOOLS : []"
                :key="tool.namespaced"
                class="cc-viz__chip"
                :class="{ 'cc-viz__chip--active': called && i === 0 }"
              >{{ tool.namespaced }}</span>
              <div v-if="!namespaced" key="belt-note" class="cc-viz__chip-note">no MCP tools on the belt</div>
            </TransitionGroup>
          </div>
        </div>

        <!-- Call notebook -->
        <div
          class="cc-viz__shelf"
          :class="{ 'cc-viz__shelf--active': shelfActive('call', 'result') }"
        >
          <div class="cc-viz__shelf-head">
            <span class="cc-viz__shelf-icon">
              <PhMagnifyingGlass v-if="called" :size="15" />
              <PhCheckCircle v-else :size="15" />
            </span>
            <span class="cc-viz__shelf-title">Call notebook</span>
          </div>
          <div class="cc-viz__call">
            <code
              class="cc-viz__call-code"
              :class="{ 'cc-viz__call-code--bounce': called && !returned }"
            >{{ called ? 'mcp__docs__search({ query })' : 'waiting for a tool call' }}</code>
            <div v-if="returned" class="cc-viz__call-result">tool_result: 3 relevant docs found</div>
          </div>
        </div>
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
.cc-viz__panel {
  padding: 16px;
}

.cc-viz__mcp-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

.cc-viz__mcp-mid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

// Shelf / card container
.cc-viz__shelf {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  transition: border-color 0.3s, background 0.3s;
}

.cc-viz__shelf--active {
  border-color: var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
}

.cc-viz__shelf-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cc-viz__shelf-icon {
  display: flex;
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

[data-theme='dark'] .cc-viz__shelf-icon {
  background: #27272a;
  color: #d4d4d8;
}

.cc-viz__shelf--active .cc-viz__shelf-icon {
  background: var(--cc-emerald-fill);
  color: #fff;
}

.cc-viz__shelf-title {
  min-width: 0;
  overflow-wrap: break-word;
}

// Built-in belt: vertical stack
.cc-viz__stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// External / workbench chip grids
.cc-viz__chips {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

.cc-viz__chips--3 {
  margin-top: 12px;
}

@media (min-width: 640px) {
  .cc-viz__chips--3 {
    grid-template-columns: repeat(3, 1fr);
  }

  .cc-viz__chips--2 {
    grid-template-columns: repeat(2, 1fr);
  }
}

// Tool chips
.cc-viz__chip {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: break-word;
  padding: 6px 8px;
  border: 1px solid #e4e4e7;
  border-radius: var(--radius-sm);
  background: #ffffff;
  color: #52525b;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
  animation: cc-mcp-chip-in 0.2s ease both;
}

[data-theme='dark'] .cc-viz__chip {
  border-color: #3f3f46;
  background: #18181b;
  color: #d4d4d8;
}

.cc-viz__chip--active {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-viz__chip--external {
  border-color: var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

// Dashed placeholder
.cc-viz__chip-note {
  grid-column: 1 / -1;
  padding: 20px 12px;
  border: 1px dashed var(--cc-node-stroke);
  border-radius: var(--radius-sm);
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
  animation: cc-mcp-chip-in 0.2s ease both;
}

// Connection status bar
.cc-viz__conn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--cc-node-stroke);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
  font-size: 12px;
}

.cc-viz__conn-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-family: var(--font-mono);
  color: var(--cc-node-text);
}

.cc-viz__conn-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--cc-node-fill);
  color: var(--cc-label);
  font-size: 10px;
  font-weight: 600;
}

.cc-viz__conn-badge--on {
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

// Call notebook
.cc-viz__call {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-viz__call-code {
  display: block;
  overflow-wrap: break-word;
  padding: 12px;
  border: 1px solid var(--cc-node-stroke);
  border-radius: var(--radius-sm);
  background: var(--cc-bg-subtle);
  color: var(--cc-node-text);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
}

.cc-viz__call-code--bounce {
  animation: cc-mcp-bounce 1s ease-in-out infinite;
}

.cc-viz__call-result {
  overflow-wrap: break-word;
  padding: 12px;
  border: 1px solid var(--cc-emerald-border);
  border-radius: var(--radius-sm);
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
  font-size: 12px;
  line-height: 1.4;
  animation: cc-mcp-result-in 0.2s ease both;
}

@keyframes cc-mcp-chip-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cc-mcp-result-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cc-mcp-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

@media (min-width: 1024px) {
  .cc-viz__mcp-grid {
    grid-template-columns: 1fr 1.2fr 1fr;
  }
}
</style>
