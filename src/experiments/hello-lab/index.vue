<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const time = ref('')
let timer = 0

onMounted(() => {
  const update = () => (time.value = new Date().toLocaleTimeString('en-GB'))
  update()
  timer = window.setInterval(update, 1000)
})

onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <div class="hello">
    <div class="hello__word">
      你好，<span class="hello__lab">Lab</span>
    </div>
    <div class="hello__clock">{{ time }}</div>
    <p class="hello__hint">
      编辑 <code>src/experiments/hello-lab/index.vue</code> 开始你自己的实验。
    </p>
  </div>
</template>

<style scoped lang="scss">
.hello {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  min-height: 280px;
  text-align: center;
}

.hello__word {
  font-size: clamp(2rem, 6vw, 3.4rem);
  font-weight: 700;
  letter-spacing: -0.03em;
}

.hello__lab {
  color: var(--color-accent);
}

.hello__clock {
  font-family: var(--font-mono);
  font-size: 1rem;
  color: var(--color-text-muted);
}

.hello__hint {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.hello__hint code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
}
</style>
