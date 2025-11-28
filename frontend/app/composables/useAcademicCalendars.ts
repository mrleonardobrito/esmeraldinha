import type { AcademicCalendar, PaginatedResponse } from '@types'
import { useErrorToast } from '@composables/useErrorToast'
import { useNuxtApp } from 'nuxt/app'

export const useAcademicCalendars = () => {
  const { $api } = useNuxtApp()
  const { withErrorHandling } = useErrorToast()
  const basePath = '/api/academic-calendars/'

  const list = () =>
    withErrorHandling(
      () => $api<PaginatedResponse<AcademicCalendar>>(basePath),
      { title: 'Erro ao carregar calendários acadêmicos', mode: 'toast' },
    )

  const listRaw = () => $api<PaginatedResponse<AcademicCalendar>>(basePath)

  return {
    list,
    listRaw,
  }
}
