<script setup lang="ts">
import { computed } from 'vue'
import { useSteppedVisualization } from '../useSteppedVisualization'
import StepControls from '../StepControls.vue'
import {
  PhBookOpen,
  PhCheckCircle,
  PhFileText,
  PhTray,
  PhMagnifyingGlass,
  PhSparkle,
} from '@phosphor-icons/vue'

// s09 — Memory Library。learn 阶段收集偏好 → MEMORY.md 目录 → recall 阶段只借需要的记忆。

type MemoryType = 'feedback' | 'project' | 'reference'

interface MemoryFile {
  id: string
  type: MemoryType
  title: string
  filename: string
  description: string
  body: string
  relevant?: boolean
}

const MEMORY_FILES: MemoryFile[] = [
  {
    id: 'visual-preference',
    type: 'feedback',
    title: 'Beginner visual preference',
    filename: 'lcc_visual_preference.md',
    description: 'Use concrete mental models for LCC web pages.',
    body: 'Prefer cards, boards, shelves, and workbenches over abstract flowcharts.',
    relevant: true,
  },
  {
    id: 'project-path',
    type: 'project',
    title: 'LCC web paths',
    filename: 'lcc_web_paths.md',
    description: 'Web app reads root lesson folders and generated JSON.',
    body: 'Build from web/, extract content from the root lesson directories.',
  },
  {
    id: 'test-command',
    type: 'reference',
    title: 'Verification commands',
    filename: 'lcc_test_commands.md',
    description: 'Useful smoke checks for the course website.',
    body: 'Run npm run build, then browser-check /zh/s09 and /zh/s17.',
  },
]

const STEP_INFO = [
  { title: 'A Fact Worth Keeping', desc: 'The user says something that should survive future sessions.' },
  { title: 'Stamp It After the Turn', desc: 'Memory extraction happens after useful work, so the main loop stays focused.' },
  { title: 'Write One Memory File', desc: 'The durable detail goes into a Markdown file with a readable title and metadata.' },
  { title: 'Update the Catalog', desc: 'MEMORY.md is the cheap catalog: short enough to keep nearby.' },
  { title: 'A Future Request Arrives', desc: 'Later, the agent sees a new request and the catalog, not the whole library.' },
  { title: 'Catalog Picks One', desc: 'Selection chooses the one memory file that is relevant now.' },
  { title: 'Build the Reading Stack', desc: 'Only the selected memory joins the current request before the model call.' },
  { title: 'Continuity Without Clutter', desc: 'The answer reflects old context while unrelated memories stay on the shelf.' },
] as const

const PHASES = ['learn', 'catalog', 'recall']

const { currentStep, next, prev, reset, isPlaying, toggleAutoPlay } = useSteppedVisualization({
  totalSteps: STEP_INFO.length,
  autoPlayInterval: 2500,
})

const stepInfo = computed(() => STEP_INFO[currentStep.value] ?? STEP_INFO[0]!)
const selectedFile = MEMORY_FILES[0]!

const catalogVisible = computed(() => currentStep.value >= 3)
const futureVisible = computed(() => currentStep.value >= 4)
const selected = computed(() => currentStep.value >= 5)
const injected = computed(() => currentStep.value >= 6)

const learnActive = computed(() => currentStep.value <= 2)
const catalogActive = computed(() => currentStep.value === 3 || selected.value)
const recallActive = computed(() => futureVisible.value)
const libraryActive = computed(() => catalogVisible.value || selected.value)

function phaseActive(index: number): boolean {
  if (index === 0) return learnActive.value
  if (index === 1) return catalogActive.value
  return recallActive.value
}
</script>

