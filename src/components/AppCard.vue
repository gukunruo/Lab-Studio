<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { computed } from 'vue'
import type { AppMeta } from '@/apps/_registry'
import { useLocaleStore } from '@/stores/locale'

const props = defineProps<{ exp: AppMeta; routeName?: string }>()
const i18n = useLocaleStore()

const reduce =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const linkTarget = computed(() => ({
  name: props.routeName ?? (props.exp.entry === 'direct' ? 'app-direct' : 'app'),
  params: { slug: props.exp.slug },
}))

const kind = computed(() => {
  switch (props.exp.slug) {
    case 'music-player':
      return 'music'
    case 'hello-lab':
      return 'hex'
    default:
      return 'default'
  }
})

function onMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (!el || reduce) return
  const r = el.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width
  const py = (e.clientY - r.top) / r.height
  el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`)
  el.style.setProperty('--ry', `${(px - 0.5) * 7}deg`)
  el.style.setProperty('--mx', `${px * 100}%`)
  el.style.setProperty('--my', `${py * 100}%`)
}

function onLeave(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}
</script>

<template>
  <RouterLink
    :to="linkTarget"
    class="card"
    :data-app="kind"
    @mousemove="onMove"
    @mouseleave="onLeave"
  >
    <div class="card__visual" :data-kind="kind">
      <template v-if="kind === 'music'">
        <i v-for="n in 5" :key="n" class="eq-bar" :style="{ animationDelay: `${n * 0.13}s` }" />
      </template>
      <template v-else-if="kind === 'hex'">
        <svg class="hex-mark" viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            points="50,8 87,29.5 87,70.5 50,92 13,70.5 13,29.5"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linejoin="round"
          />
          <circle cx="50" cy="50" r="9" fill="currentColor" />
        </svg>
      </template>
    </div>

    <div class="card__body">
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
    </div>

    <span class="card__spot" aria-hidden="true" />
  </RouterLink>
</template>

<style scoped lang="scss">
.card {
  --rx: 0deg;
  --ry: 0deg;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry));
  transition:
    transform 0.14s ease-out,
    border-color 0.25s,
    box-shadow 0.25s;
  will-change: transform;
}

.card:hover {
  border-color: rgba(var(--color-accent-rgb), 0.55);
  box-shadow:
    0 18px 40px -18px rgba(var(--color-accent-rgb), 0.45),
    0 2px 8px -4px rgba(0, 0, 0, 0.12);
}

.card:active {
  transform: perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transform: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
}

.card__spot {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    260px circle at var(--mx, 50%) var(--my, 50%),
    rgba(var(--color-accent-rgb), 0.12),
    transparent 60%
  );
  transition: opacity 0.25s;
}

.card:hover .card__spot {
  opacity: 1;
}

.card__visual {
  position: relative;
  height: 138px;
  overflow: hidden;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-border);
}

/* default */
.card__visual[data-kind='default'] {
  background:
    radial-gradient(120% 120% at 20% 10%, rgba(var(--color-accent-rgb), 0.16), transparent 55%),
    radial-gradient(120% 120% at 90% 90%, rgba(var(--color-accent-rgb), 0.1), transparent 50%),
    var(--color-surface-2);
}
.card__visual[data-kind='default']::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(var(--color-accent-rgb), 0.18) 1px, transparent 1px);
  background-size: 14px 14px;
  opacity: 0.5;
}

/* music equalizer */
.card__visual[data-kind='music'] {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  padding: 0 28px 30px;
  background:
    radial-gradient(120% 100% at 50% 120%, rgba(var(--color-accent-rgb), 0.2), transparent 60%),
    var(--color-surface-2);
}
.eq-bar {
  width: 9px;
  height: 100%;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(
    to top,
    rgba(var(--color-accent-rgb), 0.85),
    rgba(var(--color-accent-rgb), 0.35)
  );
  transform-origin: bottom;
  animation: eq 1.1s ease-in-out infinite alternate;
}
@keyframes eq {
  0% {
    transform: scaleY(0.22);
  }
  100% {
    transform: scaleY(0.92);
  }
}

/* hex mark */
.card__visual[data-kind='hex'] {
  display: grid;
  place-items: center;
  color: rgba(var(--color-accent-rgb), 0.7);
  background:
    radial-gradient(120% 120% at 50% 50%, rgba(var(--color-accent-rgb), 0.14), transparent 60%),
    var(--color-surface-2);
}
.card__visual[data-kind='hex']::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(var(--color-accent-rgb), 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--color-accent-rgb), 0.08) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.6;
}
.hex-mark {
  position: relative;
  z-index: 1;
  width: 56px;
  height: 56px;
  animation: float 4s ease-in-out infinite;
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .eq-bar,
  .hex-mark {
    animation: none;
  }
}

.card__body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  flex: 1;
}

.card__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.card__title {
  font-size: 1.08rem;
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
  transform: translateX(3px);
}
</style>
