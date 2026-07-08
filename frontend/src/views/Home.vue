<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">図面をアップロード</h2>
      <p class="text-gray-400">計画平面図（PDF/PNG/JPG）をアップロードして資材を自動計算</p>
    </div>

    <!-- Project Name Input -->
    <div class="card mb-6">
      <label class="block text-sm text-gray-400 mb-2">現場名</label>
      <input
        v-model="projectName"
        type="text"
        placeholder="例: ○○マンション101号室"
        class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 focus:border-gold focus:outline-none"
      />
    </div>

    <!-- Upload Area -->
    <div
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      :class="[
        'card border-2 border-dashed transition-colors duration-200 text-center py-12',
        isDragging ? 'border-gold bg-dark-600' : 'border-dark-400',
        loading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
      ]"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        class="hidden"
        @change="handleFileSelect"
      />

      <!-- Loading State -->
      <div v-if="loading" class="flex flex-col items-center">
        <div class="spinner mb-4"></div>
        <p class="text-gold">{{ loadingStep }}</p>
        <p class="text-xs text-gray-400 mt-2">図面の解析には30秒〜1分ほどかかります</p>
      </div>

      <!-- Default State -->
      <div v-else-if="!selectedFile">
        <div class="text-5xl mb-4">📄</div>
        <p class="text-lg mb-2">クリックまたはドラッグ&ドロップ</p>
        <p class="text-sm text-gray-400">PDF, PNG, JPG（最大10MB）</p>
      </div>

      <!-- File Selected State -->
      <div v-else>
        <div class="text-5xl mb-4">✅</div>
        <p class="text-lg mb-2">{{ selectedFile.name }}</p>
        <p class="text-sm text-gray-400">{{ formatFileSize(selectedFile.size) }}</p>
      </div>
    </div>

    <!-- 専有面積入力（任意・AI読み取りより優先される） -->
    <div class="card mt-6">
      <label class="text-sm text-gray-400 block mb-2">
        専有面積（㎡）
        <span class="text-xs ml-2">任意・物件資料の値を入れると解析精度が上がります</span>
      </label>
      <input
        v-model.number="totalAreaSqm"
        type="number"
        step="0.01"
        min="0"
        placeholder="例: 67.30"
        class="bg-dark-600 border border-dark-400 rounded px-3 py-2 w-48 focus:border-gold focus:outline-none"
        :disabled="loading"
        @click.stop
      />
    </div>

    <!-- Error -->
    <div v-if="uiError || store.error" class="card mt-6 text-red-400">
      <p>{{ uiError || store.error }}</p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between items-center mt-8">
      <button
        @click="goToHistory"
        class="btn-secondary"
      >
        📋 過去の見積もりを見る
      </button>
      <div class="flex items-center gap-3">
        <span v-if="!canSubmit && !loading" class="text-xs text-gray-500">
          {{ !projectName.trim() ? '現場名を入力してください' : '図面をアップロードしてください' }}
        </span>
        <button
          @click="goNext"
          :disabled="!canSubmit || loading"
          class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          資材リストを計算
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const projectName = ref('')
const totalAreaSqm = ref(null)
const loading = ref(false)
const loadingStep = ref('')
const uiError = ref(null)

const canSubmit = computed(() => !!selectedFile.value && !!projectName.value.trim())

onMounted(() => {
  store.reset()
})

const triggerFileInput = () => {
  if (!loading.value) {
    fileInput.value.click()
  }
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    processFile(file)
  }
}

const handleDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer.files[0]
  if (file) {
    processFile(file)
  }
}

const processFile = (file) => {
  uiError.value = null

  // Validate file type
  const validTypes = ['application/pdf', 'image/png', 'image/jpeg']
  if (!validTypes.includes(file.type)) {
    uiError.value = 'PDF, PNG, または JPG ファイルを選択してください'
    return
  }

  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    uiError.value = 'ファイルサイズは10MB以下にしてください'
    return
  }

  // ファイルを保存（現場名は後で入力可能）
  selectedFile.value = file
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const goToHistory = () => {
  router.push('/history')
}

const goNext = async () => {
  if (!canSubmit.value) return

  loading.value = true
  uiError.value = null
  try {
    loadingStep.value = 'プロジェクトを作成中...'
    await store.createProject(projectName.value.trim())
    loadingStep.value = 'AIが図面を解析中...'
    await store.uploadPlan(selectedFile.value, totalAreaSqm.value)
    loadingStep.value = '資材数量を計算中...'
    await store.calculateMaterials()
    router.push('/result')
  } catch (e) {
    // エラー詳細はstore.errorに入り、画面のエラーカードに表示される
    console.error('Error:', e)
  } finally {
    loading.value = false
    loadingStep.value = ''
  }
}
</script>
