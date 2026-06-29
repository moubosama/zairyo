<template>
  <div class="fade-in">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h2 class="text-2xl font-bold">商品カタログ設定</h2>
        <p class="text-gray-400">使用する商品を選択してください</p>
      </div>
      <router-link to="/mypage" class="btn-secondary text-sm">
        ← 戻る
      </router-link>
    </div>

    <!-- カテゴリタブ -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        v-for="cat in categories"
        :key="cat"
        @click="selectedCategory = cat"
        :class="[
          'px-4 py-2 rounded-lg text-sm transition-colors',
          selectedCategory === cat
            ? 'bg-gold text-dark-800'
            : 'bg-dark-600 text-gray-300 hover:bg-dark-500'
        ]"
      >
        {{ cat }}
      </button>
    </div>

    <!-- ローディング -->
    <div v-if="loading" class="text-center py-12">
      <div class="spinner mx-auto mb-4"></div>
      <p class="text-gray-400">読み込み中...</p>
    </div>

    <!-- 商品選択カード -->
    <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        @click="selectProduct(product)"
        :class="[
          'card cursor-pointer transition-all',
          isSelected(product) ? 'border-gold border-2' : 'hover:border-dark-400'
        ]"
      >
        <div class="flex justify-between items-start mb-2">
          <div>
            <span class="text-sm text-gold">{{ product.manufacturer }}</span>
            <h3 class="font-medium">{{ product.productName }}</h3>
          </div>
          <div v-if="isSelected(product)" class="text-gold text-xl">✓</div>
        </div>
        <div class="text-sm text-gray-400 mb-2">
          <span v-if="product.modelNumber">{{ product.modelNumber }} / </span>
          {{ product.spec }}
        </div>
        <div class="flex justify-between items-center">
          <span class="text-gold font-mono">¥{{ product.unitPrice.toLocaleString() }}</span>
          <span class="text-gray-500 text-sm">/ {{ product.unit }}</span>
        </div>
        <p v-if="product.description" class="text-xs text-gray-500 mt-2">
          {{ product.description }}
        </p>
      </div>
    </div>

    <!-- 選択状況サマリー -->
    <div class="card mt-8 bg-dark-700">
      <h3 class="text-lg font-medium mb-4">選択中の商品</h3>
      <div v-if="selections.length === 0" class="text-gray-400 text-sm">
        まだ商品が選択されていません
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="sel in selections"
          :key="sel.id"
          class="flex items-center justify-between bg-dark-600 rounded-lg px-4 py-3"
        >
          <div>
            <span class="text-gold text-sm">{{ sel.category }}</span>
            <div class="font-medium">
              {{ sel.product?.manufacturer }} {{ sel.product?.productName }}
              <span class="text-gray-400 text-sm">{{ sel.product?.spec }}</span>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="font-mono text-gold">
              ¥{{ (sel.customPrice || sel.product?.unitPrice || 0).toLocaleString() }}
            </span>
            <button
              @click.stop="removeSelection(sel.category)"
              class="text-red-400 hover:text-red-300 text-sm"
            >
              削除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- カスタム単価入力モーダル -->
    <div v-if="showPriceModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card w-full max-w-md">
        <h3 class="text-lg font-medium mb-4">{{ selectedProduct?.productName }} を選択</h3>
        <p class="text-sm text-gray-400 mb-4">
          {{ selectedProduct?.manufacturer }} / {{ selectedProduct?.spec }}
        </p>
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-1">単価（標準: ¥{{ selectedProduct?.unitPrice.toLocaleString() }}）</label>
          <div class="flex gap-2">
            <input
              v-model.number="customPrice"
              type="number"
              class="flex-1 bg-dark-600 border border-dark-500 rounded-lg px-4 py-2"
              placeholder="カスタム単価（空欄で標準単価）"
            />
            <button
              @click="customPrice = selectedProduct?.unitPrice"
              class="btn-secondary text-sm"
            >
              標準
            </button>
          </div>
        </div>
        <div class="flex gap-3 justify-end">
          <button @click="cancelSelection" class="btn-secondary">キャンセル</button>
          <button @click="confirmSelection" class="btn-primary">選択</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import * as api from '../services/api'

const categories = ref([])
const products = ref([])
const selections = ref([])
const selectedCategory = ref('')
const loading = ref(true)

const showPriceModal = ref(false)
const selectedProduct = ref(null)
const customPrice = ref(null)

const filteredProducts = computed(() => {
  if (!selectedCategory.value) return products.value
  return products.value.filter(p => p.category === selectedCategory.value)
})

const isSelected = (product) => {
  return selections.value.some(s => s.productCatalogId === product.id)
}

const fetchData = async () => {
  loading.value = true
  try {
    const [catRes, prodRes, selRes] = await Promise.all([
      api.fetchProductCategories(),
      api.fetchProductCatalog(),
      api.fetchProductSelections()
    ])
    categories.value = catRes.data
    products.value = prodRes.data
    selections.value = selRes.data

    if (categories.value.length > 0 && !selectedCategory.value) {
      selectedCategory.value = categories.value[0]
    }
  } catch (e) {
    console.error('Failed to fetch data:', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)

const selectProduct = (product) => {
  selectedProduct.value = product
  customPrice.value = null
  showPriceModal.value = true
}

const cancelSelection = () => {
  showPriceModal.value = false
  selectedProduct.value = null
  customPrice.value = null
}

const confirmSelection = async () => {
  if (!selectedProduct.value) return

  try {
    await api.saveProductSelection({
      category: selectedProduct.value.category,
      productCatalogId: selectedProduct.value.id,
      customPrice: customPrice.value || null
    })

    // 選択一覧を再取得
    const selRes = await api.fetchProductSelections()
    selections.value = selRes.data

    showPriceModal.value = false
    selectedProduct.value = null
    customPrice.value = null
  } catch (e) {
    console.error('Failed to save selection:', e)
  }
}

const removeSelection = async (category) => {
  if (!confirm('この商品選択を削除しますか？')) return

  try {
    await api.deleteProductSelection(category)
    const selRes = await api.fetchProductSelections()
    selections.value = selRes.data
  } catch (e) {
    console.error('Failed to remove selection:', e)
  }
}
</script>
