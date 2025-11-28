import type { School, PaginatedResponse, PaginationParams } from '../types'
import { useErrorToast } from './useErrorToast'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/schools/'

  const list = async (params?: PaginationParams): Promise<PaginatedResponse<School>> => {
    const result = await withErrorHandling(
      () => $api<PaginatedResponse<School>>(basePath, { params }),
      { title: 'Erro ao carregar escolas', mode: 'toast' },
    )
    if (!result) {
      // Return empty response if error occurred
      return { count: 0, next: null, previous: null, results: [] }
    }
    return result
  }

  return {
    list,
  }
}
