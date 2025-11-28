import { readonly, ref } from 'vue'
import type { ApiErrorResponse } from '../types'
import { checkConnectionError } from './useApiStatus'
import { createError } from 'nuxt/app'
import { useToast } from '@nuxt/ui/composables/useToast'

interface ErrorToastOptions {
  duration?: number
  close?: boolean
}

interface ErrorWithData {
  data?: Record<string, unknown>
  error?: unknown
  message?: unknown
  status_code?: unknown
  detail?: unknown
}

type ErrorHandlingMode = 'toast' | 'page' | 'session'

interface ErrorHandlerOptions extends ErrorToastOptions {
  mode?: ErrorHandlingMode
}

const DEFAULT_ERROR_TITLE = 'Erro'
const DEFAULT_ERROR_MESSAGE = 'Erro desconhecido'
const DEFAULT_TOAST_DESCRIPTION = 'Clique para ver os detalhes do erro'
const DEFAULT_TOAST_DURATION = 3000

const sessionError = ref<{
  show: boolean
  title: string
  message: string
  details?: string
} | null>(null)

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

const parseErrorParams = (
  titleOrError: string | unknown,
  error?: unknown,
): { title: string, error: unknown } => {
  if (error === undefined) {
    const apiError = extractApiError(titleOrError)
    return {
      title: apiError?.message || DEFAULT_ERROR_TITLE,
      error: titleOrError,
    }
  }

  return {
    title: titleOrError as string,
    error,
  }
}

export const useErrorToast = () => {
  const toast = useToast()

  const clearSessionError = () => {
    sessionError.value = null
  }

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

  const showErrorToast = (
    title: string,
    error: unknown,
    description?: string,
    options?: ErrorToastOptions,
  ) => {
    const apiError = extractApiError(error)

    const toastDescription
      = apiError?.message || description || DEFAULT_TOAST_DESCRIPTION

    toast.add({
      title,
      description: toastDescription,
      color: 'error',
      duration: options?.duration ?? DEFAULT_TOAST_DURATION,
      close: options?.close ?? true,
    })
  }

  const showSessionError = (title: string, error: unknown) => {
    const errorMessage = formatErrorMessage(error)
    sessionError.value = {
      show: true,
      title,
      message: errorMessage,
      details: errorMessage,
    }
  }

  const showError = (
    titleOrError: string | unknown,
    error?: unknown,
    description?: string,
    options?: ErrorHandlerOptions,
  ) => {
    const { title, error: actualError } = parseErrorParams(titleOrError, error)
    const mode = options?.mode || 'toast'

    switch (mode) {
      case 'page':
        showErrorPage(title, actualError)
        break
      case 'session':
        showSessionError(title, actualError)
        break
      case 'toast':
      default:
        showErrorToast(title, actualError, description, options)
        break
    }
  }

  const withErrorHandling = async <T>(
    apiCall: () => Promise<T>,
    options: {
      mode?: ErrorHandlingMode
      title?: string
      description?: string
      toastOptions?: ErrorToastOptions
    } = {},
  ): Promise<T | null> => {
    try {
      return await apiCall()
    }
    catch (error) {
      const isConnectionError = checkConnectionError(error)

      if (!isConnectionError) {
        const title = options.title || 'Erro na operação'
        showError(title, error, options.description, {
          mode: options.mode || 'toast',
          ...options.toastOptions,
        })
      }

      return null
    }
  }

  return {
    showError,
    showErrorToast,
    showErrorPage,
    showSessionError,
    withErrorHandling,
    formatErrorMessage,
    extractApiError,
    clearSessionError,
    sessionError: readonly(sessionError),
  }
}
