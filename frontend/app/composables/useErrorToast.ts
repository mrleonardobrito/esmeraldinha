import { checkConnectionError } from '@composables/useApiStatus'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { ApiErrorResponse } from '@types'
import { createError } from 'nuxt/app'

const toast = useToast()

interface ErrorWithData {
  data?: Record<string, unknown>
  error?: unknown
  message?: unknown
  status_code?: unknown
  detail?: unknown
}

type ErrorHandlingMode = 'page' | 'toast'

interface ErrorHandlerOptions {
  mode?: ErrorHandlingMode
  title?: string
}

const DEFAULT_ERROR_TITLE = 'Erro'
const DEFAULT_ERROR_MESSAGE = 'Erro desconhecido'

const isApiErrorResponse = (obj: unknown): obj is ApiErrorResponse => {
  if (!obj || typeof obj !== 'object') return false

  const error = obj as Record<string, unknown>
  return (
    typeof error.error === 'string'
    && typeof error.message === 'string'
    && typeof error.status_code === 'number'
  )
}

const extractApiError = (error: unknown): ApiErrorResponse | null => {
  if (!error || typeof error !== 'object') return null

  const errorObj = error as ErrorWithData

  if (errorObj.data && typeof errorObj.data === 'object') {
    if (isApiErrorResponse(errorObj.data)) {
      return {
        error: errorObj.data.error,
        message: errorObj.data.message,
        detail: errorObj.data.detail,
        status_code: errorObj.data.status_code,
      }
    }
  }

  if (isApiErrorResponse(errorObj)) {
    return {
      error: errorObj.error,
      message: errorObj.message,
      detail: errorObj.detail,
      status_code: errorObj.status_code,
    }
  }

  return null
}

const formatErrorDetail = (
  detail: string | Record<string, unknown> | unknown[],
): string => {
  if (typeof detail === 'string') {
    return `Detalhes: ${detail}`
  }
  return `Detalhes:\n${JSON.stringify(detail, null, 2)}`
}

const formatErrorMessage = (error: unknown): string => {
  const apiError = extractApiError(error)

  if (apiError) {
    const baseMessage = `[${apiError.error}] ${apiError.message}`
    return apiError.detail
      ? `${baseMessage}\n\n${formatErrorDetail(apiError.detail)}`
      : baseMessage
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>
    if ('message' in errorObj && errorObj.message) {
      return String(errorObj.message)
    }
    return JSON.stringify(error, null, 2)
  }

  return DEFAULT_ERROR_MESSAGE
}

export const useErrorToast = () => {
  const showErrorPage = (title: string, error: unknown) => {
    const errorMessage = formatErrorMessage(error)
    throw createError({
      statusCode: 500,
      statusMessage: title,
      data: {
        message: errorMessage,
      },
    })
  }

  const showToastError = (title: string, error: unknown) => {
    const errorMessage = formatErrorMessage(error)
    toast.add({
      title,
      color: 'error',
      description: errorMessage,
    })
  }

  const withErrorHandling = async <T>(
    apiCall: () => Promise<T>,
    options: ErrorHandlerOptions = {},
  ): Promise<T | null> => {
    try {
      return await apiCall()
    }
    catch (error) {
      const isConnectionError = checkConnectionError(error)

      if (!isConnectionError) {
        const title = options.title || DEFAULT_ERROR_TITLE
        const mode = options.mode || 'session'

        if (mode === 'page') {
          showErrorPage(title, error)
        }
        else {
          showToastError(title, error)
        }
      }

      return null
    }
  }

  return {
    withErrorHandling,
    showErrorPage,
    showToastError,
  }
}
