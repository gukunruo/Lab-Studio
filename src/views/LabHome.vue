<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useExperimentStore } from '@/stores/experiments'
import ExperimentCard from '@/components/ExperimentCard.vue'

const store = useExperimentStore()
const { filtered, query } = storeToRefs(store)
</script>

<template>
  <section class="home">
    <header class="home__head">
      <h1 class="home__title">实验</h1>
      <p class="home__lede">
        自包含的前端实验与想法，每个都在自己的沙盒里。
      </p>
    </header>

    <div class="home__search">
      <label class="home__search-label" for="exp-search">搜索</label>
      <input
        id="exp-search"
        v-model="query"
        class="home__search-input"
        type="search"
        placeholder="名称、标签、slug"
      />
    </div>

    <div v-if="filtered.length" class="home__grid">
      <ExperimentCard v-for="exp in filtered" :key="exp.slug" :exp="exp" />
    </div>
    <div v-else class="home__empty">
      <p class="home__empty-title">没有匹配的实验。</p>
      <p class="home__empty-hint">
        换个关键词，或在 <code>src/experiments/</code> 下新建一个。
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

.home__head {
  margin-bottom: var(--space-8);
}

.home__title {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

.home__lede {
  margin-top: var(--space-3);
  max-width: 56ch;
  color: var(--color-text-muted);
  font-size: 1.02rem;
}

.home__search {
  margin-bottom: var(--space-8);
  max-width: 360px;
}

.home__search-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
}

.home__search-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
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
</style>
