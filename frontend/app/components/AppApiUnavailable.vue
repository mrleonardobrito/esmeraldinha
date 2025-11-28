<script setup lang="ts">
import { useApiStatus } from '@composables/useApiStatus'

const { isApiAvailable, lastConnectionError } = useApiStatus()
</script>

<template>
  <div
    v-if="!isApiAvailable"
    class="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-gray-900"
  >
    <div class="max-w-md mx-auto text-center px-6">
      <div class="mb-6">
        <UIcon
          name="i-lucide-wifi-off"
          class="w-16 h-16 mx-auto text-red-500 mb-4"
        />
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Ops! Servidores indisponíveis
        </h1>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          Não conseguimos conectar aos nossos servidores no momento.
        </p>
      </div>

      <div
        class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
      >
        <p class="text-sm text-red-700 dark:text-red-300">
          <strong>Detalhes do erro:</strong><br>
          {{ lastConnectionError }}
        </p>
      </div>

      <div class="space-y-3">
        <UButton
          color="primary"
          size="lg"
          class="w-full"
          @click="reloadNuxtApp()"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            class="w-4 h-4 mr-2"
          />
          Tentar novamente
        </UButton>

        <UButton
          color="neutral"
          variant="soft"
          size="lg"
          class="w-full"
          @click="navigateTo('/')"
        >
          <UIcon
            name="i-lucide-home"
            class="w-4 h-4 mr-2"
          />
          Ir para página inicial
        </UButton>
      </div>
      <div class="mt-8 text-xs text-gray-500 dark:text-gray-400">
        <p>
          Verifique sua conexão com a internet e tente novamente em alguns
          instantes.
        </p>
        <p class="mt-1">
          Se o problema persistir, entre em contato com nosso suporte.
        </p>
      </div>
    </div>
  </div>
</template>
