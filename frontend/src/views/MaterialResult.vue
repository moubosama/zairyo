<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">資材リスト</h2>
      <p class="text-gray-400">{{ store.currentProject?.name }}</p>
    </div>

    <!-- Total Amount -->
    <div class="card mb-6 bg-gradient-to-r from-dark-700 to-dark-600 border-gold">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm text-gray-400">概算合計金額</div>
          <div class="text-3xl font-bold text-gold">¥{{ totalAmount.toLocaleString() }}</div>
        </div>
        <div class="text-sm text-gray-400">
          ※ 単価設定に基づく参考値です
        </div>
      </div>
    </div>

    <!-- Area Summary -->
    <div class="grid md:grid-cols-4 gap-4 mb-8">
      <div class="card text-center">
        <div class="text-3xl font-bold text-gold">{{ formatArea(store.areas?.wall_area) }}</div>
        <div class="text-sm text-gray-400">壁面積（㎡）</div>
      </div>
      <div class="card text-center">
        <div class="text-3xl font-bold text-gold">{{ formatArea(store.areas?.ceiling_area) }}</div>
        <div class="text-sm text-gray-400">天井面積（㎡）</div>
      </div>
      <div class="card text-center">
        <div class="text-3xl font-bold text-gold">{{ formatArea(store.areas?.floor_area) }}</div>
        <div class="text-sm text-gray-400">居室床面積（㎡）</div>
      </div>
      <div class="card text-center">
        <div class="text-3xl font-bold text-gold">{{ formatArea(store.areas?.water_floor_area) }}</div>
        <div class="text-sm text-gray-400">水回り床面積（㎡）</div>
      </div>
    </div>

    <!-- Material Table -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium">資材一覧</h3>
        <div class="flex gap-2">
          <button @click="copyToClipboard" class="btn-secondary text-sm">
            📋 コピー
          </button>
          <button @click="exportExcel" class="btn-primary text-sm">
            📥 Excel出力
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-500 text-left">
              <th class="py-3 px-4 text-sm font-medium text-gray-400">カテゴリ</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">資材名</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">規格</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">数量</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">単位</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">単価</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(items, category) in groupedMaterials" :key="category">
              <tr
                v-for="(item, index) in items"
                :key="`${category}-${index}`"
                class="border-b border-dark-600 hover:bg-dark-600"
              >
                <td class="py-3 px-4">
                  <span v-if="index === 0" class="text-gold font-medium">{{ category }}</span>
                </td>
                <td class="py-3 px-4">{{ item.name }}</td>
                <td class="py-3 px-4 text-gray-400">{{ item.spec }}</td>
                <td class="py-3 px-4 text-right font-mono text-gold">{{ item.quantity }}</td>
                <td class="py-3 px-4 text-gray-400">{{ item.unit }}</td>
                <td class="py-3 px-4 text-right font-mono text-gray-400">
                  {{ item.unitPrice ? '¥' + item.unitPrice.toLocaleString() : '-' }}
                </td>
                <td class="py-3 px-4 text-right font-mono text-gold">
                  {{ item.amount ? '¥' + item.amount.toLocaleString() : '-' }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Fixed Items Note -->
    <div class="card mt-6 bg-dark-600">
      <h4 class="text-sm font-medium text-gold mb-2">固定値について</h4>
      <p class="text-sm text-gray-400">
        以下の資材は3現場の実績データから固定値として設定されています：
        Mクロス（7枚）、ラワンベニヤ（4枚）、巾木（約30m）
      </p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-end mt-8">
      <button @click="startNew" class="btn-primary">新規作成</button>
    </div>

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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const showToast = ref(false)
const toastMessage = ref('')

// Group materials by category
const groupedMaterials = computed(() => {
  const grouped = {}
  for (const item of store.materials) {
    if (!grouped[item.category]) {
      grouped[item.category] = []
    }
    grouped[item.category].push(item)
  }
  return grouped
})

// 合計金額
const totalAmount = computed(() => {
  return store.materials.reduce((sum, item) => sum + (item.amount || 0), 0)
})

const formatArea = (value) => {
  if (value === null || value === undefined) return 0
  return Number(value).toFixed(1)
}

const showToastMessage = (message) => {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 3000)
}

const copyToClipboard = () => {
  const lines = ['カテゴリ\t資材名\t規格\t数量\t単位\t備考']

  for (const item of store.materials) {
    lines.push(
      `${item.category}\t${item.name}\t${item.spec}\t${item.quantity}\t${item.unit}\t${item.notes || ''}`
    )
  }

  navigator.clipboard.writeText(lines.join('\n'))
  showToastMessage('クリップボードにコピーしました')
}

const exportExcel = async () => {
  try {
    await store.exportExcel()
    showToastMessage('Excelファイルをダウンロードしました')
  } catch (e) {
    console.error(e)
  }
}

const startNew = () => {
  store.reset()
  router.push('/')
}
</script>
