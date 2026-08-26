<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowClockwise, PhDownloadSimple, PhImage, PhSpinnerGap, PhStop, PhXCircle } from '@phosphor-icons/vue'
import type { GeminiMultimodalAssistantMessage } from '../types'
import { controlledImageAssetId, isSafeImageUrl } from '../api'
import { renderMarkdown } from '../message-markdown'

const props = defineProps<{
  message: GeminiMultimodalAssistantMessage
}>()

const emit = defineEmits<{
  retry: []
  edit: []
  abort: []
  'use-as-reference': []
}>()

const imageUrl = computed(() => isSafeImageUrl(props.message.imageUrl) ? props.message.imageUrl : null)
const hasReferenceImage = computed(() => Boolean(controlledImageAssetId(imageUrl.value)))
const hasContent = computed(() => Boolean(props.message.content.trim()))
const renderedContent = computed(() => hasContent.value ? renderMarkdown(props.message.content) : '')
</script>

<template>
  <section class="gemini-card">
    <div v-if="message.status === 'generating'" class="gemini-card__status gemini-card__status--generating" aria-live="polite">
      <PhSpinnerGap :size="18" weight="bold" />
      <div><strong>Gemini 正在创作</strong><span>可生成文字、图片或两者</span></div>
      <button class="gemini-card__secondary-action" type="button" @click="emit('abort')"><PhStop :size="13" weight="fill" /> 停止</button>
    </div>
    <div v-else-if="message.status === 'error'" class="gemini-card__status gemini-card__status--error" role="alert">
      <PhXCircle :size="18" weight="fill" />
      <div><strong>图片创作失败</strong><span>{{ message.errorMessage ?? '请稍后重试。' }}</span></div>
      <div class="gemini-card__actions">
        <button class="gemini-card__secondary-action" type="button" @click="emit('edit')">返回编辑</button>
        <button class="gemini-card__secondary-action" type="button" @click="emit('retry')"><PhArrowClockwise :size="14" weight="bold" /> 重试</button>
      </div>
    </div>
    <div v-else-if="message.status === 'cancelled'" class="gemini-card__status">
      <PhStop :size="16" weight="fill" />
      <div><strong>已停止创作</strong><span>可以修改描述后再次发送。</span></div>
      <div class="gemini-card__actions">
        <button class="gemini-card__secondary-action" type="button" @click="emit('edit')">返回编辑</button>
        <button class="gemini-card__secondary-action" type="button" @click="emit('retry')"><PhArrowClockwise :size="14" weight="bold" /> 再试一次</button>
      </div>
    </div>
    <template v-else>
      <div v-if="hasContent" class="gemini-card__markdown" v-html="renderedContent" />
      <img v-if="imageUrl" class="gemini-card__image" :src="imageUrl" alt="Gemini 创作结果" loading="lazy" />
      <div v-if="imageUrl" class="gemini-card__footer">
        <div><strong>Gemini 创作完成</strong><span>Gemini 3 Pro Image</span></div>
        <div class="gemini-card__actions">
          <button v-if="hasReferenceImage" class="gemini-card__secondary-action" type="button" @click="emit('use-as-reference')"><PhImage :size="14" weight="bold" /> 基于此图继续</button>
          <a class="gemini-card__download" :href="imageUrl" target="_blank" rel="noreferrer" download><PhDownloadSimple :size="15" weight="bold" /> 下载</a>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.gemini-card { width: min(100%, 560px); overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); }
.gemini-card__markdown { padding: 14px; color: var(--color-text-muted); font-size: 14px; line-height: 1.7; word-break: break-word; }
.gemini-card__markdown :deep(p) { margin: 0 0 .8em; }
.gemini-card__markdown :deep(p:last-child) { margin-bottom: 0; }
.gemini-card__markdown :deep(a) { color: var(--color-accent-strong); text-decoration: underline; text-underline-offset: 2px; }
.gemini-card__markdown :deep(code) { padding: .12em .35em; border: 1px solid var(--color-border); border-radius: 5px; background: var(--color-surface-2); color: var(--color-accent-strong); font-family: var(--font-mono); font-size: .88em; }
.gemini-card__markdown :deep(pre) { margin: .8em 0; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-2); padding: 12px 14px; }
.gemini-card__image { display: block; width: 100%; max-height: 620px; object-fit: contain; background: var(--color-surface-2); }
.gemini-card__footer, .gemini-card__status { display: flex; align-items: center; }
.gemini-card__footer { justify-content: space-between; gap: 12px; padding: 10px 12px; }
.gemini-card__footer div, .gemini-card__status div { display: grid; gap: 2px; }
.gemini-card__footer strong, .gemini-card__status strong { color: var(--color-text); font-size: 12px; }
.gemini-card__footer span, .gemini-card__status span { color: var(--color-text-muted); font-size: 11px; }
.gemini-card__download, .gemini-card__secondary-action { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: 600 11px var(--font-sans); padding: 6px 8px; text-decoration: none; }
.gemini-card__download:hover, .gemini-card__secondary-action:hover { border-color: var(--color-accent); color: var(--color-accent-strong); }
.gemini-card__status { gap: 10px; min-height: 68px; padding: 12px; }
.gemini-card__status--generating > svg { color: var(--color-accent); animation: gemini-card-spin 1s linear infinite; }
.gemini-card__status--error { border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border)); background: color-mix(in srgb, var(--color-danger) 7%, var(--color-surface)); }
.gemini-card__status--error > svg { color: var(--color-danger); }
.gemini-card__actions { display: flex !important; gap: 6px; margin-left: auto; }
@keyframes gemini-card-spin { to { transform: rotate(360deg); } }
</style>
