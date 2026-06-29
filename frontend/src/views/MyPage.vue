<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">マイページ</h2>
      <p class="text-gray-400">{{ company?.name }}</p>
    </div>

    <!-- 会社情報 -->
    <div class="card mb-6">
      <h3 class="text-lg font-medium text-gold mb-4">会社情報</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <span class="text-sm text-gray-400">会社名</span>
          <p class="text-lg">{{ company?.name }}</p>
        </div>
        <div>
          <span class="text-sm text-gray-400">メールアドレス</span>
          <p class="text-lg">{{ company?.email }}</p>
        </div>
      </div>
    </div>

    <!-- メニュー -->
    <div class="grid md:grid-cols-2 gap-4 mb-6">
      <router-link to="/product-catalog" class="card hover:border-gold transition-colors cursor-pointer">
        <div class="flex items-center gap-4">
          <div class="text-3xl">🛒</div>
          <div>
            <h4 class="font-medium">商品カタログ設定</h4>
            <p class="text-sm text-gray-400">使用する設備・商品を選択</p>
          </div>
        </div>
      </router-link>

      <router-link to="/unit-prices" class="card hover:border-gold transition-colors cursor-pointer">
        <div class="flex items-center gap-4">
          <div class="text-3xl">💰</div>
          <div>
            <h4 class="font-medium">単価設定</h4>
            <p class="text-sm text-gray-400">資材の単価を設定・編集</p>
          </div>
        </div>
      </router-link>

      <router-link to="/history" class="card hover:border-gold transition-colors cursor-pointer">
        <div class="flex items-center gap-4">
          <div class="text-3xl">📋</div>
          <div>
            <h4 class="font-medium">プロジェクト履歴</h4>
            <p class="text-sm text-gray-400">過去のプロジェクトを確認</p>
          </div>
        </div>
      </router-link>
    </div>

    <!-- ログアウト -->
    <div class="text-center">
      <button @click="handleLogout" class="btn-secondary">
        ログアウト
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const company = ref(null)

onMounted(() => {
  const stored = localStorage.getItem('company')
  if (stored) {
    company.value = JSON.parse(stored)
  }
})

const handleLogout = () => {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('company')
  router.push('/login')
}
</script>
