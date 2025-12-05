import type {
  PaginatedResponse,
  PaginationParams,
  Teacher,
  TeacherCreate,
  TeacherUpdate,
} from '@types'
import { useNuxtApp } from 'nuxt/app'

export const useTeachers = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/teachers/'

  const list = (params?: PaginationParams) => $api<PaginatedResponse<Teacher>>(basePath, { params })

  const create = (payload: TeacherCreate) => $api<Teacher>(basePath, { method: 'POST', body: payload })

  const update = (id: number, payload: TeacherUpdate) =>
    $api<Teacher>(`${basePath}${id}/`, { method: 'PATCH', body: payload })

  const destroy = (id: number) =>
    $api<null>(`${basePath}${id}/`, { method: 'DELETE' })

  return {
    list,
    create,
    update,
    destroy,
  }
}
