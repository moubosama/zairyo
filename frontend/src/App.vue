<template>
  <div class="min-h-screen bg-dark">
    <!-- Header (ログイン画面以外) -->
    <header v-if="!isLoginPage" class="border-b border-dark-500">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <router-link to="/" class="flex items-center">
            <h1 class="text-2xl font-bold">
              <span class="text-gold">ZAIRYO</span>
            </h1>
            <span class="ml-3 text-sm text-gray-400">資材拾いアシスタント</span>
          </router-link>
          <div class="flex items-center gap-4">
            <router-link
              to="/history"
              class="text-sm text-gray-400 hover:text-gold transition-colors"
            >
              履歴
            </router-link>
            <router-link
              to="/mypage"
              class="text-sm text-gray-400 hover:text-gold transition-colors"
            >
              {{ companyName || 'マイページ' }}
            </router-link>
          </div>
        </div>
      </div>
    </header>

    <!-- Step Indicator -->
    <div v-if="showSteps" class="border-b border-dark-500 bg-dark-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex items-center justify-center space-x-4">
          <template v-for="(step, index) in steps" :key="index">
            <div class="flex items-center">
              <div :class="getStepClass(index + 1)">
                {{ index + 1 }}
              </div>
              <span class="ml-2 text-sm" :class="currentStep >= index + 1 ? 'text-white' : 'text-gray-500'">
                {{ step }}
              </span>
            </div>
            <div v-if="index < steps.length - 1" class="w-12 h-px bg-dark-500"></div>
          </template>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <router-view />
    </main>

    <!-- Footer -->
    <footer class="border-t border-dark-500 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <p class="text-center text-sm text-gray-500">
          © 2026 株式会社マイニングアーツ
        </p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const steps = ['図面アップロード', '資材リスト']

const isLoginPage = computed(() => route.path === '/login')

const companyName = computed(() => {
  const company = localStorage.getItem('company')
  if (company) {
    try {
      return JSON.parse(company).name
    } catch {
      return null
    }
  }
  return null
})

const showSteps = computed(() => {
  return !isLoginPage.value && route.path !== '/history' && route.path !== '/mypage' && route.path !== '/unit-prices' && route.path !== '/product-catalog'
})

const currentStep = computed(() => {
  const stepMap = {
    '/': 1,
    '/result': 2,
  }
  return stepMap[route.path] || 1
})

const getStepClass = (step) => {
  if (step < currentStep.value) {
    return 'step-indicator-completed'
  } else if (step === currentStep.value) {
    return 'step-indicator-active'
  } else {
    return 'step-indicator-inactive'
  }
}
</script>
