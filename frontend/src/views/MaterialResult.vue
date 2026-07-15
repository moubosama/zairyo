<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <div class="flex items-center justify-center gap-2 mb-2">
        <span v-if="isFromHistory" class="px-2 py-1 text-xs rounded bg-blue-600 text-white">履歴</span>
        <h2 class="text-2xl font-bold">資材リスト</h2>
      </div>
      <p class="text-gray-400">{{ store.currentProject?.name }}</p>
    </div>

    <!-- AI Warnings -->
    <div v-if="hasWarnings" class="card mb-6 border-yellow-600">
      <button
        class="w-full flex items-center justify-between text-left"
        @click="showWarnings = !showWarnings"
      >
        <div class="flex items-center gap-2">
          <span class="text-yellow-500">⚠</span>
          <span class="font-medium text-yellow-500">
            AI読み取りの要確認項目（{{ warnings.length + disagreements.length }}件）
          </span>
        </div>
        <span class="text-gray-400 text-sm">{{ showWarnings ? '閉じる ▲' : '表示 ▼' }}</span>
      </button>

      <div v-if="showWarnings" class="mt-4 space-y-2">
        <div
          v-for="(w, i) in warnings"
          :key="`w-${i}`"
          class="text-sm bg-dark-600 rounded p-3"
        >
          <div class="text-gray-200">{{ w.message }}</div>
          <div v-if="w.before !== null && w.before !== undefined" class="text-gray-400 mt-1 font-mono text-xs">
            {{ fieldLabel(w.field) }}: {{ w.before }} → {{ w.after ?? 'ー' }}
          </div>
        </div>
        <div
          v-for="(d, i) in disagreements"
          :key="`d-${i}`"
          class="text-sm bg-dark-600 rounded p-3"
        >
          <div class="text-gray-200">
            ⚡ {{ fieldLabel(d.field) }} で2つのAIの読み取りが一致しませんでした
            <span v-if="d.message" class="block text-gray-400 mt-1">{{ d.message }}</span>
          </div>
          <div class="text-gray-400 mt-1 font-mono text-xs">
            Gemini: {{ d.gemini ?? 'ー' }} ／ Claude: {{ d.claude ?? 'ー' }}
          </div>
        </div>
        <p class="text-xs text-gray-400 pt-1">
          ※ 値はサーバー側検証で補正済みです。下の「計算条件の調整」から手動で修正して再計算できます。
        </p>
      </div>
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
    <div class="grid md:grid-cols-4 gap-4 mb-6">
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

    <!-- Recalculation Panel -->
    <div class="card mb-8">
      <button
        class="w-full flex items-center justify-between text-left"
        @click="showAdjust = !showAdjust"
      >
        <h3 class="text-lg font-medium">🔧 計算条件の調整</h3>
        <span class="text-gray-400 text-sm">{{ showAdjust ? '閉じる ▲' : '開く ▼' }}</span>
      </button>

      <div v-if="showAdjust" class="mt-4">
        <div class="grid md:grid-cols-3 gap-4 items-end">
          <div>
            <label class="block text-sm text-gray-400 mb-1">
              間仕切壁延長（m）
              <span class="text-xs">現在: {{ formatArea(store.areas?.partition_wall_length) }}m</span>
            </label>
            <input
              v-model="adjustPartitionWall"
              type="number"
              min="0"
              step="0.1"
              placeholder="例: 24"
              class="input w-full"
            />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">
              天井高（mm）
              <span class="text-xs">現在: {{ currentCeilingHeight }}mm</span>
            </label>
            <input
              v-model="adjustCeilingHeight"
              type="number"
              min="0"
              step="10"
              placeholder="例: 2400"
              class="input w-full"
            />
          </div>
          <button
            @click="recalculate"
            :disabled="store.loading || (!adjustPartitionWall && !adjustCeilingHeight)"
            class="btn-primary disabled:opacity-50"
          >
            {{ store.loading ? '計算中...' : '再計算' }}
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-3">
          ※ 空欄の項目は現在の値のまま計算します。再計算すると手動編集した数量はリセットされます。
        </p>
      </div>
    </div>

    <!-- Material Table -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium">資材一覧</h3>
        <div class="flex gap-2">
          <template v-if="editMode">
            <button @click="cancelEdit" class="btn-secondary text-sm">
              キャンセル
            </button>
            <button @click="saveEdit" :disabled="store.loading" class="btn-primary text-sm disabled:opacity-50">
              {{ store.loading ? '保存中...' : '💾 保存' }}
            </button>
          </template>
          <template v-else>
            <button @click="enterEdit" class="btn-secondary text-sm">
              ✏️ 数量を編集
            </button>
            <button @click="copyToClipboard" class="btn-secondary text-sm">
              📋 コピー
            </button>
            <button @click="exportExcel" class="btn-primary text-sm">
              📥 Excel出力
            </button>
          </template>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-dark-500 text-left">
              <th class="py-3 px-4 text-sm font-medium text-gray-400">カテゴリ</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">名称</th>
              <th class="py-3 px-4 text-sm font-medium text-gray-400">摘要</th>
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
                <td class="py-3 px-4">
                  {{ item.name }}
                  <span
                    v-if="item.edited && !editMode"
                    class="ml-2 px-1.5 py-0.5 text-xs rounded bg-yellow-700 text-yellow-100"
                    :title="item.calculation"
                  >調整済</span>
                </td>
                <td class="py-3 px-4 text-gray-400">{{ item.spec }}</td>
                <td class="py-3 px-4 text-right font-mono text-gold">
                  <input
                    v-if="editMode"
                    v-model.number="item.quantity"
                    type="number"
                    min="0"
                    step="0.1"
                    class="input w-24 text-right py-1 px-2"
                  />
                  <template v-else>{{ item.quantity }}</template>
                </td>
                <td class="py-3 px-4 text-gray-400">{{ item.unit }}</td>
                <td class="py-3 px-4 text-right font-mono text-gray-400">
                  <input
                    v-if="editMode"
                    v-model.number="item.unitPrice"
                    type="number"
                    min="0"
                    step="1"
                    class="input w-28 text-right py-1 px-2"
                  />
                  <template v-else>
                    {{ item.unitPrice ? '¥' + item.unitPrice.toLocaleString() : '-' }}
                  </template>
                </td>
                <td class="py-3 px-4 text-right font-mono text-gold">
                  <template v-if="editMode">
                    ¥{{ rowAmount(item).toLocaleString() }}
                  </template>
                  <template v-else>
                    {{ item.amount ? '¥' + item.amount.toLocaleString() : '-' }}
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Added Rows (edit mode) -->
    <div v-if="editMode" class="card mt-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gold">独自項目の追加（特注造作・別途工事など）</h4>
        <button @click="addRow" class="btn-secondary text-sm">＋ 行を追加</button>
      </div>
      <p v-if="addedRows.length === 0" class="text-sm text-gray-400">
        「＋ 行を追加」で、自動計算にない項目を見積に足せます（保存後はExcelにも出力されます）
      </p>
      <div v-for="(row, i) in addedRows" :key="i" class="grid md:grid-cols-12 gap-2 items-center mb-2">
        <input v-model="row.category" placeholder="カテゴリ" class="input text-sm py-1 px-2 md:col-span-2" />
        <input v-model="row.name" placeholder="名称 *" class="input text-sm py-1 px-2 md:col-span-3" />
        <input v-model="row.spec" placeholder="摘要" class="input text-sm py-1 px-2 md:col-span-2" />
        <input v-model.number="row.quantity" type="number" min="0" step="0.1" placeholder="数量" class="input text-sm py-1 px-2 text-right md:col-span-1" />
        <input v-model="row.unit" placeholder="単位" class="input text-sm py-1 px-2 md:col-span-1" />
        <input v-model.number="row.unitPrice" type="number" min="0" step="1" placeholder="単価" class="input text-sm py-1 px-2 text-right md:col-span-2" />
        <button @click="removeAddedRow(i)" class="text-red-400 hover:text-red-300 text-sm md:col-span-1">削除</button>
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

    <Toast :show="showToast" :message="toastMessage" />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useToast } from '@/composables/useToast'
