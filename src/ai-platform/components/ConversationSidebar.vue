<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PhGitBranch, PhNotePencil, PhPushPin, PhTrash } from '@phosphor-icons/vue'
import { useConversationsStore } from '../composables/useConversations'
import UserMenu from '@/layouts/UserMenu.vue'

const props = defineProps<{
  collapsed: boolean
  width: number
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  'new-conversation': []
}>()

const store = useConversationsStore()
const searchQuery = ref('')
const pendingDelete = ref<{ id: number; title: string } | null>(null)
const deleting = ref(false)

function closeDeleteDialog() {
  if (deleting.value) return
  pendingDelete.value = null
}

function onDeleteDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDeleteDialog()
}

watch(pendingDelete, async (value) => {
  if (value) {
    await nextTick()
    document.querySelector<HTMLElement>('.sidebar__delete-dialog [data-autofocus]')?.focus()
  }
})

onMounted(() => document.addEventListener('keydown', onDeleteDialogKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDeleteDialogKeydown))

async function confirmDelete() {
  const target = pendingDelete.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await store.remove(target.id)
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}

const filtered = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return store.conversations
  return store.conversations.filter((conversation) => conversation.title.toLowerCase().includes(query))
})

const pinnedConversations = computed(() => filtered.value.filter((conversation) => conversation.pinned))
const recentConversations = computed(() => filtered.value.filter((conversation) => !conversation.pinned))

