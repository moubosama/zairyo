import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
})

// リクエストインターセプター: 認証トークンを自動付与
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// レスポンスインターセプター: 401エラーでログアウト
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('company')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

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

// 認証関連
export const register = (data) => api.post('/auth/register', data)
export const login = (data) => api.post('/auth/login', data)
export const getMe = () => api.get('/auth/me')

// 単価関連
export const fetchUnitPrices = () => api.get('/unit-prices')
export const updateUnitPrice = (id, unitPrice) => api.put(`/unit-prices/${id}`, { unitPrice })
export const createUnitPrice = (data) => api.post('/unit-prices', data)
export const deleteUnitPrice = (id) => api.delete(`/unit-prices/${id}`)
export const importUnitPrices = (formData) => api.post('/unit-prices/import', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
export const exportUnitPrices = () => api.get('/unit-prices/export', { responseType: 'blob' })
export const resetUnitPrices = () => api.post('/unit-prices/reset')

// 商品カタログ関連
export const fetchProductCatalog = (category) => api.get('/products/catalog', { params: { category } })
export const fetchProductCategories = () => api.get('/products/categories')
export const createProduct = (data) => api.post('/products/catalog', data)
export const updateProduct = (id, data) => api.put(`/products/catalog/${id}`, data)
export const deleteProduct = (id) => api.delete(`/products/catalog/${id}`)
export const importProducts = (formData) => api.post('/products/catalog/import', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
export const exportProducts = () => api.get('/products/catalog/export', { responseType: 'blob' })

// 会社の商品選択
export const fetchProductSelections = () => api.get('/products/selections')
export const saveProductSelection = (data) => api.post('/products/selections', data)
export const deleteProductSelection = (category) => api.delete(`/products/selections/${encodeURIComponent(category)}`)

export default api
