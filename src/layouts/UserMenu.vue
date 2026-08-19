<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { PhCaretDown } from '@phosphor-icons/vue'

const root = ref<HTMLElement | null>(null)

const auth = useAuthStore()
const open = ref(false)
const editing = ref(false)
const displayName = ref('')
const avatarUrl = ref('')
const saving = ref(false)
const panelStyle = ref<Record<string, string>>({})

async function updatePanelPosition() {
  await nextTick()
  const trigger = root.value?.querySelector<HTMLElement>('.user-menu__trigger')
  const panel = root.value?.querySelector<HTMLElement>('.user-menu__panel')
  const sidebar = root.value?.closest<HTMLElement>('.sidebar')
  if (!trigger || !panel || !sidebar) return

  const triggerRect = trigger.getBoundingClientRect()
  const panelRect = panel.getBoundingClientRect()
  const edgePadding = 12
  const gap = 10
  const collapsed = sidebar.classList.contains('sidebar--collapsed')
  const preferredTop = triggerRect.top - panelRect.height - gap
  const top = Math.max(
    edgePadding,
    Math.min(preferredTop, window.innerHeight - panelRect.height - edgePadding),
  )
  const preferredLeft = collapsed
    ? triggerRect.right + gap
    : triggerRect.left
  const left = Math.max(
    edgePadding,
    Math.min(preferredLeft, window.innerWidth - panelRect.width - edgePadding),
  )

  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    displayName.value = auth.username
    avatarUrl.value = auth.avatarUrl
    await updatePanelPosition()
  } else {
    panelStyle.value = {}
  }
}

async function save() {
  if (!displayName.value.trim() || saving.value) return
  saving.value = true
  const ok = await auth.updateProfile(displayName.value.trim(), avatarUrl.value.trim())
  saving.value = false
  if (ok) editing.value = false
}

function closeOnOutside(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

function repositionOnViewportChange() {
  if (open.value) void updatePanelPosition()
}

onMounted(() => {
  document.addEventListener('mousedown', closeOnOutside)
  document.addEventListener('keydown', closeOnEscape)
  window.addEventListener('resize', repositionOnViewportChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closeOnOutside)
  document.removeEventListener('keydown', closeOnEscape)
  window.removeEventListener('resize', repositionOnViewportChange)
})

watch(editing, () => {
  if (open.value) void updatePanelPosition()
})

async function signOut() {
  await auth.logout()
  window.location.assign('/login')
}
</script>

<template>
  <div ref="root" class="user-menu">
    <button class="user-menu__trigger" type="button" :aria-expanded="open" aria-haspopup="menu" @click="toggle">
      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" class="user-menu__avatar" />
      <span v-else class="user-menu__avatar user-menu__avatar--fallback">{{ auth.username.slice(0, 1).toUpperCase() }}</span>
      <span class="user-menu__name">{{ auth.username }}</span>
      <PhCaretDown :size="12" aria-hidden="true" />
    </button>
    <div v-if="open" class="user-menu__panel" :style="panelStyle" role="menu">
      <div v-if="!editing" class="user-menu__profile">
        <div class="user-menu__profile-avatar">
          <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" class="user-menu__avatar user-menu__avatar--large" />
          <span v-else class="user-menu__avatar user-menu__avatar--large user-menu__avatar--fallback">{{ auth.username.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div class="user-menu__profile-copy">
          <strong>{{ auth.username }}</strong>
          <span>Lab Studio</span>
        </div>
        <button class="user-menu__edit" type="button" @click="editing = true">编辑</button>
      </div>
      <form v-else class="user-menu__form" @submit.prevent="save">
        <label>用户名<input v-model="displayName" maxlength="40" required /></label>
        <label>头像 URL<input v-model="avatarUrl" maxlength="500" placeholder="https://…" /></label>
        <div class="user-menu__actions">
          <button type="button" @click="editing = false">取消</button>
          <button type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </form>
      <button class="user-menu__logout" type="button" @click="signOut">退出登录</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-menu {
  position: relative;
  width: 100%;
}

.user-menu__trigger {
  display: inline-flex;
  align-items: center;
  width: 100%;
  gap: 0.55rem;
  padding: 0.3rem 0.7rem 0.3rem 0.3rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.2s, background 0.2s;
}

.user-menu__trigger:hover,
.user-menu__trigger[aria-expanded='true'] {
  border-color: var(--color-border-strong);
  background: var(--color-surface-2);
}

.user-menu__avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
}

.user-menu__avatar--large {
  width: 38px;
  height: 38px;
}

.user-menu__avatar--fallback {
  display: grid;
  place-items: center;
  background: var(--color-accent);
  color: var(--color-bg);
  font-size: 0.78rem;
  font-weight: 700;
}

.user-menu__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 0.82rem;
}

.user-menu__trigger > svg {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.user-menu__panel {
  position: fixed;
  z-index: 100;
  width: min(280px, calc(100vw - 24px));
  max-height: min(420px, calc(100dvh - 24px));
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  background: var(--color-bg-elevated);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
}

.user-menu__profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.user-menu__profile-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.user-menu__profile-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: 0.9rem;
}

.user-menu__profile-copy span {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.user-menu__edit,
.user-menu__actions button,
.user-menu__logout {
  border: 0;
  background: transparent;
  color: var(--color-accent-strong);
  cursor: pointer;
}

.user-menu__edit {
  flex-shrink: 0;
  padding: 4px 2px;
  font-size: 0.78rem;
}

.user-menu__form {
  display: grid;
  gap: 0.7rem;
}

.user-menu__form label {
  display: grid;
  gap: 0.3rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.user-menu__form input {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
}

.user-menu__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.7rem;
}

.user-menu__logout {
  width: 100%;
  margin-top: 14px;
  padding: 12px 0 0;
  border-top: 1px solid var(--color-border-subtle);
  text-align: left;
  color: var(--color-danger);
  font-size: 0.82rem;
}

:global(.sidebar--collapsed) .user-menu {
  width: auto;
}

:global(.sidebar--collapsed) .user-menu__trigger {
  width: 40px;
  padding: 0.3rem;
  justify-content: center;
}

:global(.sidebar--collapsed) .user-menu__name,
:global(.sidebar--collapsed) .user-menu__trigger > svg {
  display: none;
}
</style>
