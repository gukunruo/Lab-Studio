import type { ImageAspectRatio, ImageDraftFacets } from './types'

export const COMPOSER_INPUT_MAX_HEIGHT = 160
export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = ['1:1', '16:9', '9:16']

export function nextTextareaHeight(scrollHeight: number): number {
  return Math.min(scrollHeight, COMPOSER_INPUT_MAX_HEIGHT)
}

export function composerSubmitMatches(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode'>,
): boolean {
  return event.key === 'Enter'
    && !event.shiftKey
    && !event.isComposing
    && event.keyCode !== 229
}

// 要素 → 最终 prompt 的确定性拼装。与 server/image-prompt-drafter.ts 的
// collapseDraftToPrompt 镜像，两侧各有一组对齐单测，避免两份漂移。
export const COLLAPSE_DRAFT_LABELS: Array<[keyof ImageDraftFacets, string]> = [
  ['subject', '主题'],
  ['style', '风格'],
  ['composition', '构图'],
  ['details', '细节'],
  ['negative', '避免'],
]

export function collapseDraftToPrompt(facets: ImageDraftFacets): string {
  return COLLAPSE_DRAFT_LABELS
    .map(([key, label]) => {
      const value = facets[key]?.trim()
      return value ? `${label}：${value}` : ''
    })
    .filter(Boolean)
    .join('\n')
}
