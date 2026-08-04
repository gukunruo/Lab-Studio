import { createRouter, createWebHistory } from 'vue-router'
import LabShell from '@/layouts/LabShell.vue'
import LabHome from '@/views/LabHome.vue'
import { apps } from '@/apps/_registry'
import { worlds } from '@/worlds/_registry'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
            if (!apps.some((e) => e.slug === to.params.slug)) {
              return { name: 'home' }
            }
          },
        },
      ],
    },
  ],
})

export default router
