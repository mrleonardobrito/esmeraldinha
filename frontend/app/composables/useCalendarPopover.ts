import type { DayType } from '@types'

export const useCalendarPopover = () => {
  const editingDay = ref<string | null>(null)
  const editingDayDate = ref<Date | null>(null)
  const popoverPosition = ref({ x: 0, y: 0 })

  const openPopover = (event: MouseEvent, date: string, dateObj: Date) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    popoverPosition.value = { x: rect.left + rect.width / 2, y: rect.bottom + 8 }
    editingDay.value = date
    editingDayDate.value = dateObj
  }

  const closePopover = () => {
    editingDay.value = null
    editingDayDate.value = null
  }

  const updateDayType = (
    updateFn: (date: string, newType: DayType) => void,
  ) => (date: string, newType: DayType) => {
    updateFn(date, newType)
    closePopover()
  }

  onMounted(() => {
    document.addEventListener('click', (e) => {
      if (editingDay.value
        && !(e.target as HTMLElement).closest('.day-popover-container')
        && !(e.target as HTMLElement).closest('[class*="fixed"]')) {
        closePopover()
      }
    })
  })

  return {
    editingDay: readonly(editingDay),
    editingDayDate: readonly(editingDayDate),
    popoverPosition: readonly(popoverPosition),
    openPopover,
    closePopover,
    updateDayType,
  }
}
