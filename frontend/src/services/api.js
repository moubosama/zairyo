import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// パッケージ関連
export const fetchPackages = () => api.get('/packages')
export const fetchPackage = (id) => api.get(`/packages/${id}`)

// プロジェクト関連
export const fetchProjects = () => api.get('/projects')
export const createProject = (data) => api.post('/projects', data)
export const fetchProject = (id) => api.get(`/projects/${id}`)
export const uploadPlan = (id, formData) => api.post(`/projects/${id}/upload`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
export const saveOverrides = (id, overrides) => api.post(`/projects/${id}/overrides`, { overrides })
export const calculateMaterials = (id) => api.post(`/projects/${id}/calculate`)
export const fetchMaterials = (id) => api.get(`/projects/${id}/materials`)
export const exportExcel = (id) => api.get(`/projects/${id}/export`, { responseType: 'blob' })

// オーバーライドオプション
export const fetchOverrideOptions = () => api.get('/override-options')

export default api
