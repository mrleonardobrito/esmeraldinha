import type { School, PaginatedResponse } from '../types'
import { useErrorToast } from './useErrorToast'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/schools/'

  // Versão com tratamento automático de erro (retorna null em caso de erro)
  const list = () =>
    withErrorHandling(
      () => $api<PaginatedResponse<School>>(basePath),
      { title: 'Erro ao carregar escolas', mode: 'toast' }
    )

  // Versão sem tratamento automático (para useAsyncData, etc.)
  const listRaw = () =>
    $api<PaginatedResponse<School>>(basePath)

  return {
    list,
    listRaw,
  }
}
