<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">単価設定</h2>
      <p class="text-gray-400">
        自社の仕入れ値に合わせて単価をカスタマイズできます。空欄の資材は標準単価が使われます。
      </p>
    </div>

    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 mb-6">
      <div class="flex gap-2">
        <button @click="downloadExcel" class="btn-secondary text-sm">📥 Excel出力</button>
        <label class="btn-secondary text-sm cursor-pointer">
          📤 Excelインポート
          <input type="file" accept=".xlsx" class="hidden" @change="importExcel" />
        </label>
        <button @click="resetAll" class="text-sm px-3 py-2 rounded border border-red-800 text-red-400 hover:bg-red-900/30">
          全て標準に戻す
        </button>
      </div>
      <button
        @click="saveAll"
        :disabled="!dirtyCount || saving"
        class="btn-primary text-sm disabled:opacity-50"
      >
        {{ saving ? '保存中...' : `💾 変更を保存（${dirtyCount}件）` }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="spinner mx-auto mb-4"></div>
      <p class="text-gray-400">読み込み中...</p>
    </div>

    <!-- Price Table -->
    <div v-else class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-500 text-left">
              <th class="py-3 px-4 text-sm font-medium text-gray-400">カテゴリ</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">資材名</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">規格</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">単位</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">標準単価</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400 text-right">自社単価</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(items, category) in groupedRows" :key="category">
              <tr
                v-for="(row, index) in items"
                :key="rowKey(row)"
                class="border-b border-dark-600 hover:bg-dark-600"
              >
                <td class="py-2 px-4">
                  <span v-if="index === 0" class="text-gold font-medium">{{ category }}</span>
                </td>
                <td class="py-2 px-4">
                  {{ row.materialName }}
                  <span
                    v-if="row.customPrice !== null && !isDirty(row)"
                    class="ml-2 px-1.5 py-0.5 text-xs rounded bg-gold/20 text-gold"
                  >カスタム</span>
                  <span
                    v-if="isDirty(row)"
                    class="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-700 text-blue-100"
                  >未保存</span>
                </td>
                <td class="py-2 px-4 text-gray-400 text-sm">{{ row.spec || '-' }}</td>
                <td class="py-2 px-4 text-gray-400 text-sm">{{ row.unit }}</td>
                <td class="py-2 px-4 text-right font-mono text-gray-400">
                  {{ row.defaultPrice !== null ? '¥' + row.defaultPrice.toLocaleString() : '-' }}
                </td>
                <td class="py-2 px-4 text-right">
                  <input
                    v-model="row.input"
                    type="number"
                    min="0"
                    step="1"
                    :placeholder="row.defaultPrice !== null ? String(row.defaultPrice) : ''"
                    class="input w-28 text-right py-1 px-2 font-mono"
                  />
                </td>
                <td class="py-2 px-4 text-right">
                  <button
                    v-if="row.customId"
                    @click="resetRow(row)"
                    class="text-xs text-gray-400 hover:text-red-400"
                    title="標準単価に戻す"
                  >
                    標準に戻す
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card mt-6 text-red-400">
      <p>{{ error }}</p>
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
import { computed, ref, onMounted } from 'vue'
import * as api from '@/services/api'

const rows = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const showToast = ref(false)
const toastMessage = ref('')

const rowKey = (row) => `${row.materialName}|${row.spec || ''}`

onMounted(load)

async function load() {
  loading.value = true
  error.value = null
  try {
    const response = await api.fetchEffectiveUnitPrices()
    // input: 編集用の値（カスタム単価があればそれ、なければ空欄=標準を使用）
    rows.value = response.data.map(r => ({
      ...r,
      input: r.customPrice !== null ? String(r.customPrice) : '',
    }))
  } catch (e) {
    error.value = e.response?.data?.error || '単価の取得に失敗しました'
  } finally {
    loading.value = false
  }
}

const groupedRows = computed(() => {
  const grouped = {}
  for (const row of rows.value) {
    const cat = row.category || 'その他'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(row)
  }
  return grouped
})

// 入力値がサーバー状態と異なる行 = 未保存
function isDirty(row) {
  const saved = row.customPrice !== null ? String(row.customPrice) : ''
  return String(row.input ?? '') !== saved
}

const dirtyCount = computed(() => rows.value.filter(isDirty).length)

function showToastMessage(message) {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 3000)
}

async function saveAll() {
  saving.value = true
  error.value = null
  try {
    // 変更行を1リクエストにまとめて送信（サーバー側で1トランザクション適用）
    // 空欄に戻された行は unitPrice: null = カスタム解除
    const prices = rows.value
      .filter(isDirty)
      .map(row => {
        const raw = String(row.input ?? '').trim()
        const price = raw === '' ? null : parseInt(raw)
        if (price !== null && (!Number.isFinite(price) || price < 0)) return null
        return {
          materialName: row.materialName,
          spec: row.spec,
          category: row.category,
          unit: row.unit,
          unitPrice: price,
        }
      })
      .filter(Boolean)

    if (prices.length === 0) return

    await api.bulkUpsertUnitPrices(prices)
    await load()
    showToastMessage(`${prices.length}件の単価を保存しました`)
  } catch (e) {
    error.value = e.response?.data?.error || '単価の保存に失敗しました'
  } finally {
    saving.value = false
  }
}

async function resetRow(row) {
  try {
    await api.deleteUnitPrice(row.customId)
    row.customId = null
    row.customPrice = null
    row.input = ''
    showToastMessage('標準単価に戻しました')
  } catch (e) {
    error.value = e.response?.data?.error || 'リセットに失敗しました'
  }
}

async function resetAll() {
  if (!window.confirm('全ての自社単価を削除して標準単価に戻しますか？')) return
  try {
    await api.resetUnitPrices()
    await load()
    showToastMessage('全て標準単価に戻しました')
  } catch (e) {
    error.value = e.response?.data?.error || 'リセットに失敗しました'
  }
}

async function downloadExcel() {
  try {
    const response = await api.exportUnitPrices()
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'unit_prices.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
  } catch (e) {
    error.value = 'Excelエクスポートに失敗しました'
  }
}

async function importExcel(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 同じファイルの再選択を可能に
  if (!file) return
  if (!window.confirm('Excelの内容で自社単価を全て置き換えます。よろしいですか？')) return

  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.importUnitPrices(formData)
    await load()
    const msg = response.data.message || 'インポートしました'
    const errs = response.data.errors?.length
      ? `（スキップ${response.data.errors.length}件）`
      : ''
    showToastMessage(msg + errs)
  } catch (e) {
    error.value = e.response?.data?.error || 'インポートに失敗しました'
  }
}
</script>
