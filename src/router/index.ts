import { createRouter, createWebHistory } from 'vue-router'
import LabShell from '@/layouts/LabShell.vue'
import LabHome from '@/views/LabHome.vue'
import { experiments } from '@/experiments/_registry'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: LabShell,
      children: [
        { path: '', name: 'home', component: LabHome },
        {
          path: ':slug',
          name: 'experiment',
          component: () => import('@/views/ExperimentView.vue'),
          props: true,
          beforeEnter: (to) => {
            if (!experiments.some((e) => e.slug === to.params.slug)) {
              return { name: 'home' }
            }
          },
        },
      ],
    },
  ],
})

export default router