import Toast from '@/components/Toast.vue'

const router = useRouter()
const route = useRoute()
const store = useProjectStore()

// リロードや直接アクセスでstoreが空のときは、セッション内の直近プロジェクトを復元する
// （ゲストもX-Guest-Tokenで復元可能）。復元できなければホームへ
onMounted(async () => {
  if (!store.hasMaterials) {
    const restored = await store.restoreFromSession()
    if (!restored) {
      router.replace('/')
    }
  }
})

const { showToast, toastMessage, showToastMessage } = useToast()
const showWarnings = ref(true)
const showAdjust = ref(false)
const editMode = ref(false)
const editedMaterials = ref([])
const addedRows = ref([])
const adjustPartitionWall = ref('')
const adjustCeilingHeight = ref('')

// 履歴から来たかどうか（referrerまたはstoreの状態で判定）
const isFromHistory = computed(() => {
  return route.query.from === 'history' || (store.currentProject && !store.aiReading)
})

// --- AI警告 ---
const FIELD_LABELS = {
  partition_wall_length_m: '間仕切壁延長',
  partition_wall_length: '間仕切壁延長',
  total_floor_area_sqm: '専有面積',
  ceiling_height_mm: '天井高',
  outer_dimensions_mm: '外形寸法',
  document_type: '図面種別',
  is_analyzable: '解析可否',
  layout_type: '間取りタイプ',
  rooms: '部屋面積',
  openings: '開口部',
}

