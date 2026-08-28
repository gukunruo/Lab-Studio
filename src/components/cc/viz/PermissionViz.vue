<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhWarningOctagon,
  PhShieldCheck,
  PhPlayCircle,
  PhCheckCircle,
  PhUserCheck,
  PhShieldWarning,
  PhClipboardText,
} from '@phosphor-icons/vue'

// s03 — Permission Desk。面板内 allow / ask / deny 三种路由结果。

type StepMode = 'overview' | 'allow' | 'ask' | 'ask-approved' | 'deny' | 'summary'
type RequestId = 'allow' | 'ask' | 'deny'
type Tone = 'emerald' | 'amber' | 'red' | 'blue' | 'zinc'
type CheckStatus = 'waiting' | 'pass' | 'allow' | 'ask' | 'approved' | 'deny' | 'skip'

interface Step {
  title: string
  desc: string
  mode: StepMode
}

interface Request {
  id: RequestId
  tool: string
  command: string
  result: 'allow' | 'ask' | 'deny'
  detail: string
  tone: Tone
}

const STEPS: Step[] = [
  { title: 'Three Requests, Three Routes', desc: 'Permission is a router: safe calls run, risky calls ask, forbidden calls stop.', mode: 'overview' },
  { title: 'Allow: Safe Read Runs Immediately', desc: 'A read-only file request passes policy and reaches the handler without a user ticket.', mode: 'allow' },
  { title: 'Ask: Risky Local Delete Becomes a Ticket', desc: 'A local delete command is not forbidden, but it must pause for explicit confirmation.', mode: 'ask' },
  { title: 'Approved Ask: Handler Runs After Yes', desc: 'The same risky request executes only after the user approves this exact action.', mode: 'ask-approved' },
  { title: 'Deny: Forbidden Pattern Stops Early', desc: 'A root-level sudo delete is blocked before any handler can touch the machine.', mode: 'deny' },
  { title: 'One Permission Desk, Three Outcomes', desc: 'The harness keeps allow, ask, and deny decisions outside the model, then returns the decision to the loop.', mode: 'summary' },
]

const REQUESTS: Request[] = [
  { id: 'allow', tool: 'read_file', command: 'README.md', result: 'allow', detail: 'read-only workspace file', tone: 'emerald' },
  { id: 'ask', tool: 'bash', command: 'rm -rf ./tmp/build-cache', result: 'ask', detail: 'local destructive command', tone: 'amber' },
  { id: 'deny', tool: 'bash', command: 'sudo rm -rf /', result: 'deny', detail: 'forbidden root delete', tone: 'red' },
]

interface CheckRowData {
  label: string
  detail: string
  status: CheckStatus
  active: boolean
}

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEPS.length,
  autoPlayInterval: 2500,
})

const mode = computed<StepMode>(() => STEPS[currentStep.value]?.mode ?? 'overview')
const activeId = computed<RequestId | null>(() => activeRequestId(mode.value))
const stepInfo = computed(() => STEPS[currentStep.value] ?? STEPS[0]!)
const toolSurfaceActive = computed(() => mode.value === 'overview' || activeId.value !== null)

function activeRequestId(m: StepMode): RequestId | null {
  if (m === 'allow') return 'allow'
  if (m === 'ask' || m === 'ask-approved') return 'ask'
  if (m === 'deny') return 'deny'
  return null
}

function toneClass(t: Tone): string {
  return `cc-viz__tone--${t}`
}

function reqActive(id: RequestId): boolean {
  return activeId.value === id || (mode.value === 'overview' && currentStep.value === 0)
}

function reqMuted(id: RequestId): boolean {
  return activeId.value !== null && activeId.value !== id
}

function checkTone(status: CheckStatus): Tone {
  if (status === 'deny') return 'red'
  if (status === 'pass' || status === 'allow' || status === 'approved') return 'emerald'
  if (status === 'ask') return 'amber'
  return 'zinc'
}

