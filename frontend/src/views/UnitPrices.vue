<template>
  <div class="fade-in">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-bold">単価設定</h2>
        <p class="text-gray-400">資材の単価を設定・編集できます</p>
      </div>
      <router-link to="/mypage" class="btn-secondary text-sm">
        ← 戻る
      </router-link>
    </div>

    <!-- アクションボタン -->
    <div class="flex flex-wrap gap-3 mb-6">
      <button @click="showImportModal = true" class="btn-secondary text-sm">
        📤 Excelインポート
      </button>
      <button @click="handleExport" class="btn-secondary text-sm">
        📥 Excelエクスポート
      </button>
      <button @click="showResetModal = true" class="btn-secondary text-sm text-red-400">
        🔄 標準単価にリセット
      </button>
      <button @click="showAddModal = true" class="btn-primary text-sm">
        ＋ 単価追加
      </button>
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="text-center py-12">
      <div class="spinner mx-auto mb-4"></div>
      <p class="text-gray-400">読み込み中...</p>
    </div>

    <!-- 単価テーブル -->
    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-500 text-left">
              <th class="py-3 px-4 text-sm font-medium text-gray-400">カテゴリ</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">資材名</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">規格</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">単価 <span class="text-gold text-xs">(クリックで編集)</span></th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">単位</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 w-24"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="price in unitPrices"
              :key="price.id"
              class="border-b border-dark-600 hover:bg-dark-600"
            >
              <td class="py-3 px-4 text-gold">{{ price.category }}</td>
              <td class="py-3 px-4">{{ price.materialName }}</td>
              <td class="py-3 px-4 text-gray-400">{{ price.spec || '-' }}</td>
              <td class="py-3 px-4 text-right">
                <input
                  v-if="editingId === price.id"
                  v-model.number="editingPrice"
                  type="number"
                  class="w-24 bg-dark-600 border border-gold rounded px-2 py-1 text-right font-mono"
                  @keyup.enter="saveEdit(price.id)"
                  @keyup.esc="cancelEdit"
                />
                <span
                  v-else
                  class="font-mono text-gold cursor-pointer px-2 py-1 rounded border border-dashed border-dark-400 hover:border-gold hover:bg-dark-600 transition-all inline-block"
                  @click="startEdit(price)"
                  title="クリックして編集"
                >
                  ¥{{ price.unitPrice.toLocaleString() }}
                </span>
              </td>
              <td class="py-3 px-4 text-gray-400">{{ price.unit }}</td>
              <td class="py-3 px-4">
                <div v-if="editingId === price.id" class="flex gap-2">
                  <button @click="saveEdit(price.id)" class="text-green-400 text-sm">保存</button>
                  <button @click="cancelEdit" class="text-gray-400 text-sm">取消</button>
                </div>
                <button
                  v-else
                  @click="handleDelete(price.id)"
                  class="text-red-400 text-sm hover:text-red-300"
                >
                  削除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- インポートモーダル -->
    <div v-if="showImportModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card w-full max-w-md">
        <h3 class="text-lg font-medium mb-4">Excelインポート</h3>
        <p class="text-sm text-gray-400 mb-4">
          Excelファイル（.xlsx）をアップロードしてください。<br>
          1行目はヘッダー（資材名、規格、カテゴリ、単価、単位）として扱います。
        </p>
        <input
          type="file"
          accept=".xlsx"
          @change="handleImportFile"
          class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 text-white mb-4"
        />
        <div class="flex gap-3 justify-end">
          <button @click="showImportModal = false" class="btn-secondary">キャンセル</button>
          <button @click="handleImport" :disabled="!importFile" class="btn-primary">インポート</button>
        </div>
      </div>
    </div>

    <!-- リセット確認モーダル -->
    <div v-if="showResetModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card w-full max-w-md">
        <h3 class="text-lg font-medium mb-4">標準単価にリセット</h3>
        <p class="text-sm text-gray-400 mb-4">
          現在の単価設定をすべて削除し、標準単価に戻します。<br>
          この操作は取り消せません。
        </p>
        <div class="flex gap-3 justify-end">
          <button @click="showResetModal = false" class="btn-secondary">キャンセル</button>
          <button @click="handleReset" class="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg">
            リセット実行
          </button>
        </div>
      </div>
    </div>

    <!-- 単価追加モーダル -->
    <div v-if="showAddModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card w-full max-w-md">
        <h3 class="text-lg font-medium mb-4">単価追加</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">資材名 *</label>
            <input v-model="newPrice.materialName" type="text" class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-2" />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">規格</label>
            <input v-model="newPrice.spec" type="text" class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-2" />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">カテゴリ</label>
            <input v-model="newPrice.category" type="text" class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-2" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">単価 *</label>
              <input v-model.number="newPrice.unitPrice" type="number" class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-2" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">単位 *</label>
              <input v-model="newPrice.unit" type="text" class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-2" placeholder="枚、㎡、m" />
            </div>
          </div>
        </div>
        <div class="flex gap-3 justify-end mt-6">
          <button @click="showAddModal = false" class="btn-secondary">キャンセル</button>
          <button @click="handleAdd" class="btn-primary">追加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as api from '../services/api'

