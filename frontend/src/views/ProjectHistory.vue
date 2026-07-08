<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">プロジェクト履歴</h2>
      <p class="text-gray-400">過去のプロジェクトを確認・再利用できます</p>
    </div>

    <!-- New Project Button -->
    <div class="mb-6">
      <button @click="goToNewProject" class="btn-primary">
        + 新規プロジェクト
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="spinner mx-auto mb-4"></div>
      <p class="text-gray-400">読み込み中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="projects.length === 0" class="card text-center py-12">
      <div class="text-5xl mb-4">📋</div>
      <p class="text-lg mb-2">まだプロジェクトがありません</p>
      <p class="text-gray-400 mb-6">新規プロジェクトを作成してください</p>
      <button @click="goToNewProject" class="btn-primary">
        新規プロジェクトを作成
      </button>
    </div>

    <!-- Project List -->
    <div v-else class="space-y-4">
      <div
        v-for="project in projects"
        :key="project.id"
        class="card hover:border-gold transition-colors duration-200 cursor-pointer"
        :class="{ 'opacity-50 pointer-events-none': openingId === project.id }"
        @click="viewProject(project)"
      >
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-lg font-medium">{{ project.name }}</h3>
              <span :class="getStatusClass(project.status)">
                {{ getStatusLabel(project.status) }}
              </span>
            </div>
            <div class="flex items-center gap-6 text-sm text-gray-400">
              <span v-if="project.layoutType">間取り: {{ project.layoutType }}</span>
              <span v-if="project.totalAmount">概算: ¥{{ project.totalAmount.toLocaleString() }}</span>
              <span>作成日: {{ formatDate(project.createdAt) }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="project.hasMaterials"
              @click.stop="downloadExcel(project)"
              class="btn-secondary text-sm px-3 py-1"
            >
              Excel
            </button>
            <button
              @click.stop="confirmDelete(project)"
              :disabled="deletingId === project.id"
              class="text-sm px-3 py-1 rounded border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
              title="このプロジェクトを削除"
            >
              {{ deletingId === project.id ? '削除中...' : '削除' }}
            </button>
            <span class="text-gray-400">{{ openingId === project.id ? '読み込み中...' : '→' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="card mt-6 text-red-400">
      <p>{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '@/services/api'
import { useProjectStore } from '@/stores/project'
import { formatDate } from '@/utils/format'

const router = useRouter()
const store = useProjectStore()

const projects = ref([])
const loading = ref(false)
const error = ref(null)
const deletingId = ref(null)
const openingId = ref(null)

onMounted(async () => {
  await loadProjects()
})

async function loadProjects() {
  loading.value = true
  error.value = null
  try {
    const response = await api.fetchProjects()
    projects.value = response.data
  } catch (e) {
    error.value = api.apiErrorMessage(e, 'プロジェクトの取得に失敗しました')
  } finally {
    loading.value = false
  }
}

function goToNewProject() {
  store.reset()
  router.push('/')
}

async function viewProject(project) {
  openingId.value = project.id
  try {
    const response = await api.fetchProject(project.id)
    const data = response.data

    // Store にデータをセット（リロード復元と共通のロジック）
    store.applyProjectData(data)
    store.selectedPackage = data.package

    // ステータスに応じて遷移
    // ※ /confirm・/upload は旧フローの廃止済みルート（遷移すると空白ページになる）
    if (project.hasMaterials) {
      router.push('/result?from=history')
    } else if (data.aiReadings && data.aiReadings.length > 0) {
      // 解析済みだが未計算 → その場で計算して結果画面へ
      await store.calculateMaterials()
      router.push('/result?from=history')
    } else {
      // 図面未アップロード → ホームからやり直し
      store.reset()
      router.push('/')
    }
  } catch (e) {
    error.value = api.apiErrorMessage(e, 'プロジェクトの読み込みに失敗しました')
  } finally {
    openingId.value = null
  }
}

async function confirmDelete(project) {
  if (!window.confirm(`「${project.name}」を削除しますか？\n見積データ・アップロード図面も削除され、元に戻せません。`)) {
    return
  }

  deletingId.value = project.id
  error.value = null
  try {
    await api.deleteProject(project.id)
    projects.value = projects.value.filter(p => p.id !== project.id)
    // 削除したプロジェクトをstoreが指していたらクリア
    if (store.currentProject?.id === project.id) {
      store.reset()
    }
  } catch (e) {
    error.value = api.apiErrorMessage(e, 'プロジェクトの削除に失敗しました')
  } finally {
    deletingId.value = null
  }
}

async function downloadExcel(project) {
  try {
    const response = await api.exportExcel(project.id)
    api.downloadBlob(response, `${project.name}_材料リスト.xlsx`)
  } catch (e) {
    error.value = 'Excelダウンロードに失敗しました'
  }
}

function getStatusClass(status) {
  const classes = {
    draft: 'px-2 py-0.5 rounded text-xs bg-gray-600 text-gray-300',
    analyzed: 'px-2 py-0.5 rounded text-xs bg-blue-600 text-blue-100',
    calculated: 'px-2 py-0.5 rounded text-xs bg-green-600 text-green-100',
  }
  return classes[status] || classes.draft
}

function getStatusLabel(status) {
  const labels = {
    draft: '下書き',
    analyzed: '解析済み',
    calculated: '計算完了',
  }
  return labels[status] || status
}

</script>