function checkIcon(status: CheckStatus): Component {
  if (status === 'deny') return PhWarningOctagon
  if (status === 'pass' || status === 'allow') return PhCheckCircle
  if (status === 'ask') return PhShieldWarning
  if (status === 'approved') return PhUserCheck
  return PhClipboardText
}

function summaryReqIcon(result: Request['result']): Component {
  if (result === 'deny') return PhWarningOctagon
  if (result === 'ask') return PhShieldWarning
  return PhShieldCheck
}

const permissionRows = computed<CheckRowData[]>(() => {
  const m = mode.value
  if (m === 'overview' || m === 'summary') {
    return [
      { label: 'Safe read', detail: 'No write, no shell, no approval needed.', status: 'allow', active: m === 'overview' },
      { label: 'Risky local change', detail: 'May be useful, but requires a human yes.', status: 'ask', active: m === 'overview' },
      { label: 'Forbidden pattern', detail: 'Root delete and sudo never reach handlers.', status: 'deny', active: m === 'overview' },
    ]
  }
  if (m === 'allow') {
    return [
      { label: 'Gate 1: hard deny', detail: 'No sudo, no root path, no forbidden pattern.', status: 'pass', active: false },
      { label: 'Gate 2: allow rule', detail: 'Read-only workspace file can run immediately.', status: 'allow', active: true },
      { label: 'Gate 3: user approval', detail: 'Skipped because this call is already safe.', status: 'skip', active: false },
    ]
  }
  if (m === 'deny') {
    return [
      { label: 'Gate 1: hard deny', detail: 'sudo + root delete is blocked immediately.', status: 'deny', active: true },
      { label: 'Gate 2: risk rule', detail: 'Skipped because hard deny already decided.', status: 'skip', active: false },
      { label: 'Gate 3: user approval', detail: 'Skipped because the user cannot approve forbidden actions.', status: 'skip', active: false },
    ]
  }
  return [
    { label: 'Gate 1: hard deny', detail: 'Local project path is not globally forbidden.', status: 'pass', active: false },
    { label: 'Gate 2: risk rule', detail: 'Deleting files needs an explicit approval ticket.', status: 'ask', active: m === 'ask' },
    { label: 'Gate 3: user approval', detail: 'The tool waits until this request is approved.', status: m === 'ask-approved' ? 'approved' : 'waiting', active: m === 'ask-approved' },
  ]
})
</script>

