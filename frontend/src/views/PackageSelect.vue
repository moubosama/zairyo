<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">パッケージを選択</h2>
      <p class="text-gray-400">リノベーションの仕様パッケージを選択してください</p>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <!-- Error -->
    <div v-else-if="store.error" class="card text-center text-red-400">
      <p>{{ store.error }}</p>
      <button @click="loadPackages" class="btn-secondary mt-4">再読み込み</button>
    </div>

    <!-- Package Cards -->
    <div v-else class="grid md:grid-cols-3 gap-6">
      <div
        v-for="pkg in store.packages"
        :key="pkg.id"
        @click="selectPackage(pkg)"
        :class="[
          'card-hover transition-all duration-200',
          selectedPackageId === pkg.id ? 'border-gold ring-2 ring-gold ring-opacity-50' : ''
        ]"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gold">{{ pkg.name }}</h3>
          <span class="text-sm text-gray-400">{{ pkg.target_layout }}</span>
        </div>

        <div class="text-3xl font-bold mb-4">
          {{ pkg.base_price }}<span class="text-lg text-gray-400">万円～</span>
        </div>

        <p class="text-sm text-gray-300 mb-4">{{ pkg.description }}</p>

        <div class="border-t border-dark-500 pt-4 mt-4">
          <h4 class="text-sm font-medium text-gray-400 mb-2">主な仕様</h4>
          <ul class="text-sm space-y-1 text-gray-300">
            <li>• UB: {{ pkg.specs_json?.ub || '-' }}</li>
            <li>• トイレ: {{ pkg.specs_json?.toilet || '-' }}</li>
            <li>• キッチン: {{ pkg.specs_json?.kitchen || '-' }}</li>
            <li>• 床暖房: {{ pkg.specs_json?.floor_heating || '-' }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Project Name Input -->
    <div v-if="selectedPackageId" class="mt-8 card fade-in">
      <h3 class="text-lg font-medium mb-4">現場名を入力</h3>
      <div class="flex gap-4">
        <input
          v-model="projectName"
          type="text"
          placeholder="例: 朝日パリオ北千住 305号室"
          class="input flex-1"
          @keyup.enter="createProject"
        />
        <button
          @click="createProject"
          :disabled="!projectName || store.loading"
          class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          次へ進む
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const selectedPackageId = ref(null)
const projectName = ref('')

const loadPackages = async () => {
  try {
    await store.loadPackages()
  } catch (e) {
    console.error(e)
  }
}

const selectPackage = (pkg) => {
  selectedPackageId.value = pkg.id
  store.selectPackage(pkg)
}

const createProject = async () => {
  if (!projectName.value || !selectedPackageId.value) return

  try {
    await store.createProject(projectName.value)
    router.push('/upload')
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  store.reset()
  loadPackages()
})
</script>
