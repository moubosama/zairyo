import { ref } from 'vue'

/**
 * トースト通知の共通ロジック
 * 使い方: const { showToast, toastMessage, showToastMessage } = useToast()
 * テンプレートには components/Toast.vue を置く
 */
export function useToast() {
  const showToast = ref(false)
  const toastMessage = ref('')
  let timer = null

  function showToastMessage(message) {
    toastMessage.value = message
    showToast.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      showToast.value = false
    }, 3000)
  }

  return { showToast, toastMessage, showToastMessage }
}