<template>
  <section class="cc-viz cc-viz--permission">
    <div class="cc-viz__panel">
      <div class="cc-viz__grid">
        <div class="cc-viz__surface" :class="{ 'cc-viz__surface--active': toolSurfaceActive }">
          <div class="cc-viz__surface-head">
            <span class="cc-viz__surface-icon"><PhWarningOctagon :size="20" /></span>
            <span class="cc-viz__surface-title">Tool requests</span>
          </div>
          <div class="cc-viz__stack">
            <div
              v-for="req in REQUESTS"
              :key="req.id"
              class="cc-viz__req"
              :class="[
                reqActive(req.id) ? 'cc-viz__req--active' : '',
                reqActive(req.id) ? toneClass(req.tone) : '',
                reqMuted(req.id) ? 'cc-viz__req--muted' : '',
              ]"
            >
              <div class="cc-viz__req-top">
                <span class="cc-viz__req-caption">tool request</span>
                <span class="cc-viz__req-tool">{{ req.tool }}</span>
              </div>
              <code class="cc-viz__req-code">{{ req.command }}</code>
              <div class="cc-viz__req-bottom">
                <span class="cc-viz__req-detail">{{ req.detail }}</span>
                <span class="cc-viz__req-result">{{ req.result }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="cc-viz__surface" :class="{ 'cc-viz__surface--active': mode !== 'overview' }">
          <div class="cc-viz__surface-head">
            <span class="cc-viz__surface-icon"><PhShieldCheck :size="20" /></span>
            <span class="cc-viz__surface-title">Permission desk</span>
          </div>
          <div class="cc-viz__stack">
            <div
              v-for="row in permissionRows"
              :key="row.label"
              class="cc-viz__check"
              :class="row.active ? toneClass(checkTone(row.status)) : ''"
            >
              <div class="cc-viz__check-top">
                <span class="cc-viz__check-label">
                  <component :is="checkIcon(row.status)" :size="16" class="cc-viz__check-icon" />
                  {{ row.label }}
                </span>
                <span class="cc-viz__check-status">{{ row.status }}</span>
              </div>
              <div class="cc-viz__check-detail">{{ row.detail }}</div>
            </div>
          </div>
        </div>

        <div class="cc-viz__surface" :class="{ 'cc-viz__surface--active': mode !== 'overview' }">
          <div class="cc-viz__surface-head">
            <span class="cc-viz__surface-icon"><PhPlayCircle :size="20" /></span>
            <span class="cc-viz__surface-title">Outcome</span>
          </div>
          <div :key="mode" class="cc-viz__outcome-wrap">
            <div v-if="mode === 'overview'" class="cc-viz__outcome-placeholder">select a request route</div>

            <div v-else-if="mode === 'allow'" class="cc-viz__outcome cc-viz__tone--emerald">
              <div class="cc-viz__outcome-head">
                <PhPlayCircle :size="17" />
                <span>Handler runs now</span>
              </div>
              <div class="cc-viz__codeline">
                <div class="cc-viz__codeline-label">handler</div>
                <code class="cc-viz__codeline-val">read_file</code>
              </div>
              <div class="cc-viz__codeline">
                <div class="cc-viz__codeline-label">args</div>
                <code class="cc-viz__codeline-val">path: "README.md"</code>
              </div>
            </div>

            <div v-else-if="mode === 'ask'" class="cc-viz__outcome cc-viz__tone--amber">
              <div class="cc-viz__outcome-head">
                <PhUserCheck :size="17" />
                <span>Approval ticket</span>
              </div>
              <div class="cc-viz__outcome-text">"Allow deleting local build cache?"</div>
            </div>

            <div v-else-if="mode === 'ask-approved'" class="cc-viz__outcome cc-viz__tone--blue">
              <div class="cc-viz__outcome-head">
                <PhPlayCircle :size="17" />
                <span>Handler runs after approval</span>
              </div>
              <div class="cc-viz__codeline">
                <div class="cc-viz__codeline-label">handler</div>
                <code class="cc-viz__codeline-val">bash</code>
              </div>
              <div class="cc-viz__codeline">
                <div class="cc-viz__codeline-label">args</div>
                <code class="cc-viz__codeline-val">rm -rf ./tmp/build-cache</code>
              </div>
            </div>

            <div v-else-if="mode === 'deny'" class="cc-viz__outcome cc-viz__tone--red">
              <div class="cc-viz__outcome-head">
                <PhWarningOctagon :size="17" />
                <span>Blocked before handler</span>
              </div>
              <div class="cc-viz__outcome-text">No tool execution, no user prompt, no filesystem touch.</div>
            </div>

            <div v-else class="cc-viz__outcome-stack">
              <div
                v-for="req in REQUESTS"
                :key="req.id"
                class="cc-viz__outcome-mini"
                :class="toneClass(req.tone)"
              >
                <div class="cc-viz__outcome-mini-head">
                  <component :is="summaryReqIcon(req.result)" :size="15" />
                  {{ req.result }}
                </div>
                <div class="cc-viz__outcome-mini-detail">{{ req.detail }}</div>
              </div>
              <div class="cc-viz__outcome-decision cc-viz__tone--emerald">
                <div class="cc-viz__outcome-mini-head">
                  <PhShieldCheck :size="17" />
                  decision returned to loop
                </div>
                <div class="cc-viz__outcome-text">Permission stays outside the model, but the loop still receives a normal tool_result or blocked result.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cc-viz__note">
        Beginner rule: the model proposes tools; the runtime routes each request to allow, ask, or deny before execution.
      </div>
    </div>

    <StepControls
      :current-step="currentStep"
      :total-steps="6"
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

.cc-viz__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

@media (min-width: 1024px) {
  .cc-viz__grid {
    grid-template-columns: 1fr 1.1fr 0.95fr;
  }
}

.cc-viz__surface {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 16px;
  transition: border-color 0.3s, background 0.3s;
}

.cc-viz__surface--active {
  border-color: var(--cc-red-border);
  background: var(--cc-red-bg);
}

.cc-viz__surface-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 17px;
  font-weight: 600;
}

