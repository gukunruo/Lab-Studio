<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { experiments } from '@/experiments/_registry'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
</script>

<template>
  <div class="shell">
    <header class="shell__bar">
      <RouterLink to="/" class="shell__brand">
        <span class="shell__brand-main">Lab</span><span class="shell__brand-sep">/</span><span
          class="shell__brand-sub"
        >Studio</span>
      </RouterLink>
      <div class="shell__right">
        <span class="shell__count">{{ experiments.length }} 个实验</span>
        <button
          class="shell__theme"
          type="button"
          @click="theme.toggle()"
          :aria-label="theme.theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'"
        >
          {{ theme.theme === 'dark' ? '浅色' : '深色' }}
        </button>
      </div>
    </header>
    <main class="shell__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped lang="scss">
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.shell__bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 var(--space-6);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.shell__brand {
  font-size: 0.95rem;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.shell__brand-main {
  font-weight: 600;
}

.shell__brand-sep {
  margin: 0 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.shell__brand-sub {
  color: var(--color-text-muted);
}

.shell__right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.shell__count {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.shell__theme {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  padding: 0.3rem 0.7rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.shell__theme:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.shell__theme:active {
  transform: scale(0.96);
}

.shell__main {
  flex: 1;
}

@media (max-width: 640px) {
  .shell__bar {
    padding: 0 var(--space-4);
  }

  .shell__count {
    display: none;
  }
}
</style>
