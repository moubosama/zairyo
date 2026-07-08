<template>
  <div class="fade-in max-w-lg mx-auto">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">アカウント設定</h2>
    </div>

    <!-- Company Info -->
    <div class="card mb-6">
      <h3 class="text-lg font-medium mb-4">会社情報</h3>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-400">会社名</span>
          <span>{{ auth.company?.name }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">メールアドレス</span>
          <span>{{ auth.company?.email }}</span>
        </div>
      </div>
    </div>

    <!-- Password Change -->
    <div class="card">
      <h3 class="text-lg font-medium mb-4">パスワード変更</h3>
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-1">現在のパスワード</label>
          <input
            v-model="currentPassword"
            type="password"
            required
            autocomplete="current-password"
            class="input w-full"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">新しいパスワード（8文字以上）</label>
          <input
            v-model="newPassword"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            class="input w-full"
          />
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-1">新しいパスワード（確認）</label>
          <input
            v-model="newPasswordConfirm"
            type="password"
            required
            autocomplete="new-password"
            class="input w-full"
          />
        </div>

        <div v-if="error" class="text-sm text-red-400">{{ error }}</div>
        <div v-if="success" class="text-sm text-green-400">{{ success }}</div>

        <button type="submit" :disabled="submitting" class="btn-primary w-full disabled:opacity-50">
          {{ submitting ? '変更中...' : 'パスワードを変更' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import * as api from '@/services/api'

const auth = useAuthStore()

const currentPassword = ref('')
const newPassword = ref('')
const newPasswordConfirm = ref('')
const submitting = ref(false)
const error = ref(null)
const success = ref(null)

async function submit() {
  error.value = null
  success.value = null

  if (newPassword.value !== newPasswordConfirm.value) {
    error.value = '新しいパスワードが一致しません'
    return
  }

  submitting.value = true
  try {
    await api.changePassword({
      current_password: currentPassword.value,
      new_password: newPassword.value,
    })
    success.value = 'パスワードを変更しました'
    currentPassword.value = ''
    newPassword.value = ''
    newPasswordConfirm.value = ''
  } catch (e) {
    error.value = api.apiErrorMessage(e, 'パスワードの変更に失敗しました')
  } finally {
    submitting.value = false
  }
}
</script>
