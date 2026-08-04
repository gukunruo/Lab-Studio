import { createRouter, createWebHistory } from 'vue-router'
import LabShell from '@/layouts/LabShell.vue'
import LabHome from '@/views/LabHome.vue'
import { apps } from '@/apps/_registry'
import { worlds } from '@/worlds/_registry'
import { useAuthStore } from '@/stores/auth'
import LoginView from '@/views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    {
      path: '/',
      component: LabShell,
      children: [
        { path: '', name: 'home', component: LabHome },
        {
          path: 'learn',
          name: 'learn',
          component: () => import('@/views/LearnView.vue'),
        },
        {
          path: '3d',
          name: 'world-home',
          component: () => import('@/views/WorldHome.vue'),
        },
        {
          path: '3d/:slug',
          name: 'world',
          component: () => import('@/views/WorldView.vue'),
          props: true,
          beforeEnter: (to) => {
            if (!worlds.some((e) => e.slug === to.params.slug)) {
              return { name: 'world-home' }
            }
          },
        },
        {
          path: ':slug',
          name: 'app',
          component: () => import('@/views/AppView.vue'),
          props: true,
          beforeEnter: (to) => {
            const app = apps.find((e) => e.slug === to.params.slug)
            if (!app) return { name: 'home' }
            if (app.entry === 'direct') return { name: 'app-direct', params: { slug: app.slug } }
          },
        },
        {
          path: ':slug/direct',
          name: 'app-direct',
          component: () => import('@/views/AppDirectView.vue'),
          props: true,
          beforeEnter: (to) => {
            const app = apps.find((e) => e.slug === to.params.slug)
            if (!app) return { name: 'home' }
            if (app.entry !== 'direct') return { name: 'app', params: { slug: app.slug } }
          },
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.checking) await auth.restore()
  if (to.meta.public) {
    if (to.name === 'login' && auth.authenticated) return { name: 'home' }
    return true
  }
  if (!auth.authenticated) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

export default router
