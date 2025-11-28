import { ref, readonly } from 'vue'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
const HEALTH_PATH = '/api/health/'

const CONNECTION_ERROR_PATTERNS = [
  'ERR_CONNECTION_REFUSED',
  'ERR_NETWORK',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'fetch failed',
  'Failed to fetch',
  'NetworkError',
  'Load failed',
] as const

const isApiAvailable = ref(true)
const lastConnectionError = ref<string | null>(null)

type ApiLikeError = {
  message?: string
  code?: string | number
  status?: string | number
} & Record<string, unknown>

const normalizeError = (error: unknown): { message: string, code: string } => {
  if (!error) {
    return { message: '', code: '' }
  }

  if (error instanceof Error) {
    return { message: error.message, code: '' }
  }

  const errorObj = error as ApiLikeError
  const message
    = (errorObj.message as string)
      || (typeof error === 'string' ? error : '')
      || error.toString?.()
      || ''
  const code
    = String(errorObj.code ?? '') || String(errorObj.status ?? '') || ''

  return { message, code }
}

const hasConnectionErrorPattern = (message: string, code: string): boolean => {
  if (!message && !code) return false

  return CONNECTION_ERROR_PATTERNS.some(
    pattern => message.includes(pattern) || code.includes(pattern),
  )
}

export const setApiUnavailable = (errorMessage?: string) => {
  isApiAvailable.value = false
  lastConnectionError.value
    = errorMessage || 'Não foi possível conectar aos servidores'
}

export const setApiAvailable = () => {
  isApiAvailable.value = true
  lastConnectionError.value = null
}

export const checkConnectionError = (error: unknown): boolean => {
  const { message, code } = normalizeError(error)

  if (!message && !code) {
    setApiAvailable()
    return false
  }

  const isConnectionError = hasConnectionErrorPattern(message, code)

  if (isConnectionError) {
    setApiUnavailable(message || code || undefined)
    return true
  }

  setApiAvailable()
  return false
}

type CheckApiHealthOptions = {
  baseURL?: string
  path?: string
  fetchFn?: typeof fetch
}

export const checkApiHealth = async (
  options: CheckApiHealthOptions = {},
): Promise<boolean> => {
  const {
    baseURL = DEFAULT_BASE_URL,
    path = HEALTH_PATH,
    fetchFn = fetch,
  } = options

  try {
    const response = await fetchFn(`${baseURL}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.ok) {
      setApiAvailable()
      return true
    }

    setApiUnavailable(
      `Erro HTTP ${response.status}: ${response.statusText || 'Desconhecido'}`,
    )
    return false
  }
  catch (error) {
    checkConnectionError(error)
    return false
  }
}

export const useApiStatus = () => ({
  isApiAvailable: readonly(isApiAvailable),
  lastConnectionError: readonly(lastConnectionError),
  setApiUnavailable,
  setApiAvailable,
  checkConnectionError,
  checkApiHealth,
})
