import { createRouter, createWebHistory } from 'vue-router'
import PackageSelect from './views/PackageSelect.vue'
import PlanUpload from './views/PlanUpload.vue'
import SpecConfirm from './views/SpecConfirm.vue'
import MaterialResult from './views/MaterialResult.vue'
import ProjectHistory from './views/ProjectHistory.vue'

const routes = [
  {
    path: '/',
    name: 'package-select',
    component: PackageSelect,
  },
  {
    path: '/history',
    name: 'project-history',
    component: ProjectHistory,
  },
  {
    path: '/upload',
    name: 'plan-upload',
    component: PlanUpload,
  },
  {
    path: '/confirm',
    name: 'spec-confirm',
    component: SpecConfirm,
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
