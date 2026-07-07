import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import MaterialResult from './views/MaterialResult.vue'
import ProjectHistory from './views/ProjectHistory.vue'
import Login from './views/Login.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
  },
  {
    path: '/login',
    name: 'login',
    component: Login,
  },
  {
    path: '/history',
    name: 'project-history',
    component: ProjectHistory,
    meta: { requiresAuth: true },
  },
  {
    path: '/result',
    name: 'material-result',
    component: MaterialResult,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 履歴はログイン必須（ゲストは履歴を持たないため）
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !localStorage.getItem('zairyo_token')) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

export default router