const unitPrices = ref([])
const loading = ref(true)

const editingId = ref(null)
const editingPrice = ref(0)

const showImportModal = ref(false)
const showResetModal = ref(false)
const showAddModal = ref(false)

const importFile = ref(null)

const newPrice = ref({
  materialName: '',
  spec: '',
  category: '',
  unitPrice: 0,
  unit: ''
})

const fetchPrices = async () => {
  loading.value = true
  try {
    const response = await api.fetchUnitPrices()
    unitPrices.value = response.data
  } catch (e) {
    console.error('Failed to fetch unit prices:', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchPrices)

const startEdit = (price) => {
  editingId.value = price.id
  editingPrice.value = price.unitPrice
}

const cancelEdit = () => {
  editingId.value = null
  editingPrice.value = 0
}

const saveEdit = async (id) => {
  try {
    await api.updateUnitPrice(id, editingPrice.value)
    await fetchPrices()
    cancelEdit()
  } catch (e) {
    console.error('Failed to update unit price:', e)
  }
}

const handleDelete = async (id) => {
  if (!confirm('この単価を削除しますか？')) return
  try {
    await api.deleteUnitPrice(id)
    await fetchPrices()
  } catch (e) {
    console.error('Failed to delete unit price:', e)
  }
}

const handleImportFile = (e) => {
  importFile.value = e.target.files[0]
}

const handleImport = async () => {
  if (!importFile.value) return
  const formData = new FormData()
  formData.append('file', importFile.value)
  try {
    await api.importUnitPrices(formData)
    await fetchPrices()
    showImportModal.value = false
    importFile.value = null
  } catch (e) {
    console.error('Failed to import:', e)
    alert('インポートに失敗しました')
  }
}

const handleExport = async () => {
  try {
    const response = await api.exportUnitPrices()
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'unit_prices.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Failed to export:', e)
  }
}

const handleReset = async () => {
  try {
    await api.resetUnitPrices()
    await fetchPrices()
    showResetModal.value = false
  } catch (e) {
    console.error('Failed to reset:', e)
  }
}

const handleAdd = async () => {
  if (!newPrice.value.materialName || !newPrice.value.unitPrice || !newPrice.value.unit) {
    alert('資材名、単価、単位は必須です')
    return
  }
  try {
    await api.createUnitPrice(newPrice.value)
    await fetchPrices()
    showAddModal.value = false
    newPrice.value = { materialName: '', spec: '', category: '', unitPrice: 0, unit: '' }
  } catch (e) {
    console.error('Failed to add:', e)
  }
}
</script>
