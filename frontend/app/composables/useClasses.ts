import type {
  Class,
  ClassCreate,
  ClassUpdate,
  PaginatedResponse,
  PaginationParams,
} from '@types'
import { useNuxtApp } from 'nuxt/app'

interface ListClassesInTeacherParams extends PaginationParams {
  teacher_id?: number
  school_id?: number
}

export const useClasses = () => {
  const { $api } = useNuxtApp()

  const list = (
    params: ListClassesInTeacherParams = { page: 1, page_size: 100 },
  ) => $api<PaginatedResponse<Class>>(`/api/classes/`, { params })

  const create = (payload: ClassCreate) => $api<Class>(`/api/classes/`, { method: 'POST', body: payload })

  const update = (id: number, payload: ClassUpdate) => $api<Class>(`/api/classes/${id}/`, { method: 'PATCH', body: payload })
  const destroy = (id: number) => $api<null>(`/api/classes/${id}/`, { method: 'DELETE' })

  return {
    list,
    create,
    update,
    destroy,
  }
}
