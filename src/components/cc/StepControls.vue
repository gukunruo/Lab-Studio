<script setup lang="ts">
import { PhPlay, PhPause, PhSkipBack, PhSkipForward, PhArrowCounterClockwise } from '@phosphor-icons/vue'

defineProps<{
  currentStep: number
  totalSteps: number
  isPlaying: boolean
  stepTitle: string
  stepDescription: string
}>()

const emit = defineEmits<{
  prev: []
  next: []
  reset: []
  toggle: []
}>()
</script>

<template>
  <div class="cc-step__wrap">
    <div class="cc-step__note">
      <div class="cc-step__note-title">{{ stepTitle }}</div>
      <div class="cc-step__note-desc">{{ stepDescription }}</div>
    </div>

    <div class="cc-step__bar">
      <div class="cc-step__btns">
        <button
          type="button"
          class="cc-step__btn"
          title="重置"
          @click="emit('reset')"
        >
          <PhArrowCounterClockwise :size="16" />
        </button>
        <button
          type="button"
          class="cc-step__btn"
          :class="{ 'cc-step__btn--disabled': currentStep === 0 }"
          :disabled="currentStep === 0"
          title="上一步"
          @click="emit('prev')"
        >
          <PhSkipBack :size="16" />
        </button>
        <button
          type="button"
          class="cc-step__btn"
          title="播放 / 暂停"
          @click="emit('toggle')"
        >
          <PhPause v-if="isPlaying" :size="16" />
          <PhPlay v-else :size="16" />
        </button>
        <button
          type="button"
          class="cc-step__btn"
          :class="{ 'cc-step__btn--disabled': currentStep === totalSteps - 1 }"
          :disabled="currentStep === totalSteps - 1"
          title="下一步"
          @click="emit('next')"
        >
          <PhSkipForward :size="16" />
        </button>
      </div>

      <div class="cc-step__indicator">
        <div class="cc-step__dots">
          <span
            v-for="i in totalSteps"
            :key="i"
            class="cc-step__dot"
            :class="{
              'cc-step__dot--active': i - 1 === currentStep,
              'cc-step__dot--past': i - 1 < currentStep,
            }"
          />
        </div>
        <span class="cc-step__count">{{ currentStep + 1 }}/{{ totalSteps }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cc-step__wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cc-step__note {
  padding: 12px 16px;
  border: 1px solid var(--color-accent-soft);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
}

.cc-step__note-title {
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-accent-strong);
}

.cc-step__note-desc {
  font-size: 14px;
  color: var(--color-text);
}

.cc-step__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cc-step__btns {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cc-step__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.cc-step__btn:hover {
  background: var(--color-surface-2);
  color: var(--color-text);
}

.cc-step__btn--disabled {
  opacity: 0.3;
  cursor: default;
  pointer-events: none;
}

.cc-step__indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cc-step__dots {
  display: flex;
  gap: 4px;
}

.cc-step__dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--color-border-strong);
  transition: background 0.2s;
}

.cc-step__dot--active {
  background: #2563eb;
}

.cc-step__dot--past {
  background: rgba(37, 99, 235, 0.55);
}

.cc-step__count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
