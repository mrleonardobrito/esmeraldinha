import type { AcademicCalendar, PaginatedResponse, CalendarData, LegendItem } from '@types'
import { useNuxtApp } from 'nuxt/app'
import { generateCalendarAttributes, getLegendByType, getLegendOptions } from '@app/utils/academic-calendar'

export const useAcademicCalendars = () => {
  const { $api } = useNuxtApp()
  const basePath = '/api/academic-calendars/'

  const list = () => $api<PaginatedResponse<AcademicCalendar>>(basePath)
  const upload = (file: File) => {
    const formData = new FormData()
    formData.append('calendar_file', file)
    return $api<AcademicCalendar>(basePath, {
      method: 'POST',
      body: formData,
    })
  }

  // Buscar legendas do backend Django
  const listLegends = async () => {
    const response = await $api<PaginatedResponse<LegendItem>>('/api/legends/')
    return response.results
  }

  // Processar calendário via endpoint do Django
  // Rota: POST /api/academic-calendars/process/
  // Mescla dados do PDF processado com fixtures do banco de dados
  const processCalendar = async (file: File, selectedLegendType?: string) => {
    const formData = new FormData()
    formData.append('calendar_file', file)
    if (selectedLegendType) {
      formData.append('default_legend_type', selectedLegendType)
    }

    // Chamada para o endpoint do Django que processa o PDF e mescla com fixtures
    // O backend busca dias específicos das fixtures e mescla com os dias processados do PDF
    // Prioridade: PDF processado > Fixtures > Tipo padrão
    return $api<CalendarData>(`${basePath}process/`, {
      method: 'POST',
      body: formData,
    })
  }
  return {
    list,
    upload,
    listLegends,
    processCalendar,
    generateCalendarAttributes,
    getLegendByType,
    getLegendOptions,
  }
}
