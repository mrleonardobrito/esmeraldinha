import {
  checkApiHealth,
  checkConnectionError,
  setApiAvailable,
} from '@composables/useApiStatus'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()

  const api = $fetch.create({
    baseURL: (config.public.apiBaseUrl as string) ?? 'http://127.0.0.1:8000',

    onRequestError({ error }) {
      const isConnectionError = checkConnectionError(error)
      if (isConnectionError) {
        navigateTo('/server-error')
      }

      return
    },

    onResponse() {
      setApiAvailable()
    },

    onResponseError({ error }) {
      const isConnectionError = checkConnectionError(error)

      if (isConnectionError) {
        navigateTo('/server-error')
      }

      return
    },
  })

  await checkApiHealth()

  return {
    provide: {
      api,
    },
  }
})
