<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ImageDraftFacets, ImageDraftMessage } from '../types'
import { collapseDraftToPrompt } from '../composer'
import {
  NEGATIVE_PRESETS,
  STYLE_PRESETS,
  activeStylePresetId,
  applyStylePreset,
  clearStylePreset,
  enhancePrompt,
  isNegativeActive,
  toggleNegative,
} from '../image-styles'
import type { NegativePreset } from '../image-styles'
import { PhArrowsClockwise, PhCheck, PhChatCircleDots, PhEye, PhMagicWand, PhPlus, PhSparkle, PhWarning } from '@phosphor-icons/vue'

const props = defineProps<{
  message: ImageDraftMessage
}>()

const emit = defineEmits<{
  confirm: [prompt: string]
  refine: []
  enrich: [text: string]
  abort: []
}>()

const FACET_FIELDS: Array<{ key: keyof ImageDraftFacets; label: string; hint: string }> = [
  { key: 'subject', label: '主题', hint: '画面核心主体' },
  { key: 'style', label: '风格', hint: '扁平 / 3D / 拟物 / 插画 / 摄影 / 极简' },
  { key: 'composition', label: '构图', hint: '主体位置、视角、画面比例' },
  { key: 'details', label: '细节', hint: '材质、光影、配色、装饰元素' },
  { key: 'negative', label: '避免', hint: '明确要避免的元素' },
]

// 增减细节：一键向对应要素追加 / 移除一段短语。
const DETAIL_CHIPS: Array<{ key: keyof ImageDraftFacets; label: string; text: string }> = [
  { key: 'details', label: '加光影', text: '细腻光影' },
  { key: 'details', label: '加材质', text: '丰富材质质感' },
  { key: 'details', label: '强化主体', text: '主体醒目突出' },
  { key: 'negative', label: '去杂乱', text: '杂乱背景' },
]

const facets = ref<ImageDraftFacets>({ ...props.message.facets })
const enrichOpen = ref(false)
const enrichDraft = ref('')
const enrichBusy = ref(false)
const qualityBoost = ref(true)
const previewOpen = ref(false)

const prompt = computed(() => {
  const base = collapseDraftToPrompt(facets.value)
  return qualityBoost.value ? enhancePrompt(base) : base
})
const activeStyle = computed(() => activeStylePresetId(facets.value))
const facetCount = computed(() => FACET_FIELDS.filter((field) => facets.value[field.key]?.trim()).length)
const isDrafting = computed(() => props.message.status === 'drafting')
const isError = computed(() => props.message.status === 'error')

function toggleStyle(presetId: string) {
  facets.value = activeStyle.value === presetId
    ? clearStylePreset(facets.value)
    : applyStylePreset(facets.value, presetId)
}

function toggleNegativePreset(preset: NegativePreset) {
  facets.value = toggleNegative(facets.value, preset)
}

// 服务端更新要素（如重新润色）时，采纳新卡；本地编辑不触发重渲染。
watch(() => props.message, (message) => {
  facets.value = { ...message.facets }
  if (message.status === 'ready') enrichBusy.value = false
})
onMounted(() => { facets.value = { ...props.message.facets } })

function toggleChip(key: keyof ImageDraftFacets, text: string) {
  const current = facets.value[key].trim()
  if (current.includes(text)) {
    facets.value[key] = current
      .replace(text, '')
      .replace(/^[，,、\s]+|[，,、\s]+$/g, '')
      .replace(/[，,、]\s*[，,、]/g, '，')
      .trim()
  } else {
    facets.value[key] = current ? `${current}，${text}` : text
  }
}

function isChipActive(key: keyof ImageDraftFacets, text: string): boolean {
  return facets.value[key].includes(text)
}

function submitEnrich() {
  const text = enrichDraft.value.trim()
  if (!text || enrichBusy.value) return
  enrichBusy.value = true
  emit('enrich', text)
  enrichDraft.value = ''
}
</script>

