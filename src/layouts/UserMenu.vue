<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { PhCaretDown } from '@phosphor-icons/vue'

const root = ref<HTMLElement | null>(null)

const auth = useAuthStore()
const open = ref(false)
const editing = ref(false)
const displayName = ref('')
const avatarUrl = ref('')
const saving = ref(false)

function toggle() {
  open.value = !open.value
  if (open.value) {
    displayName.value = auth.username
    avatarUrl.value = auth.avatarUrl
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

onMounted(() => {
  document.addEventListener('mousedown', closeOnOutside)
  document.addEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closeOnOutside)
  document.removeEventListener('keydown', closeOnEscape)
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
    <div v-if="open" class="user-menu__panel" role="menu">
      <div v-if="!editing" class="user-menu__summary">
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
.user-menu__trigger { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.25rem 0.5rem 0.25rem 0.25rem; border: 1px solid var(--color-border); border-radius: var(--radius-full); background: var(--color-surface); color: var(--color-text); }
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
</style>
