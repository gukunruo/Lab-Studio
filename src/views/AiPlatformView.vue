<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useModelsStore } from '@/ai-platform/composables/useModels'
import { useConversationsStore } from '@/ai-platform/composables/useConversations'

const modelsStore = useModelsStore()
const conversationsStore = useConversationsStore()
const loaded = ref(false)

onMounted(async () => {
  await Promise.all([modelsStore.load(), conversationsStore.loadList()])
  loaded.value = true
})
</script>

<template>
  <div class="ai-platform">
    <div v-if="!loaded" class="ai-platform__loading">
      <span>Loading…</span>
    </div>
    <div v-else class="ai-platform__loaded">
      <!-- Full UI replaces this in Task 8 -->
      <div style="display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:12px;">
        <p>Models loaded: {{ modelsStore.chatModels.length }} chat, {{ modelsStore.reasoningModels.length }} reasoning</p>
        <p>Conversations: {{ conversationsStore.conversations.length }}</p>
        <RouterLink to="/" style="color:var(--color-accent);">← Back to Lab</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-platform {
  height: 100dvh;
  width: 100%;
  overflow: hidden;
}

.ai-platform__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
}
</style>
