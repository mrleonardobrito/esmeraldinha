<script setup lang="ts">
defineProps<{
  error: any
}>()
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
