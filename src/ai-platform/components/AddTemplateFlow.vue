<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PhArrowClockwise, PhCheck, PhImage, PhSpinnerGap, PhSquaresFour, PhX } from '@phosphor-icons/vue'
import type { ImageAspectRatio, ImageModelId } from '../types'
import { createImageTemplate, generateGeminiMultimodal, generateImage, summarizeImageTemplate } from '../api'

const props = defineProps<{
  imageAssetId: string
  imageUrl: string
  prompt: string
  modelId: ImageModelId
  aspectRatio?: ImageAspectRatio
  style?: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const loading = ref(true)
const saving = ref(false)
const degraded = ref(false)
const errorMessage = ref('')
const name = ref('')
const prompt = ref(props.prompt)

const sourceImage = computed(() => props.imageUrl)

const testLoading = ref(false)
const testImageUrl = ref('')
const testError = ref('')
const lastTestedPrompt = ref('')
let testAbort: AbortController | null = null

const isStale = computed(() => Boolean(testImageUrl.value) && prompt.value.trim() !== lastTestedPrompt.value)

function fallbackName(value: string): string {
  const first = value.split(/[\n。，,]/)[0]?.trim() ?? ''
  const cleaned = first.replace(/[^\p{L}\p{N}·\s]/gu, '').trim()
  if (!cleaned) return '新模板'
  return cleaned.length > 12 ? cleaned.slice(0, 12) : cleaned
}

async function loadSummary() {
  loading.value = true
  errorMessage.value = ''
  try {
    const summary = await summarizeImageTemplate({
      imageAssetId: props.imageAssetId,
      prompt: props.prompt,
      ...(props.aspectRatio ? { aspectRatio: props.aspectRatio } : {}),
      ...(props.style ? { style: props.style } : {}),
    })
    name.value = summary.name
    prompt.value = summary.prompt
    degraded.value = summary.degraded === true
  } catch (error) {
    // 归纳失败不阻塞：退回原描述，用户仍可手动编辑后入库。
    name.value = fallbackName(props.prompt)
    prompt.value = props.prompt
    degraded.value = true
    errorMessage.value = error instanceof Error ? error.message : '模板归纳失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function startTest() {
  const testPrompt = prompt.value.trim()
  if (!testPrompt) return
  testLoading.value = true
  testError.value = ''
  testImageUrl.value = ''
  testAbort?.abort()
  testAbort = new AbortController()
  const signal = testAbort.signal
  try {
    if (props.modelId === 'gpt-image-2') {
      const result = await generateImage({
        modelId: 'gpt-image-2',
        prompt: testPrompt,
        ...(props.aspectRatio ? { aspectRatio: props.aspectRatio } : {}),
        signal,
      })
      testImageUrl.value = result.imageUrl
    } else {
      const result = await generateGeminiMultimodal({
        prompt: testPrompt,
        ...(props.aspectRatio ? { aspectRatio: props.aspectRatio } : {}),
        signal,
      })
      if (result.imageUrl) {
        testImageUrl.value = result.imageUrl
      } else {
        testError.value = result.content || '测试图生成失败，请稍后重试。'
      }
    }
    lastTestedPrompt.value = testPrompt
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    testError.value = error instanceof Error ? error.message : '测试图生成失败，请稍后重试。'
  } finally {
    testLoading.value = false
  }
}

onBeforeUnmount(() => testAbort?.abort())

onMounted(async () => {
  await loadSummary()
  startTest()
})

async function save() {
  const trimmedName = name.value.trim()
  const trimmedPrompt = prompt.value.trim()
  if (!trimmedName || !trimmedPrompt) {
    errorMessage.value = '模板名称与描述不能为空。'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    await createImageTemplate({
      name: trimmedName,
      prompt: trimmedPrompt,
      ...(props.aspectRatio ? { aspectRatio: props.aspectRatio } : {}),
      ...(props.style ? { style: props.style } : {}),
    })
    emit('saved')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模板保存失败，请稍后重试。'
  } finally {
    saving.value = false
  }
}

onMounted(loadSummary)
</script>

<template>
  <div class="add-template__backdrop" @click.self="emit('close')">
    <section class="add-template__dialog" role="dialog" aria-modal="true" aria-labelledby="add-template-title">
      <header class="add-template__heading">
        <div class="add-template__icon" aria-hidden="true"><PhSquaresFour :size="20" weight="fill" /></div>
        <h2 id="add-template-title">把这张图添为模板</h2>
        <button class="add-template__close" type="button" aria-label="关闭" @click="emit('close')"><PhX :size="18" /></button>
      </header>

      <div class="add-template__body">
        <figure class="add-template__preview">
          <template v-if="testImageUrl">
            <img :src="testImageUrl" :alt="lastTestedPrompt" />
            <figcaption class="add-template__preview-badge">测试图</figcaption>
          </template>
          <div v-else-if="testLoading" class="add-template__preview-loading" aria-live="polite">
            <PhSpinnerGap :size="22" weight="bold" />
            <span>正在生成测试图…</span>
          </div>
          <template v-else-if="sourceImage">
            <img :src="sourceImage" :alt="props.prompt" />
            <figcaption class="add-template__preview-badge">原图</figcaption>
          </template>
          <div v-else class="add-template__preview-empty"><PhImage :size="26" /></div>
        </figure>

        <div class="add-template__form">
          <div v-if="loading" class="add-template__loading" aria-live="polite">
            <PhSpinnerGap :size="18" weight="bold" />
            <span>正在归纳模板描述…</span>
          </div>
          <template v-else>
            <p v-if="degraded" class="add-template__hint">
              AI 未可用，已使用原始描述，可以手动修改后再保存。
            </p>
            <label class="add-template__field">
              <span>模板名称</span>
              <input v-model="name" type="text" maxlength="20" placeholder="给这个模板起个名字" />
            </label>
            <label class="add-template__field">
              <span>模板描述</span>
              <textarea v-model="prompt" rows="4" maxlength="2000" placeholder="这张图的可复用生成描述"></textarea>
            </label>
            <div class="add-template__test">
              <button class="add-template__test-button" type="button" :disabled="testLoading || !prompt.trim()" @click="startTest">
                <template v-if="testLoading"><PhSpinnerGap :size="13" weight="bold" /> 生成中</template>
                <template v-else><PhArrowClockwise :size="13" weight="bold" /> 重新测试</template>
              </button>
              <span class="add-template__test-hint">按当前描述自动出图，确认效果后再入库。</span>
            </div>
            <p v-if="isStale" class="add-template__hint">描述已修改，请点击「重新测试」验证最新效果。</p>
            <p v-if="testError" class="add-template__error" role="alert">{{ testError }}</p>
            <p v-if="errorMessage" class="add-template__error" role="alert">{{ errorMessage }}</p>
          </template>
        </div>
      </div>

      <footer class="add-template__actions">
        <button class="add-template__button add-template__button--cancel" type="button" :disabled="saving" @click="emit('close')">取消</button>
        <button class="add-template__button add-template__button--confirm" type="button" :disabled="loading || saving" @click="save">
          <template v-if="saving"><PhSpinnerGap :size="14" weight="bold" /> 保存中</template>
          <template v-else><PhCheck :size="14" weight="bold" /> 保存为模板</template>
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.add-template__backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--color-bg);
}

