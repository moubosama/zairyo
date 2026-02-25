<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">仕様を確認</h2>
      <p class="text-gray-400">標準仕様と異なる点があれば選択してください</p>
    </div>

    <!-- Override Questions -->
    <div class="space-y-6">
      <div v-for="(config, key) in overrideOptions" :key="key" class="card">
        <h3 class="text-lg font-medium mb-4">{{ config.question }}</h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="option in config.options"
            :key="option"
            @click="selectOption(key, option)"
            :class="[
              'px-4 py-2 rounded-lg border transition-colors duration-200',
              selectedOverrides[key] === option
                ? 'bg-gold text-dark-800 border-gold'
                : 'bg-dark-600 border-dark-400 hover:border-gold'
            ]"
          >
            {{ option }}
          </button>
        </div>
        <p v-if="config.default" class="text-sm text-gray-400 mt-2">
          デフォルト: {{ config.default }}
        </p>
      </div>
    </div>

    <!-- Summary -->
    <div class="card mt-8">
      <h3 class="text-lg font-medium mb-4 text-gold">選択した仕様</h3>
      <div class="grid md:grid-cols-2 gap-4">
        <div v-for="(value, key) in selectedOverrides" :key="key">
          <span class="text-sm text-gray-400">{{ getLabelForKey(key) }}</span>
          <p>{{ value }}</p>
        </div>
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
        :disabled="store.loading"
        class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span v-if="store.loading">計算中...</span>
        <span v-else>資材を計算する</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

// Override options (matching Laravel Override model)
const overrideOptions = {
  water_floor_finish: {
    question: '水回りの床はCFでいいですか？',
    options: ['CF', 'タイル', '長尺シート'],
    default: 'CF',
  },
  interior_window: {
    question: '室内窓はありますか？',
    options: ['なし', 'あり'],
    default: 'なし',
  },
  ceiling_height: {
    question: '天井高は？',
    options: ['2400mm', '2500mm', '2600mm', 'その他'],
    default: '2400mm',
  },
  exterior_wall: {
    question: '躯体壁の処理は？',
    options: ['GL工法', '木軸ふかし+ボード', '既存利用'],
    default: 'GL工法',
  },
  floor_heating: {
    question: '床暖房はありますか？',
    options: ['なし', 'あり（1箇所）', 'あり（2箇所以上）'],
    default: 'なし',
  },
  floor_method: {
    question: '床の工法は？',
    options: ['直貼り', '二重床（スラブ直床張り）'],
    default: '直貼り',
  },
}

// Initialize with defaults
const selectedOverrides = reactive(
  Object.fromEntries(
    Object.entries(overrideOptions).map(([key, config]) => [key, config.default])
  )
)

const selectOption = (key, value) => {
  selectedOverrides[key] = value
}

const getLabelForKey = (key) => {
  const labels = {
    water_floor_finish: '水回り床仕上げ',
    interior_window: '室内窓',
    ceiling_height: '天井高',
    exterior_wall: '躯体壁処理',
    floor_heating: '床暖房',
    floor_method: '床工法',
  }
  return labels[key] || key
}

const goBack = () => {
  router.push('/upload')
}

const goNext = async () => {
  try {
    // Save overrides
    await store.saveOverrides(selectedOverrides)

    // Calculate materials
    await store.calculateMaterials()

    // Navigate to result
    router.push('/result')
  } catch (e) {
    console.error(e)
  }
}
</script>
