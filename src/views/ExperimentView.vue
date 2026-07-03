<script setup lang="ts">
import { computed, shallowRef, watch, defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { RouterLink } from 'vue-router'
import { experiments } from '@/experiments/_registry'

const props = defineProps<{ slug: string }>()

const exp = computed(() => experiments.find((e) => e.slug === props.slug))

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
      <RouterLink to="/" class="exp__back">← 返回</RouterLink>
      <div class="exp__meta">
        <h1 class="exp__title">{{ exp.title }}</h1>
        <span class="exp__slug">{{ exp.slug }}</span>
      </div>
    </div>
    <div class="exp__stage">
      <component :is="AsyncExp" v-if="AsyncExp" />
    </div>
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

.exp__stage {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  min-height: 320px;
  padding: var(--space-8);
}
</style>
