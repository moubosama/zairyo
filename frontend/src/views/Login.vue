<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="card w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gold">ZAIRYO</h1>
        <p class="text-gray-400 mt-2">資材拾いアシスタント</p>
      </div>

      <!-- タブ切り替え -->
      <div class="flex mb-6 border-b border-dark-500">
        <button
          @click="isLogin = true"
          :class="[
            'flex-1 py-3 text-center transition-colors',
            isLogin ? 'text-gold border-b-2 border-gold' : 'text-gray-400'
          ]"
        >
          ログイン
        </button>
        <button
          @click="isLogin = false"
          :class="[
            'flex-1 py-3 text-center transition-colors',
            !isLogin ? 'text-gold border-b-2 border-gold' : 'text-gray-400'
          ]"
        >
          新規登録
        </button>
      </div>

      <!-- エラー表示 -->
      <div v-if="error" class="bg-red-900/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
        {{ error }}
      </div>

      <!-- ログインフォーム -->
      <form v-if="isLogin" @submit.prevent="handleLogin">
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">メールアドレス</label>
          <input
            v-model="loginForm.email"
            type="email"
            class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold"
            placeholder="example@company.com"
            required
          />
        </div>
        <div class="mb-6">
          <label class="block text-sm text-gray-400 mb-2">パスワード</label>
          <input
            v-model="loginForm.password"
            type="password"
            class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold"
            placeholder="••••••••"
            required
          />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full btn-primary py-3"
        >
          {{ loading ? 'ログイン中...' : 'ログイン' }}
        </button>
      </form>

      <!-- 新規登録フォーム -->
      <form v-else @submit.prevent="handleRegister">
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">会社名</label>
          <input
            v-model="registerForm.name"
            type="text"
            class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold"
            placeholder="株式会社サンプル"
            required
          />
        </div>
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">メールアドレス</label>
          <input
            v-model="registerForm.email"
            type="email"
            class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold"
            placeholder="example@company.com"
            required
          />
        </div>
        <div class="mb-6">
          <label class="block text-sm text-gray-400 mb-2">パスワード（6文字以上）</label>
          <input
            v-model="registerForm.password"
            type="password"
            class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold"
            placeholder="••••••••"
            minlength="6"
            required
          />
        </div>
        <button
          type="submit"
          :disabled="loading"
          class="w-full btn-primary py-3"
        >
          {{ loading ? '登録中...' : '新規登録' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '../services/api'

const router = useRouter()

const isLogin = ref(true)
const loading = ref(false)
const error = ref('')

const loginForm = ref({
  email: '',
  password: ''
})

const registerForm = ref({
  name: '',
  email: '',
  password: ''
})

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    const response = await api.login(loginForm.value)
    localStorage.setItem('auth_token', response.data.token)
    localStorage.setItem('company', JSON.stringify(response.data.company))
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  loading.value = true
  error.value = ''

  try {
    const response = await api.register(registerForm.value)
    localStorage.setItem('auth_token', response.data.token)
    localStorage.setItem('company', JSON.stringify(response.data.company))
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.error || '登録に失敗しました'
  } finally {
    loading.value = false
  }
}
</script>
