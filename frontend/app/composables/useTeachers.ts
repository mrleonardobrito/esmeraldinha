import type {
  Teacher,
  TeacherCreate,
  TeacherUpdate,
  PaginatedResponse,
  PaginationParams,
} from '@types'
import { useErrorToast } from '@composables/useErrorToast'
import { useNuxtApp } from 'nuxt/app'

export const useTeachers = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/teachers/'

  const list = async (params?: PaginationParams) => {
    const result = await withErrorHandling<PaginatedResponse<Teacher>>(
      () => $api<PaginatedResponse<Teacher>>(basePath, { params }),
      { title: 'Erro ao carregar professores', mode: 'toast' },
    )

    return result ?? { count: 0, next: null, previous: null, results: [] }
  }

  const create = (payload: TeacherCreate) =>
    withErrorHandling(
      () =>
        $api<Teacher>(basePath, {
          method: 'POST',
          body: payload,
        }),
      { title: 'Erro ao criar professor', mode: 'toast' },
    )

  const update = (id: number, payload: TeacherUpdate) =>
    withErrorHandling(
      () =>
        $api<Teacher>(`${basePath}${id}/`, {
          method: 'PATCH',
          body: payload,
        }),
      { title: 'Erro ao atualizar professor', mode: 'toast' },
    )

  const destroy = (id: number) =>
    withErrorHandling(
      () =>
        $api<null>(`${basePath}${id}/`, {
          method: 'DELETE',
        }),
      { title: 'Erro ao excluir professor', mode: 'toast' },
    )

  const listRaw = (params?: PaginationParams) =>
    $api<PaginatedResponse<Teacher>>(basePath, { params })

  const retrieveRaw = (id: number) => $api<Teacher>(`${basePath}${id}/`)

  const createRaw = (payload: TeacherCreate) =>
    $api<Teacher>(basePath, {
      method: 'POST',
      body: payload,
    })

  const updateRaw = (id: number, payload: TeacherUpdate) =>
    $api<Teacher>(`${basePath}${id}/`, {
      method: 'PATCH',
      body: payload,
    })

  const destroyRaw = (id: number) =>
    $api<null>(`${basePath}${id}/`, {
      method: 'DELETE',
    })

  return {
    list,
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
