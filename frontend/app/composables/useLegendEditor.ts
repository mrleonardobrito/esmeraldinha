import type { DayType, CalendarData } from '@types'

export const useLegendEditor = (
  calendarData: CalendarData,
  emit: (event: 'update:calendarData', value: CalendarData) => void,
) => {
  const editingColorFor = ref<DayType | null>(null)

  const updateLegendColor = (type: DayType, color: string) => {
    const updatedLegend = calendarData.legend.map(item =>
      item.type === type
        ? { ...item, color_hex: color }
        : item,
    )

    const updatedCalendarData: CalendarData = {
      ...calendarData,
      legend: updatedLegend,
    }

    emit('update:calendarData', updatedCalendarData)
    editingColorFor.value = null
  }

  const toggleColorEditor = (type: DayType) => {
    editingColorFor.value = editingColorFor.value === type ? null : type
  }

  return {
    editingColorFor: readonly(editingColorFor),
    updateLegendColor,
    toggleColorEditor,
  }
}
