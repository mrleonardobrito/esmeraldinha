import type { School, PaginatedResponse, PaginationParams } from '../types'
import { useErrorToast } from './useErrorToast'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/schools/'

  const list = (params?: PaginationParams) =>
    withErrorHandling(
      () => $api<PaginatedResponse<School>>(basePath, { params }),
      { title: 'Erro ao carregar escolas', mode: 'toast' },
    )

  return {
    list,
  }
}
