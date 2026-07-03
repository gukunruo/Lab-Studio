<script setup lang="ts">
import { computed, ref, shallowRef, watch, defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { PhFileText } from '@phosphor-icons/vue'
import { experiments } from '@/experiments/_registry'
import { useLocaleStore } from '@/stores/locale'
import MarkdownModal from '@/components/MarkdownModal.vue'

const props = defineProps<{ slug: string }>()

const i18n = useLocaleStore()

const exp = computed(() => experiments.find((e) => e.slug === props.slug))
const showDoc = ref(false)

const AsyncExp = shallowRef<Component | null>(null)

watch(
  () => props.slug,
  (slug) => {
    const found = experiments.find((e) => e.slug === slug)
    AsyncExp.value = found ? defineAsyncComponent(found.component) : null
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="exp" class="exp">
    <div class="exp__bar">
      <RouterLink to="/" class="exp__back">{{ i18n.t('exp.back') }}</RouterLink>
      <div class="exp__meta">
        <h1 class="exp__title">{{ i18n.tl(exp.title) }}</h1>
        <span class="exp__slug">{{ exp.slug }}</span>
      </div>
      <button
        v-if="exp.doc"
        class="exp__doc"
        @click="showDoc = true"
        :aria-label="i18n.t('exp.doc')"
      >
        <PhFileText :size="16" />
        {{ i18n.t('exp.doc') }}
      </button>
    </div>
    <div class="exp__stage">
      <component :is="AsyncExp" v-if="AsyncExp" />
    </div>
    <MarkdownModal v-if="showDoc && exp.doc" :source="exp.doc" @close="showDoc = false" />
  </div>
</template>

<style scoped lang="scss">
.exp {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}

.exp__bar {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  padding-bottom: var(--space-4);
  margin-bottom: var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.exp__back {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  text-decoration: none;
  transition: color 0.2s;
}

.exp__back:hover {
  color: var(--color-accent);
}

.exp__meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.exp__title {
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.exp__slug {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.exp__doc {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.exp__doc:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.exp__stage {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  min-height: 320px;
  padding: var(--space-8);
}
</style>
