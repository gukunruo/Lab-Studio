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
      path: '/finance/boards',
      name: 'finance-boards',
      component: () => import('@/views/FinanceBoardsView.vue'),
    },
    {
      path: '/finance',
      name: 'finance',
      component: () => import('@/views/FinanceView.vue'),
    },
    {
      path: '/ai',
      name: 'ai-platform',
      component: () => import('@/views/AiPlatformView.vue'),
    },
    {
      path: '/bloub',
      name: 'bloub',
      component: () => import('@/views/BloubView.vue'),
    },
    {
      path: '/',
      component: LabShell,
      children: [
        { path: '', name: 'home', component: LabHome },
        {
          path: 'learn',
          children: [
            {
              path: '',
              name: 'learn',
              component: () => import('@/views/LearnShelfView.vue'),
            },
            {
              path: 'academy',
              name: 'learn-academy',
              component: () => import('@/views/LearnView.vue'),
            },
            {
              path: 'claude-code',
              name: 'learn-claude-code',
              component: () => import('@/views/CcCourseView.vue'),
            },
          ],
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
            if (!apps.some((e) => e.slug === to.params.slug)) {
              return { name: 'home' }
            }
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
