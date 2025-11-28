import type {
  Gradebook,
  GradebookCreate,
  GradebookUpdate,
  PaginationParams,
  PaginatedResponse,
} from '../types'
import { useErrorToast } from './useErrorToast'
import { useNuxtApp } from '#imports'

export const useGradebooks = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/gradebooks/'

  const list = async (params?: PaginationParams): Promise<PaginatedResponse<Gradebook>> => {
    const result = await withErrorHandling(
      () => $api<PaginatedResponse<Gradebook>>(basePath, { params }),
      { title: 'Erro ao carregar cadernos de notas', mode: 'toast' },
    )
    if (!result) {
      // Return empty response if error occurred
      return { count: 0, next: null, previous: null, results: [] }
    }
    return result
  }

  const retrieve = (id: number) =>
    withErrorHandling(() => $api<Gradebook>(`${basePath}${id}/`), {
      title: 'Erro ao carregar caderno de notas',
      mode: 'toast',
    })

  const create = (payload: GradebookCreate) =>
    withErrorHandling(
      () =>
        $api<Gradebook>(basePath, {
          method: 'POST',
          body: payload,
        }),
      { title: 'Erro ao criar caderno de notas', mode: 'toast' },
    )

  const update = (id: number, payload: GradebookUpdate) =>
    withErrorHandling(
      () =>
        $api<Gradebook>(`${basePath}${id}/`, {
          method: 'PATCH',
          body: payload,
        }),
      { title: 'Erro ao atualizar caderno de notas', mode: 'toast' },
    )

  const destroy = (id: number) =>
    withErrorHandling(
      () =>
        $api<null>(`${basePath}${id}/`, {
          method: 'DELETE',
        }),
      { title: 'Erro ao excluir caderno de notas', mode: 'toast' },
    )

  const listRaw = (params?: PaginationParams) =>
    $api<PaginatedResponse<Gradebook>>(basePath, { params })

  const retrieveRaw = (id: number) => $api<Gradebook>(`${basePath}${id}/`)

  const createRaw = (payload: GradebookCreate) =>
    $api<Gradebook>(basePath, {
      method: 'POST',
      body: payload,
    })

  const updateRaw = (id: number, payload: GradebookUpdate) =>
    $api<Gradebook>(`${basePath}${id}/`, {
      method: 'PATCH',
      body: payload,
    })

  const destroyRaw = (id: number) =>
    $api<null>(`${basePath}${id}/`, {
      method: 'DELETE',
    })

  return {
    list,
    retrieve,
    create,
    update,
    destroy,
    listRaw,
    retrieveRaw,
    createRaw,
    updateRaw,
    destroyRaw,
  }
}
