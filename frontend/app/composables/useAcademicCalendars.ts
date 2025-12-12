import type { AcademicCalendar, PaginatedResponse, CalendarData, LegendItem, AcademicCalendarSummary } from '@types'
import { useNuxtApp } from 'nuxt/app'
import { generateCalendarAttributes, getLegendByType, getLegendOptions } from '@app/utils/academic-calendar'

export const useAcademicCalendars = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/academic-calendars/'

  const list = () => $api<PaginatedResponse<AcademicCalendarSummary>>(basePath)

  const getByYear = (year: number) =>
    $api<AcademicCalendar>(`${basePath}${year}/`)

  const initializeCalendar = (year: number, defaultLegendType?: string) =>
    $api<AcademicCalendar>(`${basePath}${year}/initialize/`, {
      method: 'POST',
      body: {
        default_legend_type: defaultLegendType,
      },
    })

  const saveCalendar = (year: number, calendarData: CalendarData) =>
    $api<AcademicCalendar>(`${basePath}${year}/`, {
      method: 'PUT',
      body: {
        year,
        calendar_data: calendarData,
      },
    })

  const listLegends = async () => {
    const response = await $api<PaginatedResponse<LegendItem>>(`/api/legends/`)
    return response.results
  }

  const processCalendar = async (year: number, file: File, selectedLegendType?: string) => {
    const formData = new FormData()
    formData.append('calendar_file', file)
    if (selectedLegendType) {
      formData.append('default_legend_type', selectedLegendType)
    }

    return $api<AcademicCalendar>(`${basePath}${year}/process-pdf/`, {
      method: 'POST',
      body: formData,
    })
  }
  return {
    list,
    getByYear,
    initializeCalendar,
    saveCalendar,
    listLegends,
    processCalendar,
    generateCalendarAttributes,
    getLegendByType,
    getLegendOptions,
  }
}
