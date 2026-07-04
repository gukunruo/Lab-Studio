<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import { useAppStore } from '@/stores/apps'
import { useLocaleStore } from '@/stores/locale'
import AppCard from '@/components/AppCard.vue'

const store = useAppStore()
const { filtered, query, activeTag, allTags } = storeToRefs(store)
const i18n = useLocaleStore()
</script>

<template>
  <section class="home">
    <div class="home__toolbar">
      <div class="home__search">
        <PhMagnifyingGlass :size="16" class="home__search-icon" />
        <input
          v-model="query"
          class="home__search-input"
          type="search"
          :placeholder="i18n.t('home.searchPlaceholder')"
          aria-label="搜索实验"
        />
      </div>
      <div v-if="allTags.length" class="home__tags">
        <button
          v-for="tag in allTags"
          :key="tag"
          class="tag"
          :class="{ 'tag--active': activeTag === tag }"
          @click="store.toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>

    <div v-if="filtered.length" class="home__grid">
      <AppCard v-for="exp in filtered" :key="exp.slug" :exp="exp" />
    </div>
    <div v-else class="home__empty">
      <p class="home__empty-title">{{ i18n.t('home.emptyTitle') }}</p>
      <p class="home__empty-hint">
        {{ i18n.t('home.emptyHintPre') }} <code>src/apps/</code>
        {{ i18n.t('home.emptyHintPost') }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.home {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-12) var(--space-6) var(--space-16);
}

.home__toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
}

.home__search {
  position: relative;
  width: 360px;
  max-width: 100%;
}

.home__search-icon {
  position: absolute;
  left: 0.7rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
  transition: color 0.2s;
}

.home__search:focus-within .home__search-icon {
  color: var(--color-accent);
}

.home__search-input {
  width: 100%;
  padding: 0.6rem 0.75rem 0.6rem 2.2rem;
  font: inherit;
  font-size: 0.92rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.home__search-input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.home__search-input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft);
}

.home__tags {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.tag {
  padding: 0.3rem 0.7rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    background 0.15s;
}

.tag:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.tag--active {
  color: var(--color-bg);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.tag--active:hover {
  color: var(--color-bg);
  background: var(--color-accent);
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

.home__empty {
  padding: var(--space-12) 0;
}

.home__empty-title {
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.home__empty-hint {
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.home__empty-hint code {
  font-family: var(--font-mono);
  font-size: 0.85em;
}

@media (max-width: 600px) {
  .home__search {
    width: 100%;
  }
}
</style>
