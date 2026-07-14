import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/services/api'

const SESSION_PROJECT_KEY = 'zairyo_current_project_id'

export const useProjectStore = defineStore('project', () => {
  // State
  const packages = ref([])
  const selectedPackage = ref(null)
  const currentProject = ref(null)
  const aiReading = ref(null)
  const overrides = ref({})
  const materials = ref([])
  const materialListId = ref(null) // 編集競合検出用（PUT /materialsで送信）
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
      error.value = api.apiErrorMessage(e, 'パッケージの取得に失敗しました')
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
      // ゲストの場合は所有権トークンが発行される（以降のAPIで自動送信）
      if (response.data.guestToken) {
        sessionStorage.setItem('zairyo_guest_token', response.data.guestToken)
      }
      // リロード復元用に現在のプロジェクトIDを保持
      sessionStorage.setItem(SESSION_PROJECT_KEY, String(response.data.id))
      return currentProject.value
    } catch (e) {
      error.value = api.apiErrorMessage(e, 'プロジェクトの作成に失敗しました')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function uploadPlan(file, totalAreaSqm = null, aux = {}) {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    loading.value = true
    error.value = null
    try {
      const formData = new FormData()
      formData.append('file', file)
      // 補助図面（任意）: 展開図=壁・巾木の実測、建具表=開口の実寸
      if (aux.elevationFile) {
        formData.append('elevation', aux.elevationFile)
      }
      if (aux.doorScheduleFile) {
        formData.append('door_schedule', aux.doorScheduleFile)
      }
      if (totalAreaSqm) {
        formData.append('total_area_sqm', totalAreaSqm)
      }

      const response = await api.uploadPlan(currentProject.value.id, formData)
      // APIは { parsedData: {...} } を返すので、parsedDataを取り出す
      aiReading.value = response.data.parsedData || response.data
      return aiReading.value
    } catch (e) {
      error.value = api.apiErrorMessage(e, '図面のアップロードに失敗しました')
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
      error.value = api.apiErrorMessage(e, '仕様変更の保存に失敗しました')
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
        // バックエンドはcamelCaseで返すが、旧snake_caseにも念のため対応
        unitPrice: item.unitPrice ?? item.unit_price ?? 0,
        // amount はそのまま使用
      }))
      materialListId.value = response.data.id ?? null
      areas.value = response.data.summary
      // estimate情報も保存（カテゴリ別小計・総合計）
      if (response.data.estimate) {
        areas.value.estimate = response.data.estimate
      }
      return materials.value
    } catch (e) {
      error.value = api.apiErrorMessage(e, '資材計算に失敗しました')
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateMaterials(editedMaterials, addedRows = []) {
    if (!currentProject.value) {
      throw new Error('プロジェクトが作成されていません')
    }

    loading.value = true
    error.value = null
    try {
      const response = await api.updateMaterials(
        currentProject.value.id,
        editedMaterials,
        materialListId.value,
        addedRows
      )
      materials.value = response.data.materials
      materialListId.value = response.data.id ?? materialListId.value
      return materials.value
    } catch (e) {
      error.value = api.apiErrorMessage(e, '資材リストの保存に失敗しました')
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
      api.downloadBlob(response, `zairyo_${currentProject.value.id}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      error.value = api.apiErrorMessage(e, 'Excelエクスポートに失敗しました')
      throw e
    }
  }

  /**
   * GET /projects/:id のレスポンスをstoreに展開する
   * （履歴からの遷移とリロード復元で共用）
   */
  function applyProjectData(data) {
    currentProject.value = data
    if (data.aiReadings && data.aiReadings.length > 0) {
      aiReading.value = data.aiReadings[0].parsedData
    }
    overrides.value = data.overrides && data.overrides.length > 0
      ? Object.fromEntries(data.overrides.map(o => [o.itemKey, o.value]))
      : {}
    if (data.materialLists && data.materialLists.length > 0) {
      materials.value = data.materialLists[0].materials
      materialListId.value = data.materialLists[0].id
      if (data.materialLists[0].summary) {
        areas.value = data.materialLists[0].summary
      }
    }
    sessionStorage.setItem(SESSION_PROJECT_KEY, String(data.id))
  }

  /**
   * リロード等でstoreが空になったとき、セッション内の直近プロジェクトを復元する
   * @returns 資材リストまで復元できたらtrue
   */
  async function restoreFromSession() {
    const id = sessionStorage.getItem(SESSION_PROJECT_KEY)
    if (!id) return false
    try {
      const response = await api.fetchProject(id)
      applyProjectData(response.data)
      return materials.value.length > 0
    } catch {
      sessionStorage.removeItem(SESSION_PROJECT_KEY)
      return false
    }
  }

  function reset() {
    selectedPackage.value = null
    currentProject.value = null
    aiReading.value = null
    overrides.value = {}
    materials.value = []
    materialListId.value = null
    areas.value = null
    error.value = null
    sessionStorage.removeItem(SESSION_PROJECT_KEY)
  }

  return {
    // State
    packages,
    selectedPackage,
    currentProject,
    aiReading,
    overrides,
    materials,
    materialListId,
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
    updateMaterials,
    exportExcel,
    applyProjectData,
    restoreFromSession,
    reset,
  }
})
