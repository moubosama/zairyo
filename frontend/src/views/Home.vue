<template>
  <div class="fade-in">
    <div class="text-center mb-8">
      <h2 class="text-2xl font-bold mb-2">図面をアップロード</h2>
      <p class="text-gray-400">1枚ずつ解析して進める段階式。①の読み取り結果を②③のAI解析に引き継ぐので精度が上がります</p>
    </div>

    <!-- Project Name + 専有面積 -->
    <div class="card mb-6 grid md:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm text-gray-400">現場名</label>
          <!-- 復元された前の現場を捨てて新規で始める導線（状態はsessionStorageに残るため明示リセットが必要） -->
          <button
            v-if="planDone || projectName"
            @click="startNewSite"
            class="text-xs text-gray-500 hover:text-gold underline"
          >↺ 新しい現場を開始</button>
        </div>
        <input
          v-model="projectName"
          type="text"
          placeholder="例: ○○マンション101号室"
          :disabled="planDone"
          class="w-full bg-dark-600 border border-dark-500 rounded-lg px-4 py-3 focus:border-gold focus:outline-none disabled:opacity-60"
        />
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">
          専有面積（㎡）<span class="text-xs ml-2">任意・入れると解析精度が上がります</span>
        </label>
        <input
          v-model.number="totalAreaSqm"
          type="number"
          step="0.01"
          min="0"
          placeholder="例: 67.30"
          :disabled="planDone"
          class="bg-dark-600 border border-dark-400 rounded px-3 py-2 w-48 focus:border-gold focus:outline-none disabled:opacity-60"
        />
      </div>
    </div>

    <!-- STEP 1: 平面詳細図 -->
    <div class="card mb-4" :class="planDone ? 'border border-green-700' : 'border border-dark-400'">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span class="text-sm text-gold font-medium">STEP 1　平面詳細図</span>
          <span class="text-xs text-gray-400 ml-2">必須 ─ 間取り・床・天井を読み取ります</span>
        </div>
        <span v-if="planDone" class="text-green-400 text-sm">✓ 解析済み</span>
      </div>

      <div
        v-if="!planDone"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
        :class="[
          'border-2 border-dashed rounded-lg transition-colors duration-200 text-center py-8',
          isDragging ? 'border-gold bg-dark-600' : 'border-dark-400',
          planLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
        ]"
        @click="triggerFileInput"
      >
        <input ref="fileInput" type="file" accept=".pdf,.png,.jpg,.jpeg" class="hidden" @change="handleFileSelect" />
        <div v-if="planLoading" class="flex flex-col items-center">
          <div class="spinner mb-4"></div>
          <p class="text-gold">{{ loadingStep }}</p>
          <p class="text-xs text-gray-400 mt-2">解析には30秒〜1分ほどかかります</p>
        </div>
        <div v-else-if="!selectedFile">
          <div class="text-5xl mb-3">📄</div>
          <p class="mb-1">クリックまたはドラッグ&ドロップ</p>
          <p class="text-sm text-gray-400">PDF, PNG, JPG（最大10MB）</p>
        </div>
        <div v-else>
          <div class="text-4xl mb-2">📄</div>
          <p>{{ selectedFile.name }} <span class="text-sm text-gray-400">({{ formatFileSize(selectedFile.size) }})</span></p>
        </div>
      </div>

      <div v-if="!planDone" class="flex justify-end mt-3">
        <button
          @click="analyzePlan"
          :disabled="!canAnalyzePlan || planLoading"
          class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          解析する
        </button>
      </div>

      <!-- STEP 1 結果サマリー -->
      <div v-if="planDone" class="text-sm">
        <p class="mb-2">
          <span class="text-gray-400">間取り:</span> {{ planSummary.layout || '-' }}
          <span class="text-gray-400 ml-4">部屋数:</span> {{ planSummary.roomCount }}
          <span v-if="planSummary.warnings > 0" class="text-yellow-400 ml-4">⚠ 要確認 {{ planSummary.warnings }}件（結果画面で表示）</span>
        </p>
        <div class="flex flex-wrap gap-1">
          <span v-for="r in planSummary.roomNames" :key="r"
                class="px-2 py-0.5 bg-dark-600 rounded text-xs text-gray-300">{{ r }}</span>
        </div>
      </div>
    </div>

    <!-- STEP 2: 展開図 -->
    <div class="card mb-4"
         :class="[elevSummary ? 'border border-green-700' : 'border border-dark-400', !planDone ? 'opacity-50' : '']">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span class="text-sm text-gold font-medium">STEP 2　展開図</span>
          <span class="text-xs text-gray-400 ml-2">任意 ─ 壁・巾木が実測になります（①の部屋一覧を引き継いで解析）</span>
        </div>
        <span v-if="elevSummary" class="text-green-400 text-sm">✓ 解析済み</span>
      </div>

      <div v-if="elevLoading" class="flex items-center gap-3 py-2">
        <div class="spinner"></div>
        <p class="text-gold text-sm">展開図を解析中（壁記号・開口を分割拡大で読み取り中・数分ほどかかることがあります）...</p>
      </div>
      <template v-else>
        <label v-if="planDone" class="border border-dashed border-dark-400 hover:border-gold rounded-lg block cursor-pointer text-center py-4">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="hidden" @change="e => analyzeAux(e, 'elevation')" />
          <span class="text-sm text-gray-400">🧱 {{ elevSummary ? '別の展開図で読み直す' : 'クリックして選択 → すぐ解析' }}</span>
        </label>
        <p v-else class="text-sm text-gray-500 py-2">STEP 1 の解析が終わると選べます</p>

        <div v-if="elevSummary" class="text-sm mt-3">
          <p>
            <span class="text-gray-400">読み取った部屋:</span> {{ elevSummary.rooms }}室
            <span class="text-gray-400 ml-4">開口:</span> {{ elevSummary.openings }}件
            <span class="text-gray-400 ml-4">壁記号:</span> {{ elevSummary.wall_code_rooms }}部屋分
          </p>
          <div class="flex flex-wrap gap-1 mt-1">
            <span v-for="r in (elevSummary.room_names || [])" :key="r"
                  class="px-2 py-0.5 bg-dark-600 rounded text-xs text-gray-300">{{ r }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- STEP 3: 建具表 -->
    <div class="card mb-4"
         :class="[doorSummary ? 'border border-green-700' : 'border border-dark-400', !planDone ? 'opacity-50' : '']">
      <div class="flex items-center justify-between mb-2">
        <div>
          <span class="text-sm text-gold font-medium">STEP 3　建具表</span>
          <span class="text-xs text-gray-400 ml-2">任意 ─ 開口・建具が実寸になります。複数ページは順に追加</span>
        </div>
        <span v-if="doorSummary" class="text-green-400 text-sm">✓ {{ doorSummary.doors_total }}件 読み取り済み</span>
      </div>

      <div v-if="doorLoading" class="flex items-center gap-3 py-2">
        <div class="spinner"></div>
        <p class="text-gold text-sm">建具表を解析中...</p>
      </div>
      <template v-else>
        <label v-if="planDone" class="border border-dashed border-dark-400 hover:border-gold rounded-lg block cursor-pointer text-center py-4">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="hidden" @change="e => analyzeAux(e, 'door_schedule')" />
          <span class="text-sm text-gray-400">🚪 {{ doorSummary ? '次のページを追加（例: 木製建具表 WD-*）' : 'クリックして選択 → すぐ解析' }}</span>
        </label>
        <p v-else class="text-sm text-gray-500 py-2">STEP 1 の解析が終わると選べます</p>

        <p v-if="doorSummary" class="text-sm mt-2">
          <span class="text-gray-400">建具:</span> 合計{{ doorSummary.doors_total }}件
          <span v-if="doorSummary.added !== undefined" class="text-gray-400 ml-2">（今回のページで+{{ doorSummary.added }}件）</span>
        </p>
      </template>
    </div>

    <!-- Error -->
    <div v-if="uiError || store.error" class="card mt-2 mb-2 text-red-400">
      <p>{{ uiError || store.error }}</p>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between items-center mt-6">
      <button @click="goToHistory" class="btn-secondary">📋 過去の見積もりを見る</button>
      <div class="flex items-center gap-3">
        <span v-if="!planDone" class="text-xs text-gray-500">STEP 1 を解析すると計算できます（②③は後からでも可）</span>
        <button
          @click="goResult"
          :disabled="!planDone || calcLoading || elevLoading || doorLoading"
          class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ calcLoading ? '計算中...' : '資材リストを計算' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const router = useRouter()
const store = useProjectStore()

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const projectName = ref('')
const totalAreaSqm = ref(null)
const loadingStep = ref('')
const uiError = ref(null)

// 段階ごとの状態
const planLoading = ref(false)
const elevLoading = ref(false)
const doorLoading = ref(false)
const calcLoading = ref(false)
const planSummary = ref(null)   // STEP1完了で {layout, roomCount, roomNames, warnings}
const elevSummary = ref(null)   // STEP2完了で {rooms, room_names, openings, wall_code_rooms}
const doorSummary = ref(null)   // STEP3完了で {doors_total, added}

const planDone = computed(() => planSummary.value !== null)
const canAnalyzePlan = computed(() => !!selectedFile.value && !!projectName.value.trim())

// --- Homeウィザード状態の同一タブ内復元（2026-07-20）---
// 結果画面から戻るとSTEP状態が消え、タイル部分失敗の警告が案内する
// 「展開図の再アップロードで再読取」の導線が使えなかった対策。
// 保存: 入力値・サマリーが変わるたびにsessionStorageへ / 復元: マウント時。
// 他タブ・翌日は新規開始でよい（sessionStorage）。selectedFile（Fileオブジェクト）は
// 復元できないが、planDone後は不要なので対象外
let suppressPersist = false // 復元中の中間状態で上書き保存しないためのガード
const persistHomeState = () => {
  if (suppressPersist) return
  store.saveHomeState({
    projectId: store.currentProject?.id ?? null,
    projectName: projectName.value,
    totalAreaSqm: totalAreaSqm.value,
    planSummary: planSummary.value,
    elevSummary: elevSummary.value,
    doorSummary: doorSummary.value,
  })
}
watch([projectName, totalAreaSqm, planSummary, elevSummary, doorSummary], persistHomeState)

onMounted(async () => {
  const saved = store.loadHomeState()
  if (!saved) {
    // 復元対象なし → 従来どおり新規開始（履歴閲覧などのstore残骸をクリア）
    store.reset()
    return
  }
  suppressPersist = true
  try {
    // 入力値は解析前でも復元する（専有面積の入れ忘れ対策: 値があれば戻す）
    projectName.value = saved.projectName || ''
    totalAreaSqm.value = saved.totalAreaSqm ?? null
    if (saved.projectId != null) {
      // SPA内の戻りならstoreが生きている。リロード後はAPIから再取得して復元
      const alive = store.currentProject?.id === saved.projectId
        || await store.restoreProjectById(saved.projectId)
      if (alive && store.currentProject?.id === saved.projectId) {
        planSummary.value = saved.planSummary || null
        elevSummary.value = saved.elevSummary || null
        doorSummary.value = saved.doorSummary || null
      } else {
        // プロジェクトが消えていた（ゲスト24h自動削除等）→ 入力値だけ残して新規扱い
        store.reset()
      }
    } else {
      // 保存状態にプロジェクトが無い（入力途中のみ）のにstoreに残骸がある場合
      // （履歴閲覧の直後など）はクリアする。残骸idがpersist時にhome stateへ
      // 紐付いてしまうのを防ぐ（入力値の復元はそのまま生かす）
      store.reset()
    }
  } finally {
    suppressPersist = false
    persistHomeState() // reset経路で消えた保存分を現在の状態（入力値のみ等）で保存し直す
  }
})

// 「新しい現場を開始」: 復元された状態とsessionStorageを明示的に捨てる
const startNewSite = () => {
  if (planDone.value && !window.confirm('入力中の現場をクリアして、新しい現場を開始しますか？\n（過去の見積もりはログイン時の履歴から再表示できます）')) return
  store.reset() // Home状態(sessionStorage)も一緒に破棄される
  selectedFile.value = null
  projectName.value = ''
  totalAreaSqm.value = null
  planSummary.value = null
  elevSummary.value = null
  doorSummary.value = null
  uiError.value = null
}

const triggerFileInput = () => {
  if (!planLoading.value) fileInput.value.click()
}

const validateFile = (file) => {
  const validTypes = ['application/pdf', 'image/png', 'image/jpeg']
  if (!validTypes.includes(file.type)) {
    uiError.value = 'PDF, PNG, または JPG ファイルを選択してください'
    return false
  }
  if (file.size > 10 * 1024 * 1024) {
    uiError.value = 'ファイルサイズは10MB以下にしてください'
    return false
  }
  return true
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) processFile(file)
}

