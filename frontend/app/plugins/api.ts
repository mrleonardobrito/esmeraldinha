import { useRuntimeConfig, defineNuxtPlugin } from "nuxt/app";

export default defineNuxtPlugin((_) => {
  const config = useRuntimeConfig();

  // Importar o composable de status da API (será inicializado quando o app estiver pronto)
  let apiStatus: ReturnType<typeof import('~/composables/useApiStatus').useApiStatus> | null = null

  const api = $fetch.create({
    baseURL: (config.public.apiBaseUrl as string) ?? "http://127.0.0.1:8000",

    onRequest({ request, options }) {
      // Inicializar apiStatus se ainda não foi feito
      if (!apiStatus) {
        const { useApiStatus } = require('~/composables/useApiStatus')
        apiStatus = useApiStatus()
      }

      // Resetar status da API em cada nova requisição
      if (apiStatus) {
        apiStatus.setApiAvailable()
      }
    },

    onRequestError({ request, options, error }) {
      if (apiStatus) {
        apiStatus.checkConnectionError(error)
      }
    },

    onResponse({ request, response, options }) {
      // Se chegou aqui, a API está funcionando
      if (apiStatus) {
        apiStatus.setApiAvailable()
      }
    },

    onResponseError({ request, response, options, error }) {
      if (apiStatus) {
        // Verificar se é erro de conexão
        const isConnectionError = apiStatus.checkConnectionError(error)

        // Se não é erro de conexão, pode ser erro da API (400, 500, etc.)
        // Nesse caso, mantemos a API como disponível
        if (!isConnectionError) {
          apiStatus.setApiAvailable()
        }
      }
    },
  });

  return {
    provide: {
      api,
    },
  };
});
