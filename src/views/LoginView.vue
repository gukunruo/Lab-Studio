<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value || !password.value || submitting.value) return
  submitting.value = true
  const ok = await auth.login(username.value, password.value)
  submitting.value = false
  if (ok) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  }
}
</script>

<template>
  <main class="login">
    <section class="login__card">
      <svg class="login__logo" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <mask id="login-lab-mask">
            <rect width="100" height="100" fill="white" />
            <g stroke="black" stroke-width="5" stroke-linecap="round">
              <line x1="50" y1="50" x2="65.7" y2="23.4" />
              <line x1="50" y1="50" x2="81.45" y2="50" />
              <line x1="50" y1="50" x2="65.7" y2="76.6" />
              <line x1="50" y1="50" x2="34.3" y2="76.6" />
              <line x1="50" y1="50" x2="18.55" y2="50" />
              <line x1="50" y1="50" x2="34.3" y2="23.4" />
            </g>
          </mask>
        </defs>
        <polygon points="50,8 87,29.5 87,70.5 50,92 13,70.5 13,29.5" fill="currentColor" mask="url(#login-lab-mask)" />
        <circle cx="50" cy="50" r="8" fill="var(--color-accent)" />
      </svg>
      <p class="login__eyebrow">LAB STUDIO</p>
      <h1>欢迎回来</h1>
      <form class="login__form" @submit.prevent="submit">
        <label>
          <span>账号</span>
          <input v-model="username" autocomplete="username" autofocus required />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="auth.error" class="login__error" role="alert">{{ auth.error }}</p>
        <button type="submit" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录 Lab Studio' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped lang="scss">
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background:
    radial-gradient(circle at 20% 10%, rgba(var(--color-accent-rgb), 0.13), transparent 38%),
    var(--color-bg);
}

.login__card {
  width: min(100%, 390px);
  padding: clamp(2rem, 7vw, 3.5rem);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.08);
}

.login__logo {
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-5);
  color: var(--color-text);
}

.login__eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-accent-strong);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
}

h1 {
  font-size: clamp(1.8rem, 5vw, 2.35rem);
  letter-spacing: -0.04em;
}

.login__intro {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  line-height: 1.6;
}

.login__form {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-7);
}

label {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

input {
  width: 100%;
  padding: 0.72rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  outline: none;
}

input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb), 0.14);
}

button {
  margin-top: var(--space-2);
  padding: 0.78rem 1rem;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-weight: 700;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.login__error {
  color: var(--color-danger);
  font-size: 0.82rem;
}
</style>
