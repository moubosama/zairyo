import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../services/api'

const TOKEN_KEY = 'zairyo_token'
const COMPANY_KEY = 'zairyo_company'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || null)
  const company = ref(JSON.parse(localStorage.getItem(COMPANY_KEY) || 'null'))
  const loading = ref(false)
  const error = ref(null)

  const isLoggedIn = computed(() => !!token.value)
  const companyName = computed(() => company.value?.name || null)

  function setSession(newToken, newCompany) {
    token.value = newToken
    company.value = newCompany
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(COMPANY_KEY, JSON.stringify(newCompany))
  }

  async function login(email, password) {
    loading.value = true
    error.value = null
    try {
      const res = await api.login({ email, password })
      setSession(res.data.token, res.data.company)
      return true
    } catch (e) {
      error.value = api.apiErrorMessage(e, 'ログインに失敗しました')
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(name, email, password, inviteCode) {
    loading.value = true
    error.value = null
    try {
      const res = await api.register({ name, email, password, invite_code: inviteCode })
      setSession(res.data.token, res.data.company)
      return true
    } catch (e) {
      error.value = api.apiErrorMessage(e, '登録に失敗しました')
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    token.value = null
    company.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(COMPANY_KEY)
  }

  return { token, company, loading, error, isLoggedIn, companyName, login, register, logout }
})
