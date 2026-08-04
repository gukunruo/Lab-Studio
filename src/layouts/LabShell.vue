<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { PhStudent } from '@phosphor-icons/vue'
import { apps } from '@/apps/_registry'
import { useThemeStore } from '@/stores/theme'
import { useLocaleStore } from '@/stores/locale'
import { usePlayerStore } from '@/stores/player'
import PlayerBar from '@/components/PlayerBar.vue'
import PlayerFull from '@/components/PlayerFull.vue'
import UserMenu from '@/layouts/UserMenu.vue'

const theme = useThemeStore()
const i18n = useLocaleStore()
const player = usePlayerStore()
const route = useRoute()
const { isPlaying } = storeToRefs(player)

const isLearn = computed(() => route.name === 'learn')
const itemCount = computed(() => apps.length)
</script>

<template>
  <div class="shell" :class="{ 'shell--learn': isLearn }">
    <header class="shell__bar">
      <RouterLink
        to="/"
        class="shell__brand"
        :aria-label="isLearn ? 'Lab Studio' : undefined"
        :title="isLearn ? '返回 Lab' : undefined"
      >
        <svg class="shell__logo" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <mask id="lab-mask">
              <rect width="100" height="100" fill="white" />
              <g stroke="black" stroke-width="5" stroke-linecap="round">
                <line x1="50" y1="50" x2="65.7" y2="23.4" />
                <line x1="50" y1="50" x2="81.45" y2="50" />
                <line x1="50" y1="50" x2="65.7" y2="76.6" />
                <line x1="50" y1="50" x2="34.3" y2="76.6" />
                <line x1="50" y1="50" x2="18.55" y2="50" />
                <line x1="50" y1="50" x2="34.3" y2="23.4" />
              </g>
            </mask>
          </defs>
          <polygon
            points="50,8 87,29.5 87,70.5 50,92 13,70.5 13,29.5"
            fill="currentColor"
            mask="url(#lab-mask)"
          />
          <circle
            cx="50"
            cy="50"
            r="8"
            fill="var(--color-accent)"
            class="shell__logo-core"
            :class="{ 'shell__logo-core--playing': isPlaying }"
          />
        </svg>
        <span v-if="!isLearn" class="shell__brand-text">
          <span class="shell__brand-main">Lab</span>
          <span class="shell__brand-sub">Studio</span>
        </span>
      </RouterLink>

      <div v-if="!isLearn" class="shell__right">
        <span class="shell__count">{{ itemCount }} {{ i18n.t('nav.appCount') }}</span>
        <RouterLink
          to="/learn"
          class="shell__learn"
          :aria-label="i18n.t('nav.learnAria')"
        >
          <PhStudent :size="15" weight="bold" />
          {{ i18n.t('nav.tab.learn') }}
        </RouterLink>
        <button
          class="shell__pill"
          type="button"
          @click="i18n.toggle()"
          :aria-label="i18n.locale === 'zh' ? i18n.t('nav.locale.toEnAria') : i18n.t('nav.locale.toZhAria')"
        >
          {{ i18n.locale === 'zh' ? i18n.t('nav.locale.toEn') : i18n.t('nav.locale.toZh') }}
        </button>
        <button
          class="shell__pill"
          type="button"
          @click="theme.toggle()"
          :aria-label="theme.theme === 'dark' ? i18n.t('nav.theme.toLightAria') : i18n.t('nav.theme.toDarkAria')"
        >
          {{ theme.theme === 'dark' ? i18n.t('nav.theme.toLight') : i18n.t('nav.theme.toDark') }}
        </button>
        <UserMenu />
      </div>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>

    <PlayerBar :compact="isLearn" />
    <PlayerFull />
  </div>
</template>

<style scoped lang="scss">
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.shell--learn {
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

.shell--learn .shell__bar {
  display: none;
}

.shell--learn .shell__main {
  position: relative;
}

.shell--learn .shell__logo {
  width: 22px;
  height: 22px;
}

.shell--learn .shell__main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.95rem;
  letter-spacing: -0.01em;
  color: var(--color-text);
}

.shell__logo {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.shell__logo-core {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.3s ease;
}

.shell__logo-core--playing {
  animation: logo-pulse 1.8s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.35);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shell__logo-core--playing {
    animation: none;
  }
}

.shell__brand-main {
  font-weight: 600;
}

.shell__brand-sub {
  color: var(--color-text-muted);
  margin-left: 0.25em;
}

.shell__right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.shell__count {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--color-text-muted);
  margin-right: var(--space-2);
}

.shell__learn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  padding: 0.3rem 0.75rem;
  color: var(--color-accent);
  background: var(--color-accent-soft);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  text-decoration: none;
  transition:
    border-color 0.2s,
    filter 0.2s,
    transform 0.1s;
}

.shell__learn:hover {
  border-color: var(--color-accent);
  filter: brightness(1.03);
}

.shell__learn:active {
  transform: scale(0.96);
}

.shell__pill {
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

.shell__pill:hover {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.shell__pill:active {
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

  .shell--learn .shell__bar {
    top: var(--space-3);
    left: var(--space-3);
  }
}
</style>
