import type { Day, LegendItem, DayType } from '@types'
import { DEFAULT_TYPE_COLORS, CALENDAR_CONFIG } from '../constants/academic-calendar'

// Helper para converter dias em atributos do VCalendar
// Formato esperado: [{ key, dates, dot: { color }, popover }...]
export const generateCalendarAttributes = (days: Day[], legends: LegendItem[]) => {
  const attributes: Array<{
    key: string
    dates: string[]
    dot: { color: string, class: string }
    popover: { label: string, hideIndicator: boolean }
  }> = []

  // Agrupar dias por tipo
  const daysByType = days.reduce((acc, day) => {
    if (!acc[day.type]) {
      acc[day.type] = []
    }
    acc[day.type]!.push(day)
    return acc
  }, {} as Record<string, Day[]>)

  // Criar atributos para cada tipo
  Object.entries(daysByType).forEach(([type, typeDays]) => {
    const legend = legends.find(l => l.type === type)
    console.log(`Processing type: ${type}, legend found:`, legend, `days count:`, typeDays.length)
    
    if (legend?.color_hex) {
      // Garantir que as datas estão no formato correto (YYYY-MM-DD)
      const dates = typeDays
        .map(d => {
          // Se já está no formato string ISO, usar diretamente
          if (typeof d.date === 'string') {
            return d.date
          }
          // Caso contrário, converter para formato ISO
          try {
            return new Date(d.date).toISOString().split('T')[0]
          } catch {
            return null
          }
        })
        .filter((date): date is string => date !== null && date !== undefined)
      
      console.log(`Type ${type}: ${dates.length} valid dates out of ${typeDays.length}`)
      
      if (dates.length > 0) {
        const attribute = {
          key: type,
          dates,
          dot: {
            color: legend.color_hex,
            class: 'calendar-day-dot',
          },
          popover: {
            label: legend.description,
            hideIndicator: true,
          },
        }
        console.log(`Adding attribute for ${type}:`, attribute)
        attributes.push(attribute)
      } else {
        console.warn(`No valid dates for type ${type}`)
      }
    } else {
      console.warn(`No legend or color_hex found for type ${type}`)
    }
  })
  
  console.log('Generated calendar attributes:', attributes)
  console.log('Total attributes:', attributes.length)

  return attributes
}

// Helper para obter legenda por tipo
export const getLegendByType = (legends: LegendItem[], type: string) => {
  return legends.find(legend => legend.type === type)
}

// Helper para obter todas as legendas disponíveis como opções para select
export const getLegendOptions = (legends: LegendItem[]) => {
  return legends.map(legend => ({
    label: legend.description,
    value: legend.type,
    color: legend.color_hex,
  }))
}

// Date utilities
export const formatDateToISO = (date: Date): string => {
  // Usar métodos locais como fallback
  // Se a data vier em UTC, precisamos normalizar para local primeiro
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  const year = localDate.getFullYear()
  const month = String(localDate.getMonth() + 1).padStart(2, '0')
  const day = String(localDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const monthName = (month: number): string => {
  const base = new Date(2000, month - 1, 1)
  return base.toLocaleDateString('pt-BR', { month: 'short' })
}

// Calendar colors utilities
export const getTypeColor = (type: DayType, legendItems: LegendItem[]): string => {
  const fromLegend = legendItems.find(l => l.type === type)?.color_hex
  return fromLegend || DEFAULT_TYPE_COLORS[type]
}

export const getCurrentColor = (type: DayType, legendItems: LegendItem[]): string => {
  const item = legendItems.find(l => l.type === type)
  return item?.color_hex || DEFAULT_TYPE_COLORS[type]
}

export const legendCircleStyle = (item: LegendItem) => {
  const color = item.color_hex || DEFAULT_TYPE_COLORS[item.type]
  return {
    backgroundColor: `${color}${CALENDAR_CONFIG.CIRCLE_OPACITY}`,
    borderColor: color,
  }
}

export const calendarHighlightStyle = (type: DayType, legendItems: LegendItem[]) => {
  const color = getTypeColor(type, legendItems)
  return {
    backgroundColor: `${color}${CALENDAR_CONFIG.HIGHLIGHT_OPACITY}`,
    borderColor: 'transparent',
    borderWidth: '0px',
  }
}
