<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConversationsStore } from '../composables/useConversations'
import UserMenu from '@/layouts/UserMenu.vue'

const props = defineProps<{ collapsed: boolean }>()

const store = useConversationsStore()
const searchQuery = ref('')

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return store.conversations
  const q = searchQuery.value.toLowerCase()
  return store.conversations.filter((c) => c.title.toLowerCase().includes(q))
})

function dayBucket(updatedAt: string): '今天' | '昨天' | '7 天内' {
  const updated = new Date(updatedAt)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.floor((startOfToday - new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  return '7 天内'
}

const groups = computed(() => {
  const order: Array<'今天' | '昨天' | '7 天内'> = ['今天', '昨天', '7 天内']
  return order
    .map((label) => ({ label, conversations: filtered.value.filter((conversation) => dayBucket(conversation.updatedAt) === label) }))
    .filter((group) => group.conversations.length > 0)
})

function timeLabel(updatedAt: string): string {
  const d = new Date(updatedAt)
  const now = new Date()
  const diffDays = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `周${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function selectConversation(id: number) {
  await store.select(id)
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': props.collapsed }">
    <div class="sidebar__header">
      <div class="sidebar__logo">
        <span class="sidebar__logo-badge" aria-hidden="true">
          <span class="sidebar__logo-letter">AI</span>
        </span>
        <span class="sidebar__logo-copy">
          <span class="sidebar__logo-text">AI Studio</span>
          <span class="sidebar__logo-caption">PLAYGROUND</span>
        </span>
      </div>
    </div>

    <div class="sidebar__search">
      <input v-model="searchQuery" class="sidebar__search-input" type="text" placeholder="搜索对话…" />
    </div>

    <div class="sidebar__list">
      <template v-for="group in groups" :key="group.label">
        <div class="sidebar__group-label">{{ group.label }}</div>
        <button
          v-for="conv in group.conversations"
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
      </template>
      <div v-if="!filtered.length" class="sidebar__empty">
        暂无对话
      </div>
    </div>

    <div class="sidebar__footer">
      <UserMenu variant="ai-sidebar" />
    </div>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  position: relative;
  width: 264px !important;
  flex: 0 0 264px;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.sidebar--collapsed { width: 64px !important; flex-basis: 64px; }
.sidebar--collapsed .sidebar__footer,
.sidebar--collapsed .sidebar__header,
.sidebar--collapsed .sidebar__logo { min-width: 64px; } .sidebar--collapsed .sidebar__footer { width: 64px; } .sidebar--collapsed .sidebar__header { width: 64px; } .sidebar--collapsed .sidebar__logo { width: 64px; }
.sidebar--collapsed .sidebar__footer :deep([data-variant='ai-sidebar']) { margin-inline: auto; }

.sidebar--collapsed .sidebar__header { visibility: visible; }

.sidebar__header {
  min-width: 232px;
  padding: 16px 16px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar__header-actions { display: flex; align-items: center; gap: 4px; }
.sidebar__collapse-btn,
.sidebar__new-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.sidebar__new-btn { background: var(--color-surface-2); border-color: var(--color-border); color: var(--color-text); }
.sidebar__collapse-btn:hover,
.sidebar__new-btn:hover { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent-strong); }

.sidebar--collapsed .sidebar__header { min-width: 64px; padding-inline: 16px; }
.sidebar--collapsed .sidebar__logo-copy,
.sidebar--collapsed .sidebar__search,
.sidebar--collapsed .sidebar__list { display: none; }
.sidebar--collapsed .sidebar__footer { justify-content: center; padding-inline: 0; }
.sidebar--collapsed :deep([data-variant='ai-sidebar'] .user-menu__trigger) { padding: 0; }

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text);
}

.sidebar__logo-badge {
  position: relative;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-accent) 70%, white 10%);
  border-radius: 10px;
  background:
    radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.3), transparent 22%),
    linear-gradient(145deg, #123b43 0%, #0b242d 48%, #07171e 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(45, 212, 191, 0.08),
    0 8px 20px rgba(45, 212, 191, 0.16);
}

.sidebar__logo-letter {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #b5fff2;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.08em;
  text-indent: -0.08em;
  text-shadow: 0 0 10px rgba(109, 246, 223, 0.8);
}

.sidebar__logo-letter::after {
  position: absolute;
  inset: 7px;
  border: 1px solid rgba(125, 244, 226, 0.38);
  border-radius: 6px;
  content: '';
}

.sidebar__logo-core { display: none; }

.sidebar__logo-copy {
  display: grid;
  gap: 2px;
}

.sidebar__logo-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sidebar__logo-caption {
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1;
  opacity: 0.72;
}

.sidebar--collapsed .sidebar__logo-copy { display: none; }

.sidebar--collapsed .sidebar__logo-badge {
  width: 28px;
  height: 28px;
  flex-basis: 28px;
}

.sidebar--collapsed .sidebar__logo { justify-content: center; }
.sidebar--collapsed .sidebar__header { display: grid; place-items: center; }
.sidebar--collapsed .sidebar__logo { width: 100%; }
.sidebar--collapsed .sidebar__logo-badge { margin: 0 auto; }
.sidebar--collapsed .sidebar__header { padding-inline: 0; }
.sidebar--collapsed .sidebar__logo { gap: 0; }
.sidebar--collapsed .sidebar__logo-caption { display: none; }
.sidebar--collapsed .sidebar__logo-text { display: none; }
.sidebar--collapsed .sidebar__logo-copy { display: none; }
.sidebar--collapsed .sidebar__logo-badge { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(45, 212, 191, 0.08), 0 6px 16px rgba(45, 212, 191, 0.14); }

.sidebar__search { padding: 0 16px 12px; }
.sidebar__search-input { width: 100%; height: 32px; background: var(--color-surface); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); color: var(--color-text-muted); font-size: 12px; font-family: var(--font-sans); padding: 0 12px; outline: none; }
.sidebar__search-input::placeholder { color: var(--color-text-muted); opacity: 0.6; }
.sidebar__search-input:focus { border-color: var(--color-accent); background: var(--color-surface-2); }
.sidebar__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}

.sidebar__list::-webkit-scrollbar { width: 6px; }
.sidebar__list::-webkit-scrollbar-track { background: transparent; }
.sidebar__list::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--color-border-strong); }
.sidebar__list::-webkit-scrollbar-thumb:hover { background: var(--color-text-muted); }
.sidebar__group-label { padding: 12px 8px 6px; color: var(--color-text-muted); opacity: 0.55; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.sidebar__item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: transparent; border-radius: var(--radius-sm); cursor: pointer; margin-bottom: 1px; text-align: left; }
.sidebar__item:hover { background: var(--color-surface); }
.sidebar__item--active { background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.15); }
.sidebar__item-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-muted); flex-shrink: 0; opacity: 0.5; }
.sidebar__item--active .sidebar__item-dot { background: var(--color-accent); opacity: 1; box-shadow: 0 0 6px var(--color-accent-glow); }
.sidebar__item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--color-text-muted); }
.sidebar__item--active .sidebar__item-text { color: var(--color-text); }
.sidebar__item-meta { flex-shrink: 0; font-size: 10px; color: var(--color-text-muted); opacity: 0.5; font-family: var(--font-mono); }
.sidebar__empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--color-text-muted); }
.sidebar__footer { padding: 12px 16px; border-top: 1px solid var(--color-border-subtle); display: flex; align-items: center; gap: 10px; }
</style>