<template>
  <section class="cc-viz cc-viz--memory">
    <div class="cc-viz__panel">
      <div class="cc-mem__phases">
        <div
          v-for="(label, index) in PHASES"
          :key="label"
          class="cc-mem__phase"
          :class="{ 'cc-mem__phase--active': phaseActive(index) }"
        >
          {{ index + 1 }}. {{ label }}
        </div>
      </div>

      <div class="cc-mem__row">
        <div class="cc-mem__surface" :class="{ 'cc-mem__surface--violet': learnActive }">
          <div class="cc-mem__surface-head">
            <span
              class="cc-mem__surface-icon"
              :class="{ 'cc-mem__surface-icon--violet': learnActive }"
            >
              <PhTray :size="20" />
            </span>
            <span class="cc-mem__surface-title">Session A: learn</span>
          </div>
          <div class="cc-mem__surface-body">
            <div class="cc-mem__quote">"Please keep LCC pages concrete for beginners."</div>
            <div v-if="currentStep >= 1" class="cc-mem__stamp">
              <div class="cc-mem__stamp-title">Memory extractor stamp</div>
              Save a durable preference after the useful work is done.
            </div>
            <div v-if="currentStep >= 2" class="cc-mem__detail">
              <div class="cc-mem__detail-head">
                <div class="cc-mem__detail-meta">
                  <div class="cc-mem__detail-title">{{ selectedFile.title }}</div>
                  <div class="cc-mem__detail-file">{{ selectedFile.filename }}</div>
                </div>
              </div>
              <div class="cc-mem__detail-body">{{ selectedFile.body }}</div>
            </div>
          </div>
        </div>

        <div class="cc-mem__surface" :class="{ 'cc-mem__surface--violet': recallActive }">
          <div class="cc-mem__surface-head">
            <span
              class="cc-mem__surface-icon"
              :class="{ 'cc-mem__surface-icon--violet': recallActive }"
            >
              <PhMagnifyingGlass v-if="selected" :size="20" />
              <PhSparkle v-else :size="20" />
            </span>
            <span class="cc-mem__surface-title">Session B: recall</span>
          </div>
          <div class="cc-mem__surface-body">
            <div v-if="!futureVisible" class="cc-mem__empty">future request has not arrived</div>
            <div v-else class="cc-mem__quote">"Continue improving the web lesson visuals."</div>
            <div v-if="selected" class="cc-mem__pick">
              Catalog search selects <span class="cc-mem__mono">lcc_visual_preference.md</span>
            </div>
            <div v-if="injected" class="cc-mem__stack">
              <div class="cc-mem__stack-title">Reading stack before LLM</div>
              <div class="cc-mem__stack-list">
                <div class="cc-mem__stack-item">current request</div>
                <div class="cc-mem__stack-item cc-mem__stack-item--violet">selected memory detail</div>
                <div
                  v-if="currentStep >= 7"
                  class="cc-mem__stack-item cc-mem__stack-item--emerald"
                >
                  answer keeps the user's preference
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        class="cc-mem__surface cc-mem__surface--mt"
        :class="{ 'cc-mem__surface--violet': libraryActive }"
      >
        <div class="cc-mem__surface-head">
          <span
            class="cc-mem__surface-icon"
            :class="{ 'cc-mem__surface-icon--violet': libraryActive }"
          >
            <PhBookOpen :size="20" />
          </span>
          <span class="cc-mem__surface-title">.memory library</span>
        </div>

        <div class="cc-mem__library">
          <div class="cc-mem__catalog">
            <div class="cc-mem__catalog-head">
              <PhFileText :size="16" />
              MEMORY.md catalog
            </div>
            <div class="cc-mem__catalog-list">
              <div
                v-for="(file, index) in MEMORY_FILES"
                :key="file.id"
                v-show="catalogVisible && (index === 0 || currentStep >= 4)"
                class="cc-mem__catalog-row"
                :class="{ 'cc-mem__catalog-row--selected': selected && file.relevant === true }"
              >
                <div class="cc-mem__row-top">
                  <div class="cc-mem__row-title">{{ file.title }}</div>
                  <span class="cc-mem__badge" :class="'cc-mem__badge--' + file.type">{{ file.type }}</span>
                </div>
                <div class="cc-mem__row-desc">{{ file.description }}</div>
                <div class="cc-mem__row-file">{{ file.filename }}</div>
              </div>
              <div v-if="!catalogVisible" class="cc-mem__empty">catalog has not been rebuilt yet</div>
            </div>
          </div>

          <div class="cc-mem__preview">
            <div class="cc-mem__preview-title">Memory file preview</div>
            <template v-if="currentStep >= 2">
              <div class="cc-mem__preview-list">
                <div class="cc-mem__detail" :class="{ 'cc-mem__detail--selected': selected }">
                  <div class="cc-mem__detail-head">
                    <div class="cc-mem__detail-meta">
                      <div class="cc-mem__detail-title">{{ selectedFile.title }}</div>
                      <div class="cc-mem__detail-file">{{ selectedFile.filename }}</div>
                    </div>
                    <span v-if="selected" class="cc-mem__selected-badge">
                      <PhCheckCircle :size="13" />
                      selected
                    </span>
                  </div>
                  <div class="cc-mem__detail-body">{{ selectedFile.body }}</div>
                </div>
                <div
                  v-for="file in MEMORY_FILES.slice(1)"
                  :key="file.id"
                  class="cc-mem__notloaded"
                >
                  <div class="cc-mem__row-top">
                    <div class="cc-mem__row-title">{{ file.title }}</div>
                    <span class="cc-mem__badge" :class="'cc-mem__badge--' + file.type">not loaded</span>
                  </div>
                  <div class="cc-mem__row-desc">{{ file.description }}</div>
                </div>
              </div>
            </template>
            <div v-else class="cc-mem__empty">no files on the shelf yet</div>
          </div>
        </div>
      </div>

      <div class="cc-mem__note">
        Beginner rule: the catalog stays cheap and readable; full memory files are borrowed only when the current request needs them.
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
.cc-viz--memory {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 500px;
}

