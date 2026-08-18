<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConversationsStore } from '../composables/useConversations'
import { useAuthStore } from '@/stores/auth'
import UserMenu from '@/layouts/UserMenu.vue'
import { PhPlus } from '@phosphor-icons/vue'

const store = useConversationsStore()
const auth = useAuthStore()
const searchQuery = ref('')

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return store.conversations
  const q = searchQuery.value.toLowerCase()
  return store.conversations.filter((c) => c.title.toLowerCase().includes(q))
})

function timeLabel(updatedAt: string): string {
  const d = new Date(updatedAt)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays}天前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function newConversation() {
  const modelId = store.activeConversation?.modelId ?? 'claude-opus-5'
  await store.create(modelId)
}

async function selectConversation(id: number) {
  await store.select(id)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__header">
      <div class="sidebar__logo">
        <span class="sidebar__logo-dot" />
        <span>AI Studio</span>
      </div>
      <button class="sidebar__new-btn" type="button" title="新对话" aria-label="新对话" @click="newConversation"><PhPlus :size="18" /></button>
    </div>

    <div class="sidebar__search">
      <input v-model="searchQuery" class="sidebar__search-input" type="text" placeholder="搜索对话…" />
    </div>

    <div class="sidebar__list">
      <button
        v-for="conv in filtered"
        :key="conv.id"
        class="sidebar__item"
        :class="{ 'sidebar__item--active': conv.id === store.activeId }"
        type="button"
        @click="selectConversation(conv.id)"
      >
        <span class="sidebar__item-dot" />
        <span class="sidebar__item-text">{{ conv.title }}</span>
        <span class="sidebar__item-meta">{{ timeLabel(conv.updatedAt) }}</span>
      </button>
      <div v-if="!filtered.length" class="sidebar__empty">
        暂无对话
      </div>
    </div>

    <div class="sidebar__footer">
      <UserMenu />
      <div class="sidebar__footer-info">
        <div class="sidebar__footer-name">{{ auth.username }}</div>
        <div class="sidebar__footer-role">Lab Studio</div>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  width: 264px;
  flex-shrink: 0;
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.sidebar__header {
  padding: 16px 16px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text);
}

.sidebar__logo-dot {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-strong) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 12px var(--color-accent-glow);

  &::after {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-bg-elevated);
  }
}

.sidebar__new-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.sidebar__new-btn:hover {
  background: var(--color-accent-soft);
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}

.sidebar__search {
  padding: 0 16px 12px;
}

.sidebar__search-input {
  width: 100%;
  height: 32px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 12px;
  font-family: var(--font-sans);
  padding: 0 12px;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.sidebar__search-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

.sidebar__search-input:focus {
  border-color: var(--color-accent);
  background: var(--color-surface-2);
}

.sidebar__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px;
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  margin-bottom: 1px;
  text-align: left;
}

.sidebar__item:hover {
  background: var(--color-surface);
}

.sidebar__item--active {
  background: var(--color-accent-soft);
  box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.15);
}

.sidebar__item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  flex-shrink: 0;
  opacity: 0.5;
}

.sidebar__item--active .sidebar__item-dot {
  background: var(--color-accent);
  opacity: 1;
  box-shadow: 0 0 6px var(--color-accent-glow);
}

.sidebar__item-text {
  font-size: 13px;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.sidebar__item--active .sidebar__item-text {
  color: var(--color-text);
}

.sidebar__item-meta {
  font-size: 10px;
  color: var(--color-text-muted);
  opacity: 0.5;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.sidebar__empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.sidebar__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar__footer :deep(.user-menu__trigger) {
  padding: 0;
  border: 0;
  background: transparent;
}

.sidebar__footer :deep(.user-menu__avatar) {
  width: 28px;
  height: 28px;
}

.sidebar__footer :deep(.user-menu__name),
.sidebar__footer :deep(.user-menu__trigger > span:last-child) {
  display: none;
}

.sidebar__footer-info {
  flex: 1;
  min-width: 0;
}

.sidebar__footer-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}

.sidebar__footer-role {
  font-size: 10px;
  color: var(--color-text-muted);
}
</style>
