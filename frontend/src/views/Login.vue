<template>
  <div class="max-w-md mx-auto px-4 py-12">
    <h2 class="text-2xl font-bold text-center mb-2">
      {{ mode === 'login' ? 'ログイン' : '会社アカウント登録' }}
    </h2>
    <p class="text-sm text-gray-400 text-center mb-8">
      ログインすると現場ごとの見積もり履歴が保存されます
    </p>

    <div class="card">
      <!-- モード切替タブ -->
      <div class="flex mb-6 border-b border-dark-500">
        <button
          @click="mode = 'login'"
          class="flex-1 pb-3 text-sm transition-colors"
          :class="mode === 'login' ? 'text-gold border-b-2 border-gold' : 'text-gray-400'"
        >
          ログイン
        </button>
        <button
          @click="mode = 'register'"
          class="flex-1 pb-3 text-sm transition-colors"
          :class="mode === 'register' ? 'text-gold border-b-2 border-gold' : 'text-gray-400'"
        >
          新規登録
        </button>
      </div>

      <div class="space-y-4">
        <div v-if="mode === 'register'">
          <label class="text-sm text-gray-400 block mb-1">招待コード</label>
          <input
            v-model="inviteCode"
            type="text"
            placeholder="運営者から受け取ったコード"
            class="w-full bg-dark-600 border border-dark-400 rounded px-3 py-2 focus:border-gold focus:outline-none mb-4"
          />
          <label class="text-sm text-gray-400 block mb-1">会社名</label>
          <input
            v-model="name"
            type="text"
            placeholder="株式会社○○"
            class="w-full bg-dark-600 border border-dark-400 rounded px-3 py-2 focus:border-gold focus:outline-none"
          />
        </div>

        <div>
          <label class="text-sm text-gray-400 block mb-1">メールアドレス</label>
          <input
            v-model="email"
            type="email"
            placeholder="info@example.com"
            class="w-full bg-dark-600 border border-dark-400 rounded px-3 py-2 focus:border-gold focus:outline-none"
            @keyup.enter="submit"
          />
        </div>

        <div>
          <label class="text-sm text-gray-400 block mb-1">パスワード{{ mode === 'register' ? '（6文字以上）' : '' }}</label>
          <input
            v-model="password"
            type="password"
            class="w-full bg-dark-600 border border-dark-400 rounded px-3 py-2 focus:border-gold focus:outline-none"
            @keyup.enter="submit"
          />
        </div>

        <p v-if="auth.error" class="text-sm text-red-400">{{ auth.error }}</p>

        <button
          @click="submit"
          :disabled="auth.loading || !canSubmit"
          class="btn-primary w-full"
        >
          {{ auth.loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する' }}
        </button>

        <button @click="continueAsGuest" class="w-full text-sm text-gray-400 hover:text-gold transition-colors pt-2">
          ログインせずに使う（履歴は保存されません）
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const mode = ref('login')
const name = ref('')
const inviteCode = ref('')
const email = ref('')
const password = ref('')

const canSubmit = computed(() => {
  if (!email.value.trim() || !password.value) return false
  if (mode.value === 'register' && !name.value.trim()) return false
  return true
})

async function submit() {
  if (!canSubmit.value) return
  const ok = mode.value === 'login'
    ? await auth.login(email.value.trim(), password.value)
    : await auth.register(name.value.trim(), email.value.trim(), password.value, inviteCode.value.trim())
  if (ok) {
    router.push(route.query.redirect || '/')
  }
}

function continueAsGuest() {
  router.push('/')
}
</script>
