import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// ログイン済みならAuthorizationヘッダを自動付与
// ゲストはプロジェクト作成時に発行された所有権トークンを自動付与
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zairyo_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const guestToken = sessionStorage.getItem('zairyo_guest_token')
  if (guestToken) {
    config.headers['X-Guest-Token'] = guestToken
  }
  return config
})

/**
 * APIエラーからユーザー向けメッセージを取り出す共通ヘルパー
 * バックエンドは {error} 形式、一部（図面種別ゲート等）は {message} 形式を返す
 */
export function apiErrorMessage(e, fallback) {
  return e?.response?.data?.message || e?.response?.data?.error || fallback
}

/**
 * Excel等のblobレスポンスをファイルとしてダウンロードさせる共通ヘルパー
 */
export function downloadBlob(response, filename) {
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

// 認証関連
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)
export const changePassword = (data) => api.post('/auth/change-password', data)

// パッケージ関連
export const fetchPackages = () => api.get('/packages')
export const fetchPackage = (id) => api.get(`/packages/${id}`)

// プロジェクト関連
export const fetchProjects = () => api.get('/projects')
export const createProject = (data) => api.post('/projects', data)
export const fetchProject = (id) => api.get(`/projects/${id}`)
export const deleteProject = (id) => api.delete(`/projects/${id}`)
export const uploadPlan = (id, formData) => api.post(`/projects/${id}/upload`, formData, {
  headers: {
    'Content-Type': 'multipart/form-data',
    // 簡易アップロードガード（バックエンドのUPLOAD_GUARD_TOKENと一致させる）
    ...(import.meta.env.VITE_UPLOAD_TOKEN
      ? { 'X-Upload-Token': import.meta.env.VITE_UPLOAD_TOKEN }
      : {}),
  },
})
export const saveOverrides = (id, overrides) => api.post(`/projects/${id}/overrides`, { overrides })
export const calculateMaterials = (id) => api.post(`/projects/${id}/calculate`)
export const fetchMaterials = (id) => api.get(`/projects/${id}/materials`)
export const updateMaterials = (id, materials, materialListId, added = []) =>
  api.put(`/projects/${id}/materials`, { materials, materialListId, added })
export const exportExcel = (id) => api.get(`/projects/${id}/export`, { responseType: 'blob' })


// 運営者用admin API（X-Admin-Tokenヘッダで認証、JWTとは独立）
export const adminFetchCompanies = (adminToken) =>
  api.get('/admin/companies', { headers: { 'X-Admin-Token': adminToken } })
export const adminResetPassword = (adminToken, companyId, newPassword = null) =>
  api.post(`/admin/companies/${companyId}/reset-password`,
    newPassword ? { new_password: newPassword } : {},
    { headers: { 'X-Admin-Token': adminToken } })

// 単価設定（要ログイン）
export const fetchEffectiveUnitPrices = () => api.get('/unit-prices/effective')
export const upsertUnitPrice = (data) => api.put('/unit-prices/upsert', data)
export const bulkUpsertUnitPrices = (prices) => api.put('/unit-prices/bulk', { prices })
export const deleteUnitPrice = (id) => api.delete(`/unit-prices/${id}`)
export const resetUnitPrices = () => api.post('/unit-prices/reset')
export const exportUnitPrices = () => api.get('/unit-prices/export', { responseType: 'blob' })
export const importUnitPrices = (formData) => api.post('/unit-prices/import', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})


export default api
