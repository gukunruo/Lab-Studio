<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowClockwise, PhDownloadSimple, PhImage, PhSpinnerGap, PhStop, PhXCircle } from '@phosphor-icons/vue'
import type { ImageRequestMessage, ImageResultMessage } from '../types'
import { isSafeImageUrl } from '../api'

const props = defineProps<{
  message: ImageRequestMessage | ImageResultMessage
}>()

const emit = defineEmits<{
  retry: []
  edit: []
  abort: []
}>()

const isRequest = computed(() => props.message.type === 'image-request')
const resultMessage = computed(() => props.message.type === 'image-result' ? props.message : null)
const isGenerating = computed(() => resultMessage.value?.status === 'generating')
const isFailed = computed(() => resultMessage.value?.status === 'error')
const isCancelled = computed(() => resultMessage.value?.status === 'cancelled')
const imageUrl = computed(() => {
  const value = resultMessage.value?.imageUrl
  return isSafeImageUrl(value) ? value : null
})
</script>

<template>
  <section class="image-card" :class="{ 'image-card--request': isRequest }">
    <template v-if="isRequest">
      <div class="image-card__request-heading"><PhImage :size="16" weight="fill" /> 图片描述</div>
      <p class="image-card__prompt">{{ message.prompt }}</p>
      <div class="image-card__meta">
        <span>{{ message.modelId === 'gpt-image-2' ? 'GPT-Image-2' : 'Gemini 3 Pro Image' }}</span>
      </div>
    </template>
    <template v-else>
      <div v-if="isGenerating" class="image-card__status image-card__status--generating" aria-live="polite">
        <PhSpinnerGap :size="18" weight="bold" />
        <div><strong>正在生成图片</strong><span>{{ message.modelId === 'gpt-image-2' ? 'GPT-Image-2' : 'Gemini 3 Pro Image' }}</span></div>
        <button class="image-card__secondary-action" type="button" @click="emit('abort')"><PhStop :size="13" weight="fill" /> 停止</button>
      </div>
      <div v-else-if="isFailed" class="image-card__status image-card__status--error" role="alert">
        <PhXCircle :size="18" weight="fill" />
        <div><strong>图片生成失败</strong><span>{{ resultMessage?.errorMessage ?? '请稍后重试。' }}</span></div>
        <div class="image-card__actions">
          <button class="image-card__secondary-action" type="button" @click="emit('edit')">返回编辑</button>
          <button class="image-card__secondary-action" type="button" @click="emit('retry')"><PhArrowClockwise :size="14" weight="bold" /> 重试</button>
        </div>
      </div>
      <div v-else-if="isCancelled" class="image-card__status">
        <PhStop :size="16" weight="fill" />
        <div><strong>已停止生成图片</strong><span>可以修改描述后再次生成。</span></div>
        <div class="image-card__actions">
          <button class="image-card__secondary-action" type="button" @click="emit('edit')">返回编辑</button>
          <button class="image-card__secondary-action" type="button" @click="emit('retry')"><PhArrowClockwise :size="14" weight="bold" /> 再试一次</button>
        </div>
      </div>
      <template v-else-if="imageUrl">
        <img class="image-card__image" :src="imageUrl" :alt="message.prompt" loading="lazy" />
        <div class="image-card__footer">
          <div><strong>图片已生成</strong><span>{{ message.modelId === 'gpt-image-2' ? 'GPT-Image-2' : 'Gemini 3 Pro Image' }}</span></div>
          <a class="image-card__download" :href="imageUrl" target="_blank" rel="noreferrer" download><PhDownloadSimple :size="15" weight="bold" /> 下载</a>
        </div>
      </template>
      <div v-else class="image-card__status image-card__status--error" role="alert">
        <PhXCircle :size="18" weight="fill" />
        <div><strong>图片结果不可用</strong><span>请重新生成。</span></div>
        <button class="image-card__secondary-action" type="button" @click="emit('retry')"><PhArrowClockwise :size="14" weight="bold" /> 重试</button>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.image-card {
  width: min(100%, 560px);
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.image-card--request {
  min-width: 240px;
  padding: 12px 14px;
  background: var(--color-accent-soft);
}

.image-card__request-heading,
.image-card__meta,
.image-card__footer,
.image-card__status {
  display: flex;
  align-items: center;
}

.image-card__request-heading {
  gap: 6px;
  color: var(--color-accent-strong);
  font-size: 12px;
  font-weight: 600;
}

.image-card__prompt {
  margin: 8px 0 10px;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.image-card__meta,
.image-card__footer span,
.image-card__status span {
  color: var(--color-text-muted);
  font-size: 11px;
}

.image-card__image {
  display: block;
  width: 100%;
  max-height: 620px;
  object-fit: contain;
  background: var(--color-surface-2);
}

.image-card__footer {
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}

.image-card__footer div,
.image-card__status div {
  display: grid;
  gap: 2px;
}

.image-card__footer strong,
.image-card__status strong {
  color: var(--color-text);
  font-size: 12px;
}

.image-card__download,
.image-card__secondary-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font: 600 11px var(--font-sans);
  padding: 6px 8px;
  text-decoration: none;
}

.image-card__download:hover,
.image-card__secondary-action:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.image-card__status {
  gap: 10px;
  min-height: 68px;
  padding: 12px;
}

.image-card__status--generating > svg {
  color: var(--color-accent);
  animation: image-card-spin 1s linear infinite;
}

.image-card__status--error {
  border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface));
}

.image-card__status--error > svg { color: var(--color-danger); }

.image-card__actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

@keyframes image-card-spin { to { transform: rotate(360deg); } }
</style>