<template>
  <div class="draft">
    <div v-if="isDrafting" class="draft__loading" aria-live="polite">
      <span class="draft__loading-dots" aria-hidden="true"><span /><span /><span /></span>
      <span class="draft__loading-text">AI 正在起草提示词卡…</span>
    </div>

    <template v-else-if="isError">
      <div class="draft__error" role="alert">
        <PhWarning :size="15" weight="fill" />
        <span>{{ message.errorMessage ?? '提示词起草失败，请重试。' }}</span>
        <button class="draft__action draft__action--ghost" type="button" @click="emit('refine')">重新起草</button>
      </div>
    </template>

    <template v-else>
      <div class="draft__head">
        <span class="draft__head-icon"><PhSparkle :size="15" weight="fill" /></span>
        <div class="draft__head-title">
          <strong>提示词卡</strong>
          <span>确认或润色后生成图片</span>
        </div>
        <span class="draft__head-ratio">{{ facetCount }} 条要素</span>
      </div>

      <div class="draft__facets">
        <label v-for="field in FACET_FIELDS" :key="field.key" class="draft__facet">
          <span class="draft__facet-label">
            {{ field.label }}
            <small>{{ field.hint }}</small>
          </span>
          <textarea
            v-model="facets[field.key]"
            class="draft__facet-input"
            :aria-label="`${field.label}，${field.hint}`"
            rows="1"
            :placeholder="`在这里编辑${field.label}…`"
          />
        </label>
      </div>

      <div class="draft__presets">
        <div class="draft__preset-group">
          <span class="draft__preset-label">风格预设</span>
          <div class="draft__preset-chips">
            <button
              v-for="preset in STYLE_PRESETS"
              :key="preset.id"
              class="draft__preset-chip"
              :class="{ 'draft__preset-chip--active': activeStyle === preset.id }"
              type="button"
              @click="toggleStyle(preset.id)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <div class="draft__preset-group">
          <span class="draft__preset-label">避免</span>
          <div class="draft__preset-chips">
            <button
              v-for="preset in NEGATIVE_PRESETS"
              :key="preset.id"
              class="draft__preset-chip"
              :class="{ 'draft__preset-chip--active': isNegativeActive(facets, preset) }"
              type="button"
              @click="toggleNegativePreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="draft__quality">
        <button
          class="draft__quality-toggle"
          :class="{ 'draft__quality-toggle--active': qualityBoost }"
          type="button"
          :aria-pressed="qualityBoost"
          @click="qualityBoost = !qualityBoost"
        >
          <PhMagicWand :size="13" weight="bold" />
          画质增强
          <span class="draft__quality-hint">自动追加专业画质词</span>
        </button>
      </div>

      <div class="draft__preview">
        <button
          class="draft__preview-toggle"
          type="button"
          :aria-expanded="previewOpen"
          @click="previewOpen = !previewOpen"
        >
          <PhEye :size="13" weight="bold" />
          {{ previewOpen ? '收起提示词' : '预览提示词' }}
        </button>
        <pre v-if="previewOpen" class="draft__preview-body">{{ prompt }}</pre>
      </div>

      <div class="draft__chips" aria-label="增减细节">
        <button
          v-for="chip in DETAIL_CHIPS"
          :key="chip.label"
          class="draft__chip"
          :class="{ 'draft__chip--active': isChipActive(chip.key, chip.text) }"
          type="button"
          @click="toggleChip(chip.key, chip.text)"
        >
          <PhPlus :size="12" weight="bold" />
          {{ chip.label }}
        </button>
        <button class="draft__chip draft__chip--enrich" type="button" :aria-expanded="enrichOpen" @click="enrichOpen = !enrichOpen">
          <PhChatCircleDots :size="12" weight="bold" />
          AI 追问补细节
        </button>
        <div v-if="enrichOpen" class="draft__enrich">
          <textarea
            v-model="enrichDraft"
            class="draft__enrich-input"
            :rows="1"
            placeholder="补一句，如：做成深蓝色背景"
            @keydown.enter.exact.prevent="submitEnrich"
          />
          <button class="draft__enrich-send" type="button" :disabled="!enrichDraft.trim() || enrichBusy" @click="submitEnrich">
            {{ enrichBusy ? '补入中…' : '补入' }}
          </button>
        </div>
      </div>

      <div class="draft__actions">
        <button class="draft__action draft__action--ghost" type="button" @click="emit('refine')">
          <PhArrowsClockwise :size="13" weight="regular" /> 重新润色
        </button>
        <button class="draft__action draft__action--primary" type="button" @click="emit('confirm', prompt)">
          <PhCheck :size="13" weight="bold" /> 确认生成
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.draft {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 14px;
}

.draft__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.draft__loading-dots {
  display: flex;
  align-items: center;
  gap: 4px;
}

.draft__loading-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: draft-dot 1.2s ease-in-out infinite;
}

.draft__loading-dots span:nth-child(2) { animation-delay: 0.15s; }
.draft__loading-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes draft-dot {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

.draft__error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text);
  font-size: 13px;
}

.draft__error > span { flex: 1; }

.draft__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.draft__head-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.draft__head-title {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.draft__head-title strong {
  color: var(--color-text);
  font-size: 13px;
}

.draft__head-title span {
  color: var(--color-text-muted);
  font-size: 11px;
}

.draft__head-ratio {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.draft__facets {
  display: grid;
  gap: 10px;
}

.draft__facet {
  display: grid;
  gap: 4px;
}

.draft__facet-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
}

.draft__facet-label small {
  color: var(--color-text-muted);
  font-size: 10.5px;
  font-weight: 400;
}

.draft__facet-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 7px 9px;
  resize: vertical;
  min-height: 34px;
  outline: none;
}

.draft__facet-input:focus {
  border-color: var(--color-accent);
}

.draft__presets {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.draft__preset-group {
  display: grid;
  gap: 5px;
}

.draft__preset-label {
  color: var(--color-text-muted);
  font-size: 11px;
}

.draft__preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.draft__preset-chip {
  height: 25px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition: all 0.15s;
}

.draft__preset-chip:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }

.draft__preset-chip--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.draft__quality {
  display: flex;
  margin-top: 12px;
}

.draft__quality-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition: all 0.15s;
}

.draft__quality-toggle:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }

.draft__quality-toggle--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.draft__quality-hint {
  color: var(--color-text-muted);
  font-size: 10px;
}

.draft__preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.draft__preview-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  height: 28px;
  padding: 0 10px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition: all 0.15s;
}

.draft__preview-toggle:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }

.draft__preview-body {
  box-sizing: border-box;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.draft__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
}

.draft__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  transition: all 0.15s;
}

.draft__chip:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }

.draft__chip--active {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.draft__chip--enrich {
  color: var(--color-accent-strong);
  border-style: dashed;
}

.draft__enrich {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
}

.draft__enrich-input {
  flex: 1;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 6px 9px;
  min-height: 34px;
  resize: none;
  outline: none;
}

.draft__enrich-input:focus { border-color: var(--color-accent); }

.draft__enrich-send {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.draft__enrich-send:disabled { opacity: 0.45; cursor: not-allowed; }

.draft__actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.draft__action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition: all 0.15s;
}

.draft__action--ghost {
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.draft__action--ghost:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }

.draft__action--primary {
  background: var(--color-accent);
  color: #fff;
}

.draft__action--primary:hover { background: var(--color-accent-strong); }
</style>
