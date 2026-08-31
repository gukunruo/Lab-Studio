import type { ChatMessage, ImageAspectRatio, ImageDraftFacets } from './types'

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

// 确认提示词卡时，按它底层的愿望消息走 GPT 出图或 Gemini 创作链路。
// 返回 'gemini' 表示走完成链路，'gpt-image' 表示出图链路，非 draft 则返回 null。
export function imageDraftConfirmFlow(messages: ChatMessage[], index: number): 'gemini' | 'gpt-image' | null {
  const draft = messages[index]
  if (!draft || draft.type !== 'image-draft') return null
  const precursor = messages.find((message) => 'requestId' in message && message.requestId === draft.requestId)
  if (precursor?.type === 'gemini-multimodal-user') return 'gemini'
  if (precursor?.type === 'image-request') return 'gpt-image'
  return null
}