function dayBucket(updatedAt: string): '今天' | '昨天' | '7 天内' {
  const updated = new Date(updatedAt)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.floor((startOfToday - new Date(updated.getFullYear(), updated.getMonth(), updated.getDate()).getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  return '7 天内'
}

const recentGroups = computed(() => {
  const order: Array<'今天' | '昨天' | '7 天内'> = ['今天', '昨天', '7 天内']
  return order
    .map((label) => ({ label, conversations: recentConversations.value.filter((conversation) => dayBucket(conversation.updatedAt) === label) }))
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

async function togglePinned(id: number, event: MouseEvent) {
  event.stopPropagation()
  await store.togglePinned(id)
}

function removeConversation(id: number, title: string, event: MouseEvent) {
  event.stopPropagation()
  pendingDelete.value = { id, title }
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'sidebar--collapsed': props.collapsed }"
    :style="{ '--sidebar-width': `${props.width}px` }"
  >
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
      <div class="sidebar__group-label">功能区</div>
      <button class="sidebar__new-entry" type="button" @click="emit('new-conversation')">
        <PhNotePencil :size="17" weight="regular" />
        <span>新对话</span>
      </button>

      <template v-if="pinnedConversations.length">
        <div class="sidebar__group-label">置顶</div>
        <div
          v-for="conv in pinnedConversations"
          :key="conv.id"
          class="sidebar__item"
          :class="{ 'sidebar__item--active': conv.id === store.activeId }"
        >
          <button class="sidebar__item-main" type="button" @click="selectConversation(conv.id)">
            <PhPushPin class="sidebar__item-pin sidebar__item-pin--visible" :size="14" weight="fill" />
            <span class="sidebar__item-text">{{ conv.title }}</span>
            <span v-if="conv.parentConversationId !== null" class="sidebar__branch" title="分支对话"><PhGitBranch :size="12" weight="bold" /> 分支</span>
            <span class="sidebar__item-meta">{{ timeLabel(conv.updatedAt) }}</span>
          </button>
          <span class="sidebar__item-action-wrap">
            <button class="sidebar__item-action" type="button" :aria-label="`取消置顶 ${conv.title}`" title="取消置顶" @click="togglePinned(conv.id, $event)">
              <PhPushPin :size="14" weight="regular" />
            </button>
            <button class="sidebar__item-action sidebar__item-action--danger" type="button" :aria-label="`移除 ${conv.title}`" title="移除" @click="removeConversation(conv.id, conv.title, $event)">
              <PhTrash :size="14" weight="regular" />
            </button>
          </span>
        </div>
      </template>

      <template v-if="recentGroups.length">
        <div class="sidebar__group-label">最近对话</div>
        <template v-for="group in recentGroups" :key="group.label">
          <div class="sidebar__group-label sidebar__group-label--date">{{ group.label }}</div>
        <div
          v-for="conv in group.conversations"
          :key="conv.id"
          class="sidebar__item"
          :class="{ 'sidebar__item--active': conv.id === store.activeId }"
        >
          <button class="sidebar__item-main" type="button" @click="selectConversation(conv.id)">
            <PhGitBranch v-if="conv.parentConversationId !== null" class="sidebar__item-branch-icon" :size="14" weight="bold" />
            <span v-else class="sidebar__item-dot" />
            <span class="sidebar__item-text">{{ conv.title }}</span>
            <span v-if="conv.parentConversationId !== null" class="sidebar__branch" title="分支对话">分支</span>
            <span class="sidebar__item-meta">{{ timeLabel(conv.updatedAt) }}</span>
          </button>
          <span class="sidebar__item-action-wrap">
            <button class="sidebar__item-action" type="button" :aria-label="`置顶 ${conv.title}`" title="置顶" @click="togglePinned(conv.id, $event)">
              <PhPushPin :size="14" weight="regular" />
            </button>
            <button class="sidebar__item-action sidebar__item-action--danger" type="button" :aria-label="`移除 ${conv.title}`" title="移除" @click="removeConversation(conv.id, conv.title, $event)">
              <PhTrash :size="14" weight="regular" />
            </button>
          </span>
        </div>
        </template>
      </template>

      <div v-if="!filtered.length" class="sidebar__empty">暂无对话</div>
    </div>

    <div class="sidebar__footer">
      <UserMenu variant="ai-sidebar" />
    </div>

    <Teleport to="body">
      <div
        v-if="pendingDelete"
        class="sidebar__delete-dialog-backdrop"
        :data-theme="props.theme"
        @click.self="closeDeleteDialog"
      >
        <section
          class="sidebar__delete-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ai-delete-dialog-title"
          aria-describedby="ai-delete-dialog-description"
        >
          <div class="sidebar__delete-dialog-heading">
            <div class="sidebar__delete-dialog-icon" aria-hidden="true">
              <PhTrash :size="20" weight="regular" />
            </div>
            <h2 id="ai-delete-dialog-title">删除这个对话？</h2>
          </div>
          <div class="sidebar__delete-dialog-copy">
            <p id="ai-delete-dialog-description">
              “{{ pendingDelete.title }}”将从对话列表中移除，删除后无法恢复。
            </p>
          </div>
          <div class="sidebar__delete-dialog-actions">
            <button
              class="sidebar__delete-dialog-button sidebar__delete-dialog-button--cancel"
              type="button"
              :disabled="deleting"
              @click="closeDeleteDialog"
            >
              取消
            </button>
            <button
              class="sidebar__delete-dialog-button sidebar__delete-dialog-button--danger"
              type="button"
              :disabled="deleting"
              data-autofocus
              @click="confirmDelete"
            >
              {{ deleting ? '删除中…' : '删除对话' }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped lang="scss">
.sidebar {
  position: relative;
  width: var(--sidebar-width) !important;
  flex: 0 0 var(--sidebar-width);
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

.sidebar--collapsed { width: 0 !important; flex-basis: 0; border-right: 0; }
.sidebar--collapsed > * { visibility: hidden; pointer-events: none; }
.sidebar__header { min-width: 232px; padding: 16px 16px 12px; display: flex; align-items: center; }
.sidebar__logo { display: flex; align-items: center; gap: 10px; color: var(--color-text); }
.sidebar__logo-badge { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border: 1px solid var(--color-border-strong); border-radius: 7px; background: transparent; }
.sidebar__logo-letter { color: var(--color-text); font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: -0.08em; line-height: 1; text-indent: -0.08em; }
.sidebar__logo-copy { display: grid; gap: 2px; }
.sidebar__logo-text { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.sidebar__logo-caption { color: var(--color-text-muted); font-family: var(--font-mono); font-size: 8px; font-weight: 600; letter-spacing: 0.16em; line-height: 1; opacity: 0.72; }
.sidebar__search { padding: 0 16px 10px; }
.sidebar__search-input { width: 100%; height: 34px; background: var(--color-surface); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-sm); color: var(--color-text); font-size: 12px; font-family: var(--font-sans); padding: 0 12px; outline: none; }
.sidebar__search-input::placeholder { color: var(--color-text-muted); opacity: 0.6; }
.sidebar__search-input:focus { border-color: var(--color-accent); background: var(--color-surface-2); }
.sidebar__list { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 2px 8px; scrollbar-width: thin; scrollbar-color: var(--color-border-strong) transparent; }
.sidebar__list::-webkit-scrollbar { width: 6px; }
.sidebar__list::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--color-border-strong); }
.sidebar__group-label { padding: 13px 8px 6px; color: var(--color-text-muted); opacity: 0.62; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; }
.sidebar__new-entry { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 11px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface-2); color: var(--color-text); cursor: pointer; font-family: var(--font-sans); font-size: 13px; font-weight: 600; text-align: left; }
.sidebar__new-entry:hover { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent-strong); }
.sidebar__item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 2px 4px 2px 10px; border: none; background: transparent; border-radius: var(--radius-sm); margin-bottom: 1px; text-align: left; }
.sidebar__item:hover { background: var(--color-surface); }
.sidebar__item-main { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding: 6px 0; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.sidebar__item--active { background: var(--color-accent-soft); box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.15); }
.sidebar__item-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-muted); flex-shrink: 0; opacity: 0.5; }
.sidebar__item--active .sidebar__item-dot { background: var(--color-accent); opacity: 1; box-shadow: 0 0 6px var(--color-accent-glow); }
.sidebar__item-pin,
.sidebar__item-branch-icon { flex: 0 0 14px; color: var(--color-accent-strong); }
.sidebar__branch { flex: 0 0 auto; color: var(--color-accent-strong); font-size: 10px; font-weight: 600; }
.sidebar__item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--color-text-muted); }
.sidebar__item--active .sidebar__item-text { color: var(--color-text); }
.sidebar__item-meta { flex-shrink: 0; font-size: 10px; color: var(--color-text-muted); opacity: 0.5; font-family: var(--font-mono); }
.sidebar__item-action-wrap { flex: 0 0 auto; display: flex; justify-content: flex-end; gap: 2px; }
.sidebar__item-action { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--color-text-muted); cursor: pointer; opacity: 0; }
.sidebar__item-action--danger:hover { background: color-mix(in srgb, var(--color-danger) 16%, transparent); color: var(--color-danger); }
.sidebar__item:hover .sidebar__item-action, .sidebar__item-action:focus-visible { opacity: 1; }
.sidebar__item-action:hover { background: var(--color-accent-soft); color: var(--color-accent-strong); }
.sidebar__empty { padding: 24px 16px; text-align: center; font-size: 12px; color: var(--color-text-muted); }
.sidebar__footer { padding: 12px 16px; border-top: 1px solid var(--color-border-subtle); display: flex; align-items: center; gap: 10px; }

