import type { Teacher, TeacherCreate, TeacherUpdate, PaginatedResponse, PaginationParams } from '../types'
import { useErrorToast } from './useErrorToast'

export const useTeachers = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/teachers/'

  // Versões com tratamento automático de erro (retornam null em caso de erro)
  const list = (params?: PaginationParams) =>
    withErrorHandling(
      () => $api<PaginatedResponse<Teacher>>(basePath, { params }),
      { title: 'Erro ao carregar professores', mode: 'toast' }
    )

  const create = (payload: TeacherCreate) =>
    withErrorHandling(
      () => $api<Teacher>(basePath, {
        method: 'POST',
        body: payload,
      }),
      { title: 'Erro ao criar professor', mode: 'toast' }
    )

  const update = (id: number, payload: TeacherUpdate) =>
    withErrorHandling(
      () => $api<Teacher>(`${basePath}${id}/`, {
        method: 'PATCH',
        body: payload,
      }),
      { title: 'Erro ao atualizar professor', mode: 'toast' }
    )

  const destroy = (id: number) =>
    withErrorHandling(
      () => $api<null>(`${basePath}${id}/`, {
        method: 'DELETE',
      }),
      { title: 'Erro ao excluir professor', mode: 'toast' }
    )

  // Versões sem tratamento automático (para useAsyncData, etc.)
  const listRaw = (params?: PaginationParams) =>
    $api<PaginatedResponse<Teacher>>(basePath, { params })

  const retrieveRaw = (id: number) =>
    $api<Teacher>(`${basePath}${id}/`)

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
    // Métodos com tratamento automático
    list,
    create,
    update,
    destroy,
    // Métodos sem tratamento automático
    listRaw,
    retrieveRaw,
    createRaw,
    updateRaw,
    destroyRaw,
  }
}
