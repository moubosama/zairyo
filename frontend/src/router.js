import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import MaterialResult from './views/MaterialResult.vue'
import ProjectHistory from './views/ProjectHistory.vue'
import Login from './views/Login.vue'
import UnitPriceSettings from './views/UnitPriceSettings.vue'
import AccountSettings from './views/AccountSettings.vue'
import AdminDashboard from './views/AdminDashboard.vue'

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
  {
    path: '/settings/prices',
    name: 'unit-price-settings',
    component: UnitPriceSettings,
    meta: { requiresAuth: true },
  },
  {
    path: '/settings/account',
    name: 'account-settings',
    component: AccountSettings,
    meta: { requiresAuth: true },
  },
  {
    // 運営者専用（ナビには出さない。認証はX-Admin-Tokenで画面内で行う）
    path: '/admin',
    name: 'admin-dashboard',
    component: AdminDashboard,
  },
  {
    // 未定義URLは空白ページにせずホームへ
    path: '/:pathMatch(.*)*',
    redirect: '/',
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