.sidebar__delete-dialog-backdrop {
  --dialog-bg: #fff;
  --dialog-surface: #fafafa;
  --dialog-text: #1d1d1f;
  --dialog-muted: #666;
  --dialog-border: rgba(29, 29, 31, 0.14);
  --dialog-danger: #e5484d;
  --dialog-danger-hover: #cf3d42;
  --dialog-danger-soft: #fff1f1;
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(3px);
}

.sidebar__delete-dialog-backdrop[data-theme='dark'] {
  --dialog-bg: #18181a;
  --dialog-surface: #222225;
  --dialog-text: #f4f4f5;
  --dialog-muted: #b1b1b5;
  --dialog-border: rgba(255, 255, 255, 0.14);
  --dialog-danger-soft: rgba(229, 72, 77, 0.16);
}

.sidebar__delete-dialog {
  width: min(100%, 380px);
  padding: 22px;
  border: 1px solid var(--dialog-border);
  border-radius: var(--radius-md);
  background: var(--dialog-bg);
  color: var(--dialog-text);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18);
}

.sidebar__delete-dialog-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar__delete-dialog-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--dialog-danger) 28%, transparent);
  border-radius: 9px;
  background: var(--dialog-danger-soft);
  color: var(--dialog-danger);
}

.sidebar__delete-dialog-heading h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.sidebar__delete-dialog-copy p {
  margin: 12px 0 0;
  color: var(--dialog-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.sidebar__delete-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.sidebar__delete-dialog-button {
  min-width: 88px;
  height: 38px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 9px;
  font: 600 13px var(--font-sans);
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s, color 0.18s, opacity 0.18s;
}

.sidebar__delete-dialog-button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.sidebar__delete-dialog-button--cancel {
  border-color: var(--dialog-border);
  background: transparent;
  color: var(--dialog-text);
}

.sidebar__delete-dialog-button--cancel:hover:not(:disabled) {
  background: var(--dialog-surface);
}

.sidebar__delete-dialog-button--danger {
  border-color: var(--dialog-danger);
  background: var(--dialog-danger);
  color: #fff;
}

.sidebar__delete-dialog-button--danger:hover:not(:disabled) {
  border-color: var(--dialog-danger-hover);
  background: var(--dialog-danger-hover);
}
</style>