const handleDrop = (event) => {
  isDragging.value = false
  const file = event.dataTransfer.files[0]
  if (file) processFile(file)
}

const processFile = (file) => {
  uiError.value = null
  if (!validateFile(file)) return
  selectedFile.value = file
}

// STEP 1: 平面詳細図の解析（プロジェクト作成込み）
const analyzePlan = async () => {
  if (!canAnalyzePlan.value) return
  planLoading.value = true
  uiError.value = null
  try {
    loadingStep.value = 'プロジェクトを作成中...'
    await store.createProject(projectName.value.trim())
    loadingStep.value = 'AIが平面詳細図を解析中...'
    const parsed = await store.uploadPlan(selectedFile.value, totalAreaSqm.value)
    planSummary.value = {
      layout: parsed.layout_type || null,
      roomCount: (parsed.rooms || []).length,
      roomNames: (parsed.rooms || []).map(r => r.name).filter(Boolean),
      warnings: (parsed._warnings || []).length,
    }
  } catch (e) {
    console.error('Plan analyze error:', e)
  } finally {
    planLoading.value = false
    loadingStep.value = ''
  }
}

// STEP 2/3: 補助図面の解析（選択したら即実行。①の部屋一覧をサーバーがAIに渡す）
const analyzeAux = async (event, kind) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !planDone.value) return
  uiError.value = null
  if (!validateFile(file)) return

  const loadingRef = kind === 'elevation' ? elevLoading : doorLoading
  loadingRef.value = true
  try {
    const aux = await store.uploadAux(kind, file)
    if (kind === 'elevation') elevSummary.value = aux
    else doorSummary.value = aux
  } catch (e) {
    console.error('Aux analyze error:', e)
  } finally {
    loadingRef.value = false
  }
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const goToHistory = () => {
  router.push('/history')
}

// 計算して結果画面へ（②③はあってもなくても可）
const goResult = async () => {
  if (!planDone.value) return
  calcLoading.value = true
  uiError.value = null
  try {
    await store.calculateMaterials()
    router.push('/result')
  } catch (e) {
    console.error('Calculate error:', e)
  } finally {
    calcLoading.value = false
  }
}
</script>
