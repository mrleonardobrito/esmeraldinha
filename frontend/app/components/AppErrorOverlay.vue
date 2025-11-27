<script setup lang="ts">
import { useErrorToast } from "../composables/useErrorToast";

const { sessionError, clearSessionError } = useErrorToast();

const reloadPage = () => {
  window.location.reload();
};
</script>

<template>
  <UModal
    v-if="sessionError?.show"
    :title="sessionError.title"
    :description="sessionError.message"
    prevent-close
    :ui="{
      width: 'w-full max-w-4xl',
      height: 'h-full max-h-screen',
    }"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-lucide-alert-triangle"
          color="error"
          variant="soft"
          :description="sessionError.details"
          class="whitespace-pre-wrap"
        />

        <div class="flex gap-2">
          <UButton color="primary" @click="clearSessionError">
            Tentar novamente
          </UButton>

          <UButton color="gray" variant="soft" @click="reloadPage">
            Recarregar página
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