.add-template__dialog {
  width: min(100%, 560px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18);
}

.add-template__heading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 0;
}

.add-template__icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-2));
  color: var(--color-accent-strong);
}

.add-template__heading h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
}

.add-template__close {
  margin-left: auto;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.add-template__close:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.add-template__body {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 16px;
  padding: 16px 20px;
}

.add-template__preview {
  position: relative;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}

.add-template__preview img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: 260px;
  object-fit: contain;
}

.add-template__preview-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}

.add-template__preview-loading {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.add-template__preview-loading > svg {
  color: var(--color-accent);
  animation: add-template-spin 1s linear infinite;
}

.add-template__preview-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: var(--color-text-muted);
}

.add-template__form {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.add-template__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 180px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.add-template__loading > svg {
  color: var(--color-accent);
  animation: add-template-spin 1s linear infinite;
}

.add-template__hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface-2));
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.add-template__field {
  display: grid;
  gap: 5px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
}

.add-template__field input,
.add-template__field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  font: 500 13px var(--font-sans);
  line-height: 1.5;
  padding: 8px 10px;
  resize: vertical;
}

.add-template__field input:focus,
.add-template__field textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 16%, transparent);
}

.add-template__test {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-template__test-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
  font: 600 12px var(--font-sans);
  padding: 6px 10px;
}

.add-template__test-button:hover:enabled {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.add-template__test-button:disabled {
  opacity: 0.55;
  cursor: default;
}

.add-template__test-button > svg {
  color: var(--color-accent);
}

.add-template__test-button:disabled > svg {
  animation: add-template-spin 1s linear infinite;
}

.add-template__test-hint {
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.add-template__error {
  margin: 0;
  color: var(--color-danger);
  font-size: 12px;
}

.add-template__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 20px 18px;
}

.add-template__button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  color: var(--color-text);
  cursor: pointer;
  font: 600 13px var(--font-sans);
  padding: 8px 14px;
}

.add-template__button--confirm {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.add-template__button--confirm:hover {
  filter: brightness(1.05);
}

.add-template__button--confirm:disabled,
.add-template__button--cancel:disabled {
  opacity: 0.55;
  cursor: default;
}

.add-template__button--confirm:disabled:hover {
  filter: none;
}

@keyframes add-template-spin { to { transform: rotate(360deg); } }
</style>
