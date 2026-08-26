import type { ImageAspectRatio } from './types'

export const COMPOSER_INPUT_MAX_HEIGHT = 160
export const IMAGE_ASPECT_RATIOS: ImageAspectRatio[] = ['1:1', '16:9', '9:16']

export function nextTextareaHeight(scrollHeight: number): number {
  return Math.min(scrollHeight, COMPOSER_INPUT_MAX_HEIGHT)
}

export function composerSubmitMatches(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean {
  return event.key === 'Enter' && !event.shiftKey
}
