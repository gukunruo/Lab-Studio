<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { PhCaretDown } from '@phosphor-icons/vue'

const props = defineProps<{ variant?: 'default' | 'ai-sidebar' }>()
const root = ref<HTMLElement | null>(null)

const auth = useAuthStore()
const open = ref(false)
const editing = ref(false)
const displayName = ref('')
const avatarUrl = ref('')
const saving = ref(false)
const panelStyle = ref<Record<string, string>>({})
const isAiSidebar = computed(() => props.variant === 'ai-sidebar')

async function updatePanelPosition() {
  if (!isAiSidebar.value) return
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
  const preferredLeft = collapsed ? triggerRect.right + gap : triggerRect.left
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
  if (open.value && isAiSidebar.value) void updatePanelPosition()
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
  if (open.value && isAiSidebar.value) void updatePanelPosition()
})

watch(open, (value) => {
  if (!value) panelStyle.value = {}
})

async function signOut() {
  await auth.logout()
  window.location.assign('/login')
}
</script>

<template>
  <div ref="root" class="user-menu" :data-variant="props.variant">
    <button class="user-menu__trigger" type="button" :aria-expanded="open" aria-haspopup="menu" @click="toggle">
      <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="" class="user-menu__avatar" />
      <span v-else class="user-menu__avatar user-menu__avatar--fallback">{{ auth.username.slice(0, 1).toUpperCase() }}</span>
      <span class="user-menu__name">{{ auth.username }}</span>
      <PhCaretDown class="user-menu__caret" :size="12" aria-hidden="true" />
    </button>
    <div v-if="open" class="user-menu__panel" :style="isAiSidebar ? panelStyle : undefined" role="menu">
      <div v-if="!editing && props.variant === 'ai-sidebar'" class="user-menu__profile">
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
      <div v-else-if="!editing" class="user-menu__summary">
        <strong>{{ auth.username }}</strong>
        <button type="button" @click="editing = true">编辑资料</button>
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
.user-menu { position: relative; }
.user-menu__trigger { display: flex; align-items: center; gap: 0.45rem; min-width: 0; padding: 0.25rem 2rem 0.25rem 0.25rem; border: 1px solid var(--color-border); border-radius: var(--radius-full); background: var(--color-surface); color: var(--color-text); position: relative; }
.user-menu:not([data-variant='ai-sidebar']) .user-menu__name { min-width: 0; }
.user-menu:not([data-variant='ai-sidebar']) :deep(.user-menu__caret) { position: absolute; top: 50%; right: 0.75rem; color: var(--color-text-muted); transform: translateY(-50%); }
.user-menu__avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
.user-menu__avatar--fallback { display: grid; place-items: center; background: var(--color-accent); color: var(--color-on-accent); font-size: 0.72rem; font-weight: 700; }
.user-menu__name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; }
.user-menu__panel { position: absolute; top: calc(100% + 0.6rem); right: 0; z-index: 20; width: 250px; padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: 0 16px 40px rgba(0,0,0,0.14); }
.user-menu__summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.user-menu__summary button, .user-menu__actions button, .user-menu__logout { border: 0; background: transparent; color: var(--color-accent-strong); font-size: 0.8rem; }
.user-menu__form { display: grid; gap: 0.7rem; }
.user-menu__form label { display: grid; gap: 0.3rem; color: var(--color-text-muted); font-size: 0.75rem; }
.user-menu__form input { width: 100%; padding: 0.45rem 0.55rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); }
.user-menu__actions { display: flex; justify-content: flex-end; gap: 0.7rem; }
.user-menu__logout { width: 100%; margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--color-border); text-align: left; color: var(--color-danger); }

.user-menu[data-variant='ai-sidebar'] { width: 100%; }
.user-menu[data-variant='ai-sidebar'] .user-menu__trigger { position: relative; align-items: center; width: 100%; gap: 0.55rem; padding: 0.3rem 2rem 0.3rem 0.3rem; transition: border-color 0.2s, background 0.2s; }
.user-menu[data-variant='ai-sidebar'] .user-menu__trigger > svg { flex-shrink: 0; color: var(--color-text-muted); }
.user-menu[data-variant='ai-sidebar'] .user-menu__trigger:hover,
.user-menu[data-variant='ai-sidebar'] .user-menu__trigger[aria-expanded='true'] { border-color: var(--color-border-strong); background: var(--color-surface-2); }
.user-menu[data-variant='ai-sidebar'] .user-menu__avatar { width: 28px; height: 28px; flex-shrink: 0; }
.user-menu[data-variant='ai-sidebar'] .user-menu__avatar--large { width: 38px; height: 38px; }
.user-menu[data-variant='ai-sidebar'] .user-menu__avatar--fallback { background: var(--color-accent); color: var(--color-bg); font-size: 0.78rem; }
.user-menu[data-variant='ai-sidebar'] .user-menu__name { min-width: 0; flex: 1; text-align: left; font-size: 0.82rem; }
.user-menu[data-variant='ai-sidebar'] .user-menu__caret { position: absolute; top: 50%; right: 0.7rem; flex-shrink: 0; color: var(--color-text-muted); transform: translateY(-50%); }
.user-menu[data-variant='ai-sidebar'] .user-menu__trigger > svg { flex-shrink: 0; color: var(--color-text-muted); }
.user-menu[data-variant='ai-sidebar'] .user-menu__panel { position: fixed; width: min(280px, calc(100vw - 24px)); max-height: min(420px, calc(100dvh - 24px)); overflow-y: auto; padding: 14px; border-color: var(--color-border-strong); border-radius: 18px; background: var(--color-bg-elevated); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42); }
.user-menu[data-variant='ai-sidebar'] .user-menu__profile { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--color-border-subtle); }
.user-menu[data-variant='ai-sidebar'] .user-menu__profile-copy { display: grid; min-width: 0; flex: 1; gap: 2px; }
.user-menu[data-variant='ai-sidebar'] .user-menu__profile-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text); font-size: 0.9rem; }
.user-menu[data-variant='ai-sidebar'] .user-menu__profile-copy span { color: var(--color-text-muted); font-size: 0.72rem; }
.user-menu[data-variant='ai-sidebar'] .user-menu__edit,
.user-menu[data-variant='ai-sidebar'] .user-menu__actions button,
.user-menu[data-variant='ai-sidebar'] .user-menu__logout { border: 0; background: transparent; color: var(--color-accent-strong); cursor: pointer; }
.user-menu[data-variant='ai-sidebar'] .user-menu__edit { flex-shrink: 0; padding: 4px 2px; font-size: 0.78rem; }
.user-menu[data-variant='ai-sidebar'] .user-menu__logout { margin-top: 14px; padding: 12px 0 0; border-top-color: var(--color-border-subtle); font-size: 0.82rem; }
</style>
