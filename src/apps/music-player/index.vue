<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PhPlay, PhArrowsOutSimple, PhMusicNote } from '@phosphor-icons/vue'
import { usePlayerStore } from '@/stores/player'
defineOptions({ name: 'MusicPlayerIndex' })

const player = usePlayerStore()
const { current, isPlaying, playlist, collectionKey } = storeToRefs(player)

function start() {
  player.playTrack(0)
  player.openFull()
}
</script>

<template>
  <div class="mp">
    <div v-if="!current" class="mp__empty">
      <PhMusicNote :size="44" weight="duotone" class="mp__icon" />
      <p class="mp__count">
        {{ playlist.length }} 首 · {{ collectionKey === 'roco' ? '洛克王国' : '全部' }}
      </p>
      <button class="mp__start" @click="start">
        <PhPlay :size="20" weight="fill" /> 开始播放
      </button>
    </div>
    <div v-else class="mp__now">
      <img
        class="mp__cover"
        :class="{ 'mp__cover--playing': isPlaying }"
        :src="current.cover"
        :alt="current.title"
      />
      <div class="mp__meta">
        <div class="mp__title">{{ current.title }}</div>
        <div class="mp__artist">{{ current.artist }} · {{ current.album }}</div>
      </div>
      <button class="mp__open" @click="player.openFull()">
        <PhArrowsOutSimple :size="18" /> 打开全屏播放器
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.mp {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
  min-height: 320px;
  text-align: center;
}

.mp__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.mp__icon {
  color: var(--color-accent);
  opacity: 0.85;
}

.mp__count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.mp__start,
.mp__open {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0.7rem 1.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-bg);
  background: var(--color-accent);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition:
    filter 0.2s,
    transform 0.1s;
}

.mp__start:hover,
.mp__open:hover {
  filter: brightness(1.08);
}

.mp__start:active,
.mp__open:active {
  transform: scale(0.97);
}

.mp__now {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.mp__cover {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.mp__cover--playing {
  animation: spin 8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.mp__title {
  font-size: 1.2rem;
  font-weight: 600;
}

.mp__artist {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.mp__open {
  background: var(--color-surface-2);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

@media (prefers-reduced-motion: reduce) {
  .mp__cover--playing {
    animation: none;
  }
}
</style>
