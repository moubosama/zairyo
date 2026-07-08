<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">運営者ダッシュボード</h2>
      <p class="text-gray-400 text-sm">このページは運営者専用です（ADMIN_TOKENが必要）</p>
    </div>

    <!-- Token Input -->
    <div v-if="!authorized" class="card max-w-md mx-auto">
      <h3 class="text-lg font-medium mb-4">管理トークン</h3>
      <form @submit.prevent="connect" class="space-y-4">
        <input
          v-model="tokenInput"
          type="password"
          placeholder="ADMIN_TOKEN"
          required
          class="input w-full"
        />
        <div v-if="error" class="text-sm text-red-400">{{ error }}</div>
        <button type="submit" :disabled="loading" class="btn-primary w-full disabled:opacity-50">
          {{ loading ? '確認中...' : '接続' }}
        </button>
      </form>
    </div>

    <!-- Dashboard -->
    <template v-else>
      <div class="flex items-center justify-between mb-6">
        <div class="text-sm text-gray-400">
          会社数: <span class="text-gold font-mono">{{ companies.length }}</span>
          ／ ゲストプロジェクト: <span class="text-gold font-mono">{{ guestProjectCount }}</span>件
        </div>
        <div class="flex gap-2">
          <button @click="load" class="btn-secondary text-sm">🔄 更新</button>
          <button @click="disconnect" class="text-sm text-gray-400 hover:text-gold">切断</button>
        </div>
      </div>

      <!-- Reset Result -->
      <div v-if="resetResult" class="card mb-6 border-gold">
        <div class="flex items-start justify-between">
          <div>
            <div class="text-gold font-medium mb-1">{{ resetResult.message }}</div>
            <div class="text-sm text-gray-400">{{ resetResult.email }}</div>
            <div class="mt-2 font-mono text-lg bg-dark-600 rounded px-3 py-2 inline-block">
              {{ resetResult.newPassword }}
            </div>
            <p class="text-xs text-red-400 mt-2">
              ※ このパスワードは今しか表示されません。今すぐ会社に伝えてください。
            </p>
          </div>
          <div class="flex gap-2">
            <button @click="copyPassword" class="btn-secondary text-sm">📋 コピー</button>
            <button @click="resetResult = null" class="text-gray-400 hover:text-white">✕</button>
          </div>
        </div>
      </div>

      <div v-if="error" class="card mb-6 text-red-400">{{ error }}</div>

      <!-- Companies -->
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-dark-500 text-left">
                <th class="py-3 px-4 text-sm font-medium text-gray-400">ID</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400">会社名</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400">メール</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400">登録日</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">案件数</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400">最終利用</th>
                <th class="py-3 px-4 text-sm font-medium text-gray-400"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="c in companies" :key="c.id">
                <tr
                  class="border-b border-dark-600 hover:bg-dark-600 cursor-pointer"
                  @click="expanded = expanded === c.id ? null : c.id"
                >
                  <td class="py-3 px-4 font-mono text-gray-400">{{ c.id }}</td>
                  <td class="py-3 px-4">{{ c.name }}</td>
                  <td class="py-3 px-4 text-gray-400 text-sm">{{ c.email }}</td>
                  <td class="py-3 px-4 text-gray-400 text-sm">{{ formatDate(c.createdAt) }}</td>
                  <td class="py-3 px-4 text-right font-mono text-gold">{{ c.projectCount }}</td>
                  <td class="py-3 px-4 text-gray-400 text-sm">
                    {{ c.lastProjectAt ? formatDate(c.lastProjectAt) : '-' }}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button
                      @click.stop="resetPassword(c)"
                      :disabled="resettingId === c.id"
                      class="text-xs px-2 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                    >
                      {{ resettingId === c.id ? '処理中...' : 'PWリセット' }}
                    </button>
                  </td>
                </tr>
                <!-- Recent Projects (expanded) -->
                <tr v-if="expanded === c.id" class="border-b border-dark-600 bg-dark-700">
                  <td></td>
                  <td colspan="6" class="py-2 px-4">
                    <div v-if="c.recentProjects.length === 0" class="text-sm text-gray-500 py-1">
                      プロジェクトはまだありません
                    </div>
                    <div
                      v-for="p in c.recentProjects"
                      :key="p.id"
                      class="text-sm text-gray-400 py-1"
                    >
                      <span class="font-mono text-gray-500">#{{ p.id }}</span>
                      {{ p.name }}
                      <span class="text-gray-500 ml-2">{{ formatDate(p.createdAt) }}</span>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Toast -->
    <div
      v-if="showToast"
      class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg fade-in"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '@/services/api'

const TOKEN_KEY = 'zairyo_admin_token'

const tokenInput = ref('')
const adminToken = ref(sessionStorage.getItem(TOKEN_KEY) || '')
const authorized = ref(false)
const loading = ref(false)
const error = ref(null)
const companies = ref([])
const guestProjectCount = ref(0)
const expanded = ref(null)
const resettingId = ref(null)
const resetResult = ref(null)
const showToast = ref(false)
const toastMessage = ref('')

onMounted(() => {
  if (adminToken.value) load()
})

async function connect() {
  adminToken.value = tokenInput.value.trim()
  await load()
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const response = await api.adminFetchCompanies(adminToken.value)
    companies.value = response.data.companies
    guestProjectCount.value = response.data.guestProjectCount
    authorized.value = true
    sessionStorage.setItem(TOKEN_KEY, adminToken.value)
  } catch (e) {
    authorized.value = false
    sessionStorage.removeItem(TOKEN_KEY)
    error.value = e.response?.status === 403
      ? 'トークンが正しくありません'
      : e.response?.status === 404
        ? 'admin APIが無効です（ADMIN_TOKEN未設定）'
        : '接続に失敗しました'
  } finally {
    loading.value = false
  }
}

function disconnect() {
  authorized.value = false
  adminToken.value = ''
  tokenInput.value = ''
  companies.value = []
  sessionStorage.removeItem(TOKEN_KEY)
}

async function resetPassword(company) {
  if (!window.confirm(`「${company.name}」(${company.email}) のパスワードをリセットしますか？\n新しいパスワードがランダム生成されます。`)) {
    return
  }

  resettingId.value = company.id
  error.value = null
  try {
    const response = await api.adminResetPassword(adminToken.value, company.id)
    resetResult.value = response.data
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (e) {
    error.value = e.response?.data?.error || 'パスワードリセットに失敗しました'
  } finally {
    resettingId.value = null
  }
}

function copyPassword() {
  if (!resetResult.value) return
  navigator.clipboard.writeText(resetResult.value.newPassword)
  toastMessage.value = 'パスワードをコピーしました'
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 3000)
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
</script>
