import type { School, PaginatedResponse } from '../types'
import { useErrorToast } from './useErrorToast'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/schools/'

  const list = () =>
    withErrorHandling(
      () => $api<PaginatedResponse<School>>(basePath),
      { title: 'Erro ao carregar escolas', mode: 'toast' }
    )

  const listRaw = () =>
    $api<PaginatedResponse<School>>(basePath)

  return {
    list,
    listRaw,
  }
}
