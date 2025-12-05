import type { AcademicCalendar, PaginatedResponse } from '@types'
import { useNuxtApp } from 'nuxt/app'

export const useAcademicCalendars = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/academic-calendars/'

  const list = () => $api<PaginatedResponse<AcademicCalendar>>(basePath)

  return {
    list,
  }
}
