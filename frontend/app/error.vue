<script setup lang="ts">
import type { NuxtError } from 'nuxt/app'

const props = defineProps<{
  error: unknown
}>()

const error = computed(() => props.error as Partial<NuxtError & { message: string }> | undefined)
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
