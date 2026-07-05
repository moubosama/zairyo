import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/services/api'

export const useProjectStore = defineStore('project', () => {
  // State
  const packages = ref([])
  const selectedPackage = ref(null)
  const currentProject = ref(null)
  const aiReading = ref(null)
  const overrides = ref({})
  const materials = ref([])
  const areas = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Getters
  const hasProject = computed(() => currentProject.value !== null)
  const hasAiReading = computed(() => aiReading.value !== null)
  const hasMaterials = computed(() => materials.value.length > 0)

  // Actions
  async function loadPackages() {
    loading.value = true
    error.value = null
    try {
      const response = await api.fetchPackages()
      packages.value = response.data
    } catch (e) {
      error.value = e.response?.data?.message || 'パッケージの取得に失敗しました'
      throw e
    } finally {
      loading.value = false
    }
  }

  function selectPackage(pkg) {
    selectedPackage.value = pkg
  }

  async function createProject(name) {
    loading.value = true
    error.value = null
    try {
      const response = await api.createProject({
        name
      })
      currentProject.value = response.data
      return currentProject.value
    } catch (e) {
      error.value = e.response?.data?.message || 'プロジェクトの作成に失敗しました'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function uploadPlan(file) {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    loading.value = true
    error.value = null
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.uploadPlan(currentProject.value.id, formData)
      // APIは { parsedData: {...} } を返すので、parsedDataを取り出す
      aiReading.value = response.data.parsedData || response.data
      return aiReading.value
    } catch (e) {
      error.value = e.response?.data?.message || '図面のアップロードに失敗しました'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function saveOverrides(overrideData) {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    loading.value = true
    error.value = null
    try {
      const overrideArray = Object.entries(overrideData).map(([key, value]) => ({
        category: 'spec',
        itemKey: key,
        value,
      }))

      await api.saveOverrides(currentProject.value.id, overrideArray)
      overrides.value = overrideData
    } catch (e) {
      error.value = e.response?.data?.message || '仕様変更の保存に失敗しました'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function calculateMaterials() {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    loading.value = true
    error.value = null
    try {
      const response = await api.calculateMaterials(currentProject.value.id)
      // バックエンドの snake_case を camelCase に変換
      materials.value = response.data.materials.map(item => ({
        ...item,
        unitPrice: item.unit_price,
        // amount はそのまま使用
      }))
      areas.value = response.data.summary
      // estimate情報も保存（カテゴリ別小計・総合計）
      if (response.data.estimate) {
        areas.value.estimate = response.data.estimate
      }
      return materials.value
    } catch (e) {
      error.value = e.response?.data?.message || '資材計算に失敗しました'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function exportExcel() {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    try {
      const response = await api.exportExcel(currentProject.value.id)
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `zairyo_${currentProject.value.id}_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      error.value = e.response?.data?.message || 'Excelエクスポートに失敗しました'
      throw e
    }
  }

  function reset() {
    selectedPackage.value = null
    currentProject.value = null
    aiReading.value = null
    overrides.value = {}
    materials.value = []
    areas.value = null
    error.value = null
  }

  return {
    // State
    packages,
    selectedPackage,
    currentProject,
    aiReading,
    overrides,
    materials,
    areas,
    loading,
    error,
    // Getters
    hasProject,
    hasAiReading,
    hasMaterials,
    // Actions
    loadPackages,
    selectPackage,
    createProject,
    uploadPlan,
    saveOverrides,
    calculateMaterials,
    exportExcel,
    reset,
  }
})
