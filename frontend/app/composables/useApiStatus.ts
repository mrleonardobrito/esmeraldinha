export const useApiStatus = () => {
  const isApiAvailable = ref(true)
  const lastConnectionError = ref<string | null>(null)

  const setApiUnavailable = (errorMessage?: string) => {
    isApiAvailable.value = false
    lastConnectionError.value = errorMessage || 'Não foi possível conectar aos servidores'
  }

  const setApiAvailable = () => {
    isApiAvailable.value = true
    lastConnectionError.value = null
  }

  const checkConnectionError = (error: any): boolean => {
    if (!error) return false

    const errorMessage = error.message || error.toString() || ''
    const errorCode = error.code || error.status || ''

    // Verificar por mensagens de erro de conexão comuns
    const connectionErrorPatterns = [
      'ERR_CONNECTION_REFUSED',
      'ERR_NETWORK',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'fetch failed',
      'Failed to fetch',
      'NetworkError',
      'Load failed'
    ]

    const hasConnectionError = connectionErrorPatterns.some(pattern =>
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    )

    if (hasConnectionError) {
      setApiUnavailable(errorMessage)
      return true
    }

    // Se não é erro de conexão, marcar API como disponível
    setApiAvailable()
    return false
  }

  return {
    isApiAvailable: readonly(isApiAvailable),
    lastConnectionError: readonly(lastConnectionError),
    setApiUnavailable,
    setApiAvailable,
    checkConnectionError
  }
}
