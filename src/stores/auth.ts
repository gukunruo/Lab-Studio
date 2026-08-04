import { defineStore } from 'pinia'
import { ref } from 'vue'

interface AuthResponse {
  authenticated: boolean
  username?: string
}

export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const username = ref('')
  const checking = ref(true)
  const error = ref('')

  async function restore(): Promise<boolean> {
    checking.value = true
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await res.json() as AuthResponse
      authenticated.value = data.authenticated
      username.value = data.username ?? ''
      return authenticated.value
    } catch {
      authenticated.value = false
      username.value = ''
      return false
    } finally {
      checking.value = false
    }
  }

  async function login(user: string, password: string): Promise<boolean> {
    error.value = ''
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user, password }),
    })
    if (!res.ok) {
      error.value = '账号或密码错误'
      authenticated.value = false
      return false
    }
    const data = await res.json() as AuthResponse
    authenticated.value = data.authenticated
    username.value = data.username ?? user
    return authenticated.value
  }

  async function logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    authenticated.value = false
    username.value = ''
  }

  return { authenticated, username, checking, error, restore, login, logout }
})
