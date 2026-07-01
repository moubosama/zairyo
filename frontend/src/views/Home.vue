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
        <p class="text-gold">AIが解析中...</p>
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

    <!-- Error -->
    <div v-if="store.error" class="card mt-6 text-red-400">
      <p>{{ store.error }}</p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-end mt-8">
      <button
        @click="goNext"
        :disabled="!selectedFile || loading"
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        資材リストを計算
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const projectName = ref('')
const loading = ref(false)

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
  console.log('processFile called:', file.name, file.type)

  // Validate file type
  const validTypes = ['application/pdf', 'image/png', 'image/jpeg']
  if (!validTypes.includes(file.type)) {
    alert('PDF, PNG, または JPG ファイルを選択してください')
    return
  }

  // Validate file size (10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('ファイルサイズは10MB以下にしてください')
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

const goNext = async () => {
  // 現場名チェック
  if (!projectName.value.trim()) {
    alert('現場名を入力してください')
    return
  }

  // ファイルチェック
  if (!selectedFile.value) {
    alert('図面ファイルをアップロードしてください')
    return
  }

  loading.value = true
  try {
    // プロジェクト作成
    await store.createProject(projectName.value.trim())
    // アップロード
    await store.uploadPlan(selectedFile.value)
    // 計算
    await store.calculateMaterials()
    router.push('/result')
  } catch (e) {
    console.error('Error:', e)
  } finally {
    loading.value = false
  }
}
</script>