.cc-viz__panel {
  padding: 16px;
}

// Phase tabs (learn / catalog / recall)
.cc-mem__phases {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.cc-mem__phase {
  padding: 8px 12px;
  border-radius: 8px;
  font-weight: 500;
  background: #f4f4f5;
  color: #71717a;
}

.cc-mem__phase--active {
  background: #ede9fe;
  color: #6d28d9;
}

[data-theme='dark'] .cc-mem__phase {
  background: #27272a;
  color: #a1a1aa;
}

[data-theme='dark'] .cc-mem__phase--active {
  background: rgba(76, 29, 149, 0.3);
  color: #ddd6fe;
}

// Two-session row
.cc-mem__row {
  display: grid;
  gap: 12px;
}

// Generic surface card
.cc-mem__surface {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #ffffff;
  transition: border-color 0.3s, background 0.3s;
}

[data-theme='dark'] .cc-mem__surface {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-mem__surface--violet {
  border-color: #c4b5fd;
  background: #f5f3ff;
}

[data-theme='dark'] .cc-mem__surface--violet {
  border-color: #5b21b6;
  background: rgba(76, 29, 149, 0.3);
}

.cc-mem__surface--mt {
  margin-top: 12px;
}

.cc-mem__surface-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-mem__surface-head {
  color: #f4f4f5;
}

.cc-mem__surface-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f4f4f5;
  color: #71717a;
  transition: background 0.3s, color 0.3s;
}

[data-theme='dark'] .cc-mem__surface-icon {
  background: #27272a;
  color: #d4d4d8;
}

.cc-mem__surface-icon--violet,
[data-theme='dark'] .cc-mem__surface-icon--violet {
  background: #8b5cf6;
  color: #ffffff;
}

.cc-mem__surface-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

// Quote card
.cc-mem__quote {
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  font-size: 18px;
  line-height: 1.625;
  color: #3f3f46;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__quote {
  border-color: #3f3f46;
  background: #18181b;
  color: #e4e4e7;
}

// Amber stamp card
.cc-mem__stamp {
  padding: 16px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  font-size: 14px;
  line-height: 1.625;
  color: #92400e;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__stamp {
  border-color: #78350f;
  background: rgba(120, 53, 15, 0.4);
  color: #fde68a;
}

.cc-mem__stamp-title {
  margin-bottom: 4px;
  font-size: 16px;
  font-weight: 600;
}

// Violet "catalog search selects" card
.cc-mem__pick {
  padding: 16px;
  border: 1px solid #c4b5fd;
  border-radius: 8px;
  background: #f5f3ff;
  font-size: 14px;
  color: #5b21b6;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__pick {
  border-color: #5b21b6;
  background: rgba(76, 29, 149, 0.4);
  color: #ddd6fe;
}

.cc-mem__mono {
  font-family: var(--font-mono);
}

// Reading stack panel
.cc-mem__stack {
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #ffffff;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__stack {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-mem__stack-title {
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-mem__stack-title {
  color: #f4f4f5;
}

.cc-mem__stack-list {
  display: grid;
  gap: 8px;
}

.cc-mem__stack-item {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  background: #f4f4f5;
  color: #3f3f46;
}

[data-theme='dark'] .cc-mem__stack-item {
  background: #27272a;
  color: #e4e4e7;
}

.cc-mem__stack-item--violet {
  background: #ede9fe;
  color: #6d28d9;
}

[data-theme='dark'] .cc-mem__stack-item--violet {
  background: rgba(76, 29, 149, 0.4);
  color: #ddd6fe;
}

.cc-mem__stack-item--emerald {
  background: #d1fae5;
  color: #065f46;
}

[data-theme='dark'] .cc-mem__stack-item--emerald {
  background: rgba(6, 78, 59, 0.4);
  color: #a7f3d0;
}

// Library grid (catalog | preview)
.cc-mem__library {
  display: grid;
  gap: 12px;
}

.cc-mem__catalog {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #fafafa;
}

[data-theme='dark'] .cc-mem__catalog {
  border-color: #3f3f46;
  background: rgba(39, 39, 42, 0.7);
}

.cc-mem__catalog-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #27272a;
}

[data-theme='dark'] .cc-mem__catalog-head {
  color: #f4f4f5;
}

.cc-mem__catalog-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-mem__catalog-row {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__catalog-row {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-mem__catalog-row--selected {
  border-color: #c4b5fd;
  background: #f5f3ff;
}

[data-theme='dark'] .cc-mem__catalog-row--selected {
  border-color: #5b21b6;
  background: rgba(76, 29, 149, 0.4);
}

.cc-mem__row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cc-mem__row-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
}

[data-theme='dark'] .cc-mem__row-title {
  color: #f4f4f5;
}

.cc-mem__row-desc {
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  color: #71717a;
}

[data-theme='dark'] .cc-mem__row-desc {
  color: #a1a1aa;
}

.cc-mem__row-file {
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #a1a1aa;
}

[data-theme='dark'] .cc-mem__row-file {
  color: #71717a;
}

// Type badge
.cc-mem__badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.cc-mem__badge--feedback {
  background: #fef3c7;
  color: #92400e;
}

[data-theme='dark'] .cc-mem__badge--feedback {
  background: rgba(120, 53, 15, 0.4);
  color: #fde68a;
}

.cc-mem__badge--project {
  background: #dbeafe;
  color: #1e40af;
}

[data-theme='dark'] .cc-mem__badge--project {
  background: rgba(30, 58, 138, 0.4);
  color: #bfdbfe;
}

.cc-mem__badge--reference {
  background: #d1fae5;
  color: #065f46;
}

[data-theme='dark'] .cc-mem__badge--reference {
  background: rgba(6, 78, 59, 0.4);
  color: #a7f3d0;
}

// Memory file detail
.cc-mem__detail {
  min-width: 0;
  padding: 16px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__detail {
  border-color: #3f3f46;
  background: #18181b;
}

.cc-mem__detail--selected {
  border-color: #c4b5fd;
  background: #f5f3ff;
}

[data-theme='dark'] .cc-mem__detail--selected {
  border-color: #5b21b6;
  background: rgba(76, 29, 149, 0.4);
}

.cc-mem__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cc-mem__detail-meta {
  min-width: 0;
}

.cc-mem__detail-title {
  overflow-wrap: break-word;
  font-size: 16px;
  font-weight: 700;
  color: #18181b;
}

[data-theme='dark'] .cc-mem__detail-title {
  color: #f4f4f5;
}

.cc-mem__detail-file {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
  color: #71717a;
}

[data-theme='dark'] .cc-mem__detail-file {
  color: #a1a1aa;
}

.cc-mem__selected-badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: #8b5cf6;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
}

.cc-mem__detail-body {
  padding: 12px;
  border-radius: 8px;
  background: #fafafa;
  font-size: 14px;
  line-height: 1.625;
  color: #3f3f46;
}

[data-theme='dark'] .cc-mem__detail-body {
  background: #27272a;
  color: #e4e4e7;
}

// "not loaded" rows
.cc-mem__notloaded {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #ffffff;
  animation: cc-mem-in 0.3s ease both;
}

[data-theme='dark'] .cc-mem__notloaded {
  border-color: #3f3f46;
  background: #18181b;
}

// Preview column
.cc-mem__preview {
  min-width: 0;
}

.cc-mem__preview-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #71717a;
}

[data-theme='dark'] .cc-mem__preview-title {
  color: #a1a1aa;
}

.cc-mem__preview-list {
  display: grid;
  gap: 12px;
}

// Empty state
.cc-mem__empty {
  padding: 32px 16px;
  border: 1px dashed #d4d4d8;
  border-radius: 8px;
  text-align: center;
  font-size: 14px;
  color: #71717a;
}

[data-theme='dark'] .cc-mem__empty {
  border-color: #3f3f46;
  color: #a1a1aa;
}

// Beginner note
.cc-mem__note {
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
  font-size: 14px;
  line-height: 1.625;
  color: #52525b;
}

[data-theme='dark'] .cc-mem__note {
  border-color: #3f3f46;
  background: #27272a;
  color: #d4d4d8;
}

@keyframes cc-mem-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 640px) {
  .cc-mem__phases {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1200px) {
  .cc-mem__row {
    grid-template-columns: repeat(2, 1fr);
  }

  .cc-mem__library {
    grid-template-columns: 320px minmax(0, 1fr);
  }
}
</style>