.cc-viz__surface-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #f4f4f5;
  color: #71717a;
}

[data-theme='dark'] .cc-viz__surface-icon {
  background: #27272a;
  color: #d4d4d8;
}

.cc-viz__surface--active .cc-viz__surface-icon {
  background: var(--cc-red-fill);
  color: #fff;
}

.cc-viz__stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-viz__outcome-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-viz__req {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 16px;
  transition: transform 0.3s, opacity 0.3s, border-color 0.3s, background 0.3s, color 0.3s;
}

.cc-viz__req--active {
  transform: translateY(-1px);
}

.cc-viz__req--muted {
  opacity: 0.45;
}

.cc-viz__req-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cc-viz__req-caption {
  font-size: 13px;
  font-weight: 600;
}

.cc-viz__req-tool {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.7);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}

[data-theme='dark'] .cc-viz__req-tool {
  background: rgba(9, 9, 11, 0.3);
}

.cc-viz__req-code {
  display: block;
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: #09090b;
  color: #f4f4f5;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.cc-viz__req-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.cc-viz__req-detail {
  opacity: 0.8;
}

.cc-viz__req-result {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.75);
  font-weight: 600;
}

[data-theme='dark'] .cc-viz__req-result {
  background: rgba(9, 9, 11, 0.3);
}

.cc-viz__check {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 12px;
  animation: cc-viz-perm-fade 0.4s ease both;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}

.cc-viz__check-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.cc-viz__check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
}

.cc-viz__check-icon {
  flex-shrink: 0;
}

.cc-viz__check-status {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  font-weight: 600;
}

[data-theme='dark'] .cc-viz__check-status {
  background: rgba(9, 9, 11, 0.3);
}

.cc-viz__check-detail {
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.8;
}

.cc-viz__outcome-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: cc-viz-perm-fade 0.4s ease both;
}

.cc-viz__outcome-placeholder {
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
}

.cc-viz__outcome {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 16px;
}

.cc-viz__outcome-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.cc-viz__outcome-text {
  font-size: 14px;
  line-height: 1.6;
}

.cc-viz__codeline {
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
}

[data-theme='dark'] .cc-viz__codeline {
  background: rgba(9, 9, 11, 0.3);
}

.cc-viz__codeline-label {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  opacity: 0.7;
}

.cc-viz__codeline-val {
  display: block;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.cc-viz__outcome-mini {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 12px;
}

.cc-viz__outcome-mini-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
  font-weight: 600;
}

.cc-viz__outcome-mini-detail {
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.8;
}

.cc-viz__outcome-decision {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 16px;
}

.cc-viz__note {
  margin-top: 12px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-2);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.cc-viz__tone--emerald {
  border-color: var(--cc-emerald-border);
  background: var(--cc-emerald-bg);
  color: var(--cc-emerald-text);
}

.cc-viz__tone--amber {
  border-color: var(--cc-amber-border);
  background: var(--cc-amber-bg);
  color: var(--cc-amber-text);
}

.cc-viz__tone--red {
  border-color: var(--cc-red-border);
  background: var(--cc-red-bg);
  color: var(--cc-red-text);
}

.cc-viz__tone--blue {
  border-color: var(--cc-blue-border);
  background: var(--cc-blue-bg);
  color: var(--cc-blue-text);
}

.cc-viz__tone--zinc {
  border-color: var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
}

@keyframes cc-viz-perm-fade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
