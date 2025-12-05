<script setup lang="ts">
</script>

<template>
  <UModal
    prevent-close
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex gap-2">
          <UButton
            color="primary"
          >
            Tentar novamente
          </UButton>

          <UButton
            color="neutral"
            variant="soft"
          >
            Recarregar página
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
