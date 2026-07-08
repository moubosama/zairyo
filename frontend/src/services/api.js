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
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zairyo_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 認証関連
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)

// パッケージ関連
export const fetchPackages = () => api.get('/packages')
export const fetchPackage = (id) => api.get(`/packages/${id}`)

// プロジェクト関連
export const fetchProjects = () => api.get('/projects')
export const createProject = (data) => api.post('/projects', data)
export const fetchProject = (id) => api.get(`/projects/${id}`)
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
export const updateMaterials = (id, materials) => api.put(`/projects/${id}/materials`, { materials })
export const exportExcel = (id) => api.get(`/projects/${id}/export`, { responseType: 'blob' })

// オーバーライドオプション
export const fetchOverrideOptions = () => api.get('/override-options')


export default api
