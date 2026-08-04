<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import { useAppStore } from '@/stores/apps'
import { useLocaleStore } from '@/stores/locale'
import AppCard from '@/components/AppCard.vue'
import HeroScene from '@/components/HeroScene.vue'

const store = useAppStore()
const { filtered, query, activeTag, allTags } = storeToRefs(store)
const i18n = useLocaleStore()
</script>

<template>
  <div class="lab-bg" aria-hidden="true">
    <HeroScene class="lab-bg__scene" />
  </div>

  <section id="lab-grid" class="lab">
    <div class="lab__toolbar">
      <div class="lab__search">
        <PhMagnifyingGlass :size="16" class="lab__search-icon" />
        <input
          v-model="query"
          class="lab__search-input"
          type="search"
          :placeholder="i18n.t('home.searchPlaceholder')"
          aria-label="搜索实验"
        />
      </div>
      <div v-if="allTags.length" class="lab__tags">
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

    <div v-if="filtered.length" class="lab__grid">
      <div v-for="(exp, i) in filtered" :key="exp.slug" class="cell" v-reveal="i * 70">
        <AppCard :exp="exp" />
      </div>
    </div>
    <div v-else class="lab__empty">
      <p class="lab__empty-title">{{ i18n.t('home.emptyTitle') }}</p>
      <p class="lab__empty-hint">
        {{ i18n.t('home.emptyHintPre') }} <code>src/apps/</code>
        {{ i18n.t('home.emptyHintPost') }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
/* ambient interactive background (constellation canvas + faint aurora) */
.lab-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(48% 48% at 16% 24%, rgba(var(--color-accent-rgb), 0.1), transparent 60%),
    radial-gradient(44% 44% at 88% 80%, rgba(var(--color-accent-rgb), 0.08), transparent 60%);
}

.lab-bg__scene {
  position: absolute;
  inset: 0;
}

.lab {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
}

.lab__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-8);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.lab__search {
  position: relative;
  width: 380px;
  max-width: 100%;
}

.lab__search-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
  transition: color 0.2s;
}

.lab__search:focus-within .lab__search-icon {
  color: var(--color-accent);
}

.lab__search-input {
  width: 100%;
  padding: 0.7rem 0.9rem 0.7rem 2.4rem;
  font: inherit;
  font-size: 0.94rem;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
}

.lab__search-input::placeholder {
  color: var(--color-text-muted);
  opacity: 1;
}

.lab__search-input:focus {
  border-color: var(--color-accent);
  background: var(--color-bg);
  box-shadow: 0 0 0 4px rgba(var(--color-accent-rgb), 0.16);
}

.lab__tags {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.tag {
  padding: 0.32rem 0.75rem;
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
    background 0.15s,
    transform 0.15s;
}

.tag:hover {
  color: var(--color-accent);
  border-color: rgba(var(--color-accent-rgb), 0.5);
  background: var(--color-accent-soft);
  transform: translateY(-1px);
}

.tag--active {
  color: var(--color-on-accent);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.tag--active:hover {
  color: var(--color-on-accent);
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.lab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: var(--space-5);
}

.cell {
  display: flex;
}

.lab__empty {
  padding: var(--space-12) 0;
}

.lab__empty-title {
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.lab__empty-hint {
  color: var(--color-text-muted);
  font-size: 0.92rem;
}

.lab__empty-hint code {
  font-family: var(--font-mono);
  font-size: 0.85em;
}

@media (max-width: 600px) {
  .lab__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .lab__search {
    width: 100%;
  }
}
</style>
