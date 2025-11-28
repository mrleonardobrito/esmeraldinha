import type { School, PaginatedResponse, PaginationParams } from '@types'
import { useErrorToast } from '@composables/useErrorToast'
import { useNuxtApp } from 'nuxt/app'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/schools/'

  const list = async (params?: PaginationParams): Promise<PaginatedResponse<School>> => {
    const result = await withErrorHandling<PaginatedResponse<School>>(
      () => $api<PaginatedResponse<School>>(basePath, { params }),
      { title: 'Erro ao carregar escolas', mode: 'toast' },
    )
    return result ?? { count: 0, next: null, previous: null, results: [] }
  }

  return {
    list,
  }
}
