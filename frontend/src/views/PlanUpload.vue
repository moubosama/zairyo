<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">図面をアップロード</h2>
      <p class="text-gray-400">計画平面図（PDF/PNG/JPG）をアップロードしてください</p>
    </div>

    <!-- Project Info -->
    <div class="card mb-6">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm text-gray-400">現場名</span>
          <h3 class="text-lg font-medium">{{ store.currentProject?.name }}</h3>
        </div>
        <div class="text-right">
          <span class="text-sm text-gray-400">パッケージ</span>
          <h3 class="text-lg font-medium text-gold">{{ store.selectedPackage?.name }}</h3>
        </div>
      </div>
    </div>

    <!-- 専有面積入力（任意・最優先で採用される） -->
    <div class="card mb-6">
      <label class="text-sm text-gray-400 block mb-2">
        専有面積（㎡）
        <span class="text-xs ml-2">任意入力・物件資料の値を入れるとAI読み取りより優先されます</span>
      </label>
      <input
        v-model.number="totalAreaSqm"
        type="number"
        step="0.01"
        min="0"
        placeholder="例: 67.30"
        class="bg-dark-600 border border-dark-400 rounded px-3 py-2 w-48 focus:border-gold focus:outline-none"
        :disabled="store.loading"
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
        store.loading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
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
      <div v-if="store.loading" class="flex flex-col items-center">
        <div class="spinner mb-4"></div>
        <p class="text-gold">AI が図面を解析中...</p>
        <p class="text-sm text-gray-400 mt-2">Gemini 2.5 Flash で処理しています</p>
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

    <!-- AI Reading Preview -->
    <div v-if="store.aiReading" class="card mt-6 fade-in">
      <h3 class="text-lg font-medium mb-4 text-gold">AI 解析結果</h3>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <span class="text-sm text-gray-400">物件名</span>
          <p>{{ store.aiReading.property_name || '-' }}</p>
        </div>
        <div>
          <span class="text-sm text-gray-400">間取り</span>
          <p>{{ store.aiReading.layout_type || '-' }}</p>
        </div>
      </div>

      <div class="mt-4">
        <span class="text-sm text-gray-400">部屋一覧</span>
        <div class="grid md:grid-cols-3 gap-2 mt-2">
          <div
            v-for="room in store.aiReading.rooms"
            :key="room.name"
            class="bg-dark-600 rounded p-2 text-sm"
          >
            <div class="font-medium">{{ room.name }}</div>
            <div class="text-gray-400">{{ room.area_sqm }}㎡ ({{ room.area_tsubo }}畳)</div>
          </div>
        </div>
      </div>

      <div class="mt-4">
        <span class="text-sm text-gray-400">開口部</span>
        <p>ドア: {{ getDoorCount() }}枚 / 窓: {{ getWindowCount() }}枚</p>
      </div>

      <!-- 検証警告・AI不一致（要確認項目） -->
      <div
        v-if="(store.aiReading._warnings?.length || 0) + (store.aiReading._ai_disagreements?.length || 0) > 0"
        class="mt-4 border border-yellow-600 rounded p-3"
      >
        <span class="text-sm text-yellow-500 font-medium">⚠ 要確認項目</span>
        <ul class="mt-2 text-sm text-gray-300 space-y-1">
          <li v-for="(w, i) in store.aiReading._warnings" :key="'w' + i">
            {{ w.message }}（{{ w.before }} → {{ w.after }}）
          </li>
          <li v-for="(d, i) in store.aiReading._ai_disagreements" :key="'d' + i">
            {{ d.field }}: {{ d.message }}（Gemini: {{ d.gemini }} / Claude: {{ d.claude }}）
          </li>
        </ul>
      </div>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="card mt-6 text-red-400">
      <p>{{ store.error }}</p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between mt-8">
      <button @click="goBack" class="btn-secondary">戻る</button>
      <button
        @click="goNext"
        :disabled="!store.hasAiReading"
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        次へ進む
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const totalAreaSqm = ref(null)

const triggerFileInput = () => {
  if (!store.loading) {
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

const processFile = async (file) => {
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

  selectedFile.value = file

  try {
    await store.uploadPlan(file, totalAreaSqm.value)
  } catch (e) {
    console.error(e)
    selectedFile.value = null
  }
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const getDoorCount = () => {
  if (!store.aiReading?.openings) return 0
  return store.aiReading.openings.filter(o =>
    ['door', 'sliding_door', 'folding_door'].includes(o.type)
  ).length
}

const getWindowCount = () => {
  if (!store.aiReading?.openings) return 0
  return store.aiReading.openings.filter(o => o.type === 'window').length
}

const goBack = () => {
  router.push('/')
}

const goNext = () => {
  if (store.hasAiReading) {
    router.push('/confirm')
  }
}
</script>
