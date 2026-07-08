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
            <span class="text-gray-400">→</span>
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

const router = useRouter()
const store = useProjectStore()

const projects = ref([])
const loading = ref(false)
const error = ref(null)
const deletingId = ref(null)

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
    error.value = e.response?.data?.message || e.response?.data?.error || 'プロジェクトの取得に失敗しました'
  } finally {
    loading.value = false
  }
}

function goToNewProject() {
  store.reset()
  router.push('/')
}

async function viewProject(project) {
  try {
    const response = await api.fetchProject(project.id)
    const data = response.data

    // Store にデータをセット
    store.currentProject = data
    store.selectedPackage = data.package

    if (data.aiReadings && data.aiReadings.length > 0) {
      store.aiReading = data.aiReadings[0].parsedData
    }

    // 保存済みの仕様上書きを復元（再計算時に消えないように）
    if (data.overrides && data.overrides.length > 0) {
      store.overrides = Object.fromEntries(data.overrides.map(o => [o.itemKey, o.value]))
    } else {
      store.overrides = {}
    }

    if (data.materialLists && data.materialLists.length > 0) {
      store.materials = data.materialLists[0].materials
      // summaryからareasをセット
      if (data.materialLists[0].summary) {
        store.areas = data.materialLists[0].summary
      }
    }

    // ステータスに応じて遷移
    if (project.hasMaterials) {
      router.push('/result?from=history')
    } else if (project.status === 'analyzed') {
      router.push('/confirm')
    } else {
      router.push('/upload')
    }
  } catch (e) {
    error.value = e.response?.data?.message || e.response?.data?.error || 'プロジェクトの読み込みに失敗しました'
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
    error.value = e.response?.data?.error || 'プロジェクトの削除に失敗しました'
  } finally {
    deletingId.value = null
  }
}

async function downloadExcel(project) {
  try {
    const response = await api.exportExcel(project.id)
    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name}_材料リスト.xlsx`
    link.click()
    window.URL.revokeObjectURL(url)
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

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
</script>
