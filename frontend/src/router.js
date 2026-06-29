import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import MaterialResult from './views/MaterialResult.vue'
import ProjectHistory from './views/ProjectHistory.vue'
import Login from './views/Login.vue'
import MyPage from './views/MyPage.vue'
import UnitPrices from './views/UnitPrices.vue'
import ProductCatalog from './views/ProductCatalog.vue'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { public: true }
  },
  {
    path: '/',
    name: 'home',
    component: Home,
  },
  {
    path: '/mypage',
    name: 'mypage',
    component: MyPage,
  },
  {
    path: '/unit-prices',
    name: 'unit-prices',
    component: UnitPrices,
  },
  {
    path: '/product-catalog',
    name: 'product-catalog',
    component: ProductCatalog,
  },
  {
    path: '/history',
    name: 'project-history',
    component: ProjectHistory,
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

// 認証ガード
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('auth_token')
  const isPublic = to.meta.public

  if (!token && !isPublic) {
    next('/login')
  } else if (token && to.path === '/login') {
    next('/')
  } else {
    next()
  }
})

export default router
