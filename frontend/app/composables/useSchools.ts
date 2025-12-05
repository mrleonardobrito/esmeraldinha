import type { PaginatedResponse, PaginationParams, School } from '@types'
import { useNuxtApp } from 'nuxt/app'

export const useSchools = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/schools/'

  const list = (params: PaginationParams = { page: 1, page_size: 100 }) => $api<PaginatedResponse<School>>(basePath, { params })

  return {
    list,
  }
}
