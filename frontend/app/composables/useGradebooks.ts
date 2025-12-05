import type {
  Gradebook,
  GradebookCreate,
  GradebookUpdate,
  PaginatedResponse,
  PaginationParams,
} from '@types'
import { useNuxtApp } from 'nuxt/app'

export const useGradebooks = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/gradebooks/'

  const list = (params?: PaginationParams) => $api<PaginatedResponse<Gradebook>>(basePath, { params })

  const retrieve = (id: number) => $api<Gradebook>(`${basePath}${id}/`)

  const create = (payload: GradebookCreate) => $api<Gradebook>(basePath, { method: 'POST', body: payload })

  const update = (id: number, payload: GradebookUpdate) =>
    $api<Gradebook>(`${basePath}${id}/`, { method: 'PATCH', body: payload })

  const destroy = (id: number) =>
    $api<null>(`${basePath}${id}/`, { method: 'DELETE' })

  return {
    list,
    retrieve,
    create,
    update,
    destroy,
  }
}
