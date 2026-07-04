<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { AppMeta } from '@/apps/_registry'
import { useLocaleStore } from '@/stores/locale'

defineProps<{ exp: AppMeta }>()
const i18n = useLocaleStore()
</script>

<template>
  <RouterLink :to="{ name: 'app', params: { slug: exp.slug } }" class="card">
    <div class="card__top">
      <h2 class="card__title">{{ i18n.tl(exp.title) }}</h2>
      <span class="card__date">{{ exp.date }}</span>
    </div>
    <p class="card__desc">{{ i18n.tl(exp.description) }}</p>
    <div v-if="exp.tags.length" class="card__tags">
      <span v-for="tag in exp.tags" :key="tag" class="card__tag">{{ tag }}</span>
    </div>
    <div class="card__foot">
      <span class="card__slug">{{ exp.slug }}</span>
      <span class="card__arrow" aria-hidden="true">→</span>
    </div>
  </RouterLink>
</template>

<style scoped lang="scss">
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s,
    background 0.2s;
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--color-accent);
  background: var(--color-bg);
}

.card:active {
  transform: scale(0.985);
}

.card__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.card__title {
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.card__date {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.card__desc {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: auto;
}

.card__tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
}

.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.card__slug {
  font-family: var(--font-mono);
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.card__arrow {
  font-family: var(--font-mono);
  color: var(--color-text-muted);
  transition:
    transform 0.2s,
    color 0.2s;
}

.card:hover .card__arrow {
  color: var(--color-accent);
  transform: translateX(2px);
}
</style>
