<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { apps } from '@/apps/_registry'
import { usePlayerStore } from '@/stores/player'

const props = defineProps<{ slug: string }>()
const player = usePlayerStore()
const { current, playlist } = storeToRefs(player)
const app = computed(() => apps.find((item) => item.slug === props.slug))

function openDirect() {
  if (props.slug === 'music-player') {
    if (!current.value && playlist.value.length) player.playTrack(0)
    player.openFull()
  }
}

onMounted(openDirect)
watch(() => props.slug, openDirect)
</script>

<template>
  <main class="direct">
    <RouterLink to="/" class="direct__back">返回 Lab</RouterLink>
    <p v-if="app" class="direct__hint">{{ app.title.zh }}</p>
  </main>
</template>

<style scoped lang="scss">
.direct {
  min-height: calc(100dvh - 68px);
  display: grid;
  place-items: center;
  position: relative;
  color: var(--color-text-muted);
}

.direct__back {
  position: absolute;
  top: var(--space-5);
  left: var(--space-6);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  text-decoration: none;
}

.direct__back:hover {
  color: var(--color-accent);
}

.direct__hint {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  opacity: 0.5;
}
</style>
