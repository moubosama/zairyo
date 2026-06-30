import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import MaterialResult from './views/MaterialResult.vue'
import ProjectHistory from './views/ProjectHistory.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
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

export default router
