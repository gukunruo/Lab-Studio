<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { PhMoon, PhStudent, PhSun, PhTranslate } from '@phosphor-icons/vue'
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
        <RouterLink
          to="/learn"
          class="shell__learn"
          :aria-label="i18n.t('nav.learnAria')"
        >
          <PhStudent :size="16" weight="bold" />
          <span>{{ i18n.t('nav.tab.learn') }}</span>
        </RouterLink>
        <div class="shell__divider" aria-hidden="true" />
        <button
          class="shell__icon-button"
          type="button"
          @click="i18n.toggle()"
          :aria-label="i18n.locale === 'zh' ? i18n.t('nav.locale.toEnAria') : i18n.t('nav.locale.toZhAria')"
          :title="i18n.locale === 'zh' ? i18n.t('nav.locale.toEnAria') : i18n.t('nav.locale.toZhAria')"
        >
          <PhTranslate :size="18" weight="regular" />
          <span class="shell__icon-label">{{ i18n.locale === 'zh' ? 'EN' : '中' }}</span>
        </button>
        <button
          class="shell__icon-button"
          type="button"
          @click="theme.toggle()"
          :aria-label="theme.theme === 'dark' ? i18n.t('nav.theme.toLightAria') : i18n.t('nav.theme.toDarkAria')"
          :title="theme.theme === 'dark' ? i18n.t('nav.theme.toLightAria') : i18n.t('nav.theme.toDarkAria')"
        >
          <PhSun v-if="theme.theme === 'dark'" :size="18" weight="regular" />
          <PhMoon v-else :size="18" weight="regular" />
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
  min-height: 68px;
  padding: 0 clamp(var(--space-4), 4vw, var(--space-8));
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(16px);
}

.shell__bar::after {
  content: '';
  position: absolute;
  inset: auto clamp(var(--space-4), 4vw, var(--space-8)) 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--color-accent-rgb), 0.35), transparent);
  pointer-events: none;
}

.shell__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  font-size: 0.95rem;
  letter-spacing: -0.01em;
  color: var(--color-text);
  text-decoration: none;
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
  gap: 0.45rem;
  flex-shrink: 0;
}

.shell__divider {
  width: 1px;
  height: 22px;
  margin: 0 0.35rem;
  background: var(--color-border);
}

.shell__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s, background 0.2s, transform 0.15s;
}

.shell__icon-button:hover {
  color: var(--color-accent);
  border-color: var(--color-border);
  background: var(--color-surface);
}

.shell__icon-button:active {
  transform: scale(0.94);
}

.shell__icon-label {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  line-height: 1;
}

.shell__count {
  display: none;
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

  .shell__icon-label {
    display: none;
  }

  .shell--learn .shell__bar {
    top: var(--space-3);
    left: var(--space-3);
  }
}
</style>