const fieldLabel = (field) => {
  if (!field) return '項目'
  if (FIELD_LABELS[field]) return FIELD_LABELS[field]
  // rooms[2].area_sqm のような形式はプレフィックスで判定
  const base = Object.keys(FIELD_LABELS).find(k => field.startsWith(k))
  return base ? `${FIELD_LABELS[base]}（${field}）` : field
}

const warnings = computed(() => store.aiReading?._warnings || [])
const disagreements = computed(() => store.aiReading?._ai_disagreements || [])
const hasWarnings = computed(() => warnings.value.length > 0 || disagreements.value.length > 0)

// --- 資材テーブル ---
// 編集モード中はローカルコピーを表示・編集し、保存時にまとめて送信する
const displayMaterials = computed(() =>
  editMode.value ? editedMaterials.value : store.materials
)

// Group materials by category
const groupedMaterials = computed(() => {
  const grouped = {}
  for (const item of displayMaterials.value) {
    if (!grouped[item.category]) {
      grouped[item.category] = []
    }
    grouped[item.category].push(item)
  }
  return grouped
})

const rowAmount = (item) => {
  const qty = Number(item.quantity) || 0
  const price = Number(item.unitPrice) || 0
  return Math.round(qty * price)
}

// 合計金額（編集モード中は入力値からリアルタイム算出、追加行も含む）
const totalAmount = computed(() => {
  if (editMode.value) {
    return editedMaterials.value.reduce((sum, item) => sum + rowAmount(item), 0)
      + addedRows.value.reduce((sum, item) => sum + rowAmount(item), 0)
  }
  return store.materials.reduce((sum, item) => sum + (item.amount || 0), 0)
})

const currentCeilingHeight = computed(() => {
  return store.aiReading?.ceiling_height_mm || 2400
})

const formatArea = (value) => {
  if (value === null || value === undefined) return 0
  return Number(value).toFixed(1)
}

// --- 数量編集 ---
const enterEdit = () => {
  editedMaterials.value = store.materials.map(item => ({ ...item }))
  addedRows.value = []
  editMode.value = true
}

const cancelEdit = () => {
  editMode.value = false
  editedMaterials.value = []
  addedRows.value = []
}

const addRow = () => {
  addedRows.value.push({ category: '', name: '', spec: '', quantity: 1, unit: '式', unitPrice: 0 })
}

const removeAddedRow = (index) => {
  addedRows.value.splice(index, 1)
}

const saveEdit = async () => {
  const validAdded = addedRows.value.filter(r => String(r.name || '').trim() !== '')
  if (addedRows.value.length > validAdded.length) {
    showToastMessage('資材名が空の追加行は保存されません')
  }
  try {
    await store.updateMaterials(editedMaterials.value, validAdded)
    editMode.value = false
    editedMaterials.value = []
    addedRows.value = []
    showToastMessage('資材リストを保存しました')
  } catch (e) {
    console.error(e)
    showToastMessage(store.error || '保存に失敗しました')
  }
}

// --- 再計算 ---
const recalculate = async () => {
  try {
    const newOverrides = { ...store.overrides }
    if (adjustPartitionWall.value) {
      newOverrides.partition_wall_length = String(adjustPartitionWall.value)
    }
    if (adjustCeilingHeight.value) {
      newOverrides.ceiling_height = `${adjustCeilingHeight.value}mm`
    }
    await store.saveOverrides(newOverrides)
    await store.calculateMaterials()
    editMode.value = false
    showToastMessage('再計算しました')
  } catch (e) {
    console.error(e)
    showToastMessage(store.error || '再計算に失敗しました')
  }
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
    showToastMessage(store.error || 'Excel出力に失敗しました')
  }
}

const startNew = () => {
  store.reset()
  router.push('/')
}
</script>
