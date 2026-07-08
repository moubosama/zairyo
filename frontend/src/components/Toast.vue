<template>
  <div
    v-if="show"
    class="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg fade-in"
  >
    {{ message }}
  </div>
</template>

<script setup>
defineProps({
  show: { type: Boolean, default: false },
  message: { type: String, default: '' },
})
</script>
