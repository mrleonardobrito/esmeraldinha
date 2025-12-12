<script setup lang="ts">
import type { CalendarData, Day, DayType, LegendItem, StageId } from '@types'
import {
  LETIVO_TYPES,
  NAO_LETIVO_TYPES,
  DAY_TYPE_LABELS,
  DEFAULT_TYPE_COLORS,
  STAGE_COLORS,
  CALENDAR_CONFIG,
} from '../constants/academic-calendar'
import {
  formatDateToISO,
  monthName,
  getCurrentColor,
  legendCircleStyle,
  calendarHighlightStyle,
} from '../utils/academic-calendar'
import { useCalendarPopover } from '../composables/useCalendarPopover'
import { useLegendEditor } from '../composables/useLegendEditor'

const props = defineProps<{
  calendarData: CalendarData
}>()

const emit = defineEmits<{
  'update:calendarData': [value: CalendarData]
}>()

const { editingDay, editingDayDate, popoverPosition, openPopover, updateDayType: updateDayTypeWithClose } = useCalendarPopover()
const { editingColorFor, updateLegendColor, toggleColorEditor } = useLegendEditor(props.calendarData, emit)

const isSidebarExpanded = ref(false)

const dayMap = computed<Record<string, Day>>(() => {
  return Object.fromEntries(props.calendarData.days.map(d => [d.date, d]))
})

const legendItems = computed<LegendItem[]>(() => props.calendarData.legend ?? [])

const legendItemsLetivos = computed(() =>
  legendItems.value.filter(item => LETIVO_TYPES.includes(item.type)),
)

const legendItemsNaoLetivos = computed(() =>
  legendItems.value.filter(item => NAO_LETIVO_TYPES.includes(item.type)),
)

const legendLabel = (type: DayType): string => DAY_TYPE_LABELS[type] || type

const getDayType = (date: Date): DayType => {
  const iso = formatDateToISO(date)
  const day = dayMap.value[iso]
  return day?.type || 'nao_letivo'
}

const getCurrentColorWrapper = (type: DayType) => getCurrentColor(type, legendItems.value)
const legendCircleStyleWrapper = (item: LegendItem) => legendCircleStyle(item)
const calendarHighlightStyleWrapper = (type: DayType) => calendarHighlightStyle(type, legendItems.value)

type DayInfo = {
  date: Date
  dateISO?: string
  day?: number
  month?: number
  year?: number
}

const openDayEditor = (e: MouseEvent, day: DayInfo): void => {
  let dateStr: string

  if (day.dateISO) {
    dateStr = day.dateISO
  }
  else if (day.year && day.month !== undefined && day.day) {
    const year = day.year
    const month = String(day.month).padStart(2, '0')
    const dayNum = String(day.day + 1).padStart(2, '0')
    dateStr = `${year}-${month}-${dayNum}`
  }
  else {
    dateStr = formatDateToISO(day.date)
  }

  openPopover(e, dateStr, day.date)
}

const dayLabels = (date: Date): string[] | null => {
  const iso = formatDateToISO(date)
  const d = dayMap.value[iso]
  return d?.labels?.length ? d.labels : null
}

const updateCalendarDayType = (date: string, newType: DayType) => {
  const updatedDays = props.calendarData.days.map(day =>
    day.date === date ? { ...day, type: newType } : day,
  )

  if (!updatedDays.find(d => d.date === date)) {
    updatedDays.push({ date, type: newType, labels: [] })
  }

  const updatedCalendarData: CalendarData = {
    ...props.calendarData,
    days: updatedDays,
  }

  emit('update:calendarData', updatedCalendarData)
}

const handleUpdateDayType = updateDayTypeWithClose(updateCalendarDayType)

type CalendarAttribute = {
  key: string
  dates: Date[]
  highlight?: { style: Record<string, string> }
  dot?: { style: { backgroundColor: string } }
}

const calendarAttributes = computed(() => {
  const attrs: CalendarAttribute[] = []

  const byType = Object.fromEntries(
    Object.keys(DEFAULT_TYPE_COLORS).map(type => [type, [] as Date[]]),
  ) as Record<DayType, Date[]>

  for (const day of props.calendarData.days) {
    const dateObj = new Date(day.date)
    ;(byType[day.type] ??= []).push(dateObj)
  }

  for (const [type, dates] of Object.entries(byType) as [DayType, Date[]][]) {
    if (!dates.length) continue

    attrs.push({
      key: `type-${type}`,
      dates,
      highlight: { style: calendarHighlightStyleWrapper(type) },
    })
  }

  const byStage: Record<StageId, Date[]> = { I: [], II: [], III: [], IV: [] }
  for (const day of props.calendarData.days) {
    if (!day.stage) continue
    byStage[day.stage].push(new Date(day.date))
  }

  for (const [stage, dates] of Object.entries(byStage) as [StageId, Date[]][]) {
    if (!dates.length) continue

    attrs.push({
      key: `stage-${stage}`,
      dates,
      dot: { style: { backgroundColor: STAGE_COLORS[stage] } },
    })
  }

  return attrs
})
</script>

<template>
  <div class="w-full h-full flex flex-row gap-0 overflow-hidden">
    <div class="flex-1 flex flex-col gap-2 min-w-0 overflow-hidden">
      <div class="flex items-center justify-between px-1">
        <div class="text-xs font-medium text-slate-900 dark:text-slate-100">
          Calendário acadêmico {{ calendarData.year }}
        </div>
      </div>

      <div class="flex-1 overflow-hidden bg-transparent calendar-container">
        <VCalendar
          :rows="CALENDAR_CONFIG.ROWS"
          :columns="CALENDAR_CONFIG.COLUMNS"
          :from-page="{ year: calendarData.year, month: 1 }"
          :attributes="calendarAttributes"
          transparent
          borderless
          expandedmkjghjh,jhoihujokljerydf
          class="calendar-widget bg-transparent h-full"
        >
          <template #header-title="{ title }">
            <span class="text-[10px] font-semibold tracking-wide uppercase text-slate-900 dark:text-slate-100">
              {{ title }}
            </span>
          </template>

          <template #day-content="{ day }">
            <UTooltip
              :text="legendLabel(getDayType(day.date))"
              :delay-duration="0"
            >
              <div
                class="day-popover-container flex flex-col items-center justify-center gap-0.5 w-full h-full cursor-pointer hover:opacity-80 transition-opacity relative"
                @click.stop="openDayEditor($event, day)"
              >
                <span class="text-[10px] font-medium text-slate-900 dark:text-slate-100 leading-none relative z-10">
                  {{ day.day }}
                </span>
                <div
                  v-if="dayLabels(day.date)"
                  class="flex flex-wrap justify-center gap-0.5 relative z-10"
                >
                  <UTooltip
                    v-for="label in dayLabels(day.date)"
                    :key="label"
                    :text="label"
                  >
                    <span class="inline-flex h-1.5 w-6 rounded-full bg-slate-600 dark:bg-slate-300" />
                  </UTooltip>
                </div>
              </div>
            </UTooltip>
          </template>
        </VCalendar>
      </div>

      <Teleport to="body">
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          leave-active-class="transition-all duration-200 ease-in"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="editingDay && editingDayDate"
            class="fixed z-9999 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2 min-w-[200px]"
            :style="{
              left: `${popoverPosition.x}px`,
              top: `${popoverPosition.y}px`,
              transform: 'translateX(-50%)',
            }"
            @click.stop
          >
            <div class="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase">
              Alterar tipo do dia
            </div>
            <div class="space-y-1 max-h-48 overflow-y-auto">
              <button
                v-for="item in legendItems"
                :key="item.type"
                class="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-left hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                :class="{ 'bg-slate-100 dark:bg-slate-700': editingDayDate && getDayType(editingDayDate) === item.type }"
                @click="editingDay && handleUpdateDayType(editingDay, item.type)"
              >
                <span
                  class="inline-flex h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                  :style="legendCircleStyleWrapper(item)"
                />
                <span class="flex-1">{{ legendLabel(item.type) }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </Teleport>

      <div
        v-if="calendarData.monthly_meta?.length"
        class="text-[10px] text-slate-800 dark:text-slate-200 py-1"
      >
        <div class="font-semibold mb-0.5">
          Resumo de dias letivos por mês
        </div>
        <div class="grid grid-cols-4 gap-x-2 gap-y-0.5">
          <div
            v-for="meta in calendarData.monthly_meta"
            :key="meta.month"
            class="flex items-center justify-between"
          >
            <span>{{ monthName(meta.month) }}</span>
            <span class="font-semibold">{{ meta.school_days }}</span>
          </div>
        </div>
      </div>
    </div>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-300 ease-in"
      enter-from-class="opacity-0 w-0"
      enter-to-class="opacity-100 w-52"
      leave-from-class="opacity-100 w-52"
      leave-to-class="opacity-0 w-0"
    >
      <div
        v-if="isSidebarExpanded"
        class="w-52 h-full bg-white/50 dark:bg-slate-900/50 border-l border-slate-200 dark:border-slate-700 flex flex-col shrink-0 backdrop-blur-sm"
      >
        <div class="p-3 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Legenda
            </div>
            <UButton
              icon="i-heroicons-chevron-double-right"
              variant="ghost"
              size="xs"
              class="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              @click="isSidebarExpanded = false"
            />
          </div>
        </div>

        <div class="flex-1 p-3 overflow-y-auto">
          <div class="space-y-4">
            <div>
              <div class="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                Dias Letivos
              </div>
              <ul class="space-y-1.5 list-none">
                <li
                  v-for="item in legendItemsLetivos"
                  :key="item.type"
                  class="flex items-center gap-2 text-[11px] text-slate-900 dark:text-slate-100 group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-1 py-0.5 -mx-1 transition-colors"
                  @click="toggleColorEditor(item.type)"
                >
                  <span
                    class="inline-flex h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                    :style="legendCircleStyleWrapper(item)"
                  />
                  <span class="flex-1">{{ legendLabel(item.type) }}</span>
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    leave-active-class="transition-all duration-200 ease-in"
                    enter-from-class="opacity-0 w-0"
                    enter-to-class="opacity-100 w-6"
                    leave-from-class="opacity-100 w-6"
                    leave-to-class="opacity-0 w-0"
                  >
                    <input
                      v-if="editingColorFor === item.type"
                      type="color"
                      :value="getCurrentColorWrapper(item.type)"
                      class="h-4 w-6 rounded border border-slate-300 dark:border-slate-600 cursor-pointer shrink-0"
                      @click.stop
                      @input="updateLegendColor(item.type, ($event.target as HTMLInputElement).value)"
                    >
                  </Transition>
                </li>
              </ul>
            </div>

            <div>
              <div class="text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
                Dias Não Letivos
              </div>
              <ul class="space-y-1.5 list-none">
                <li
                  v-for="item in legendItemsNaoLetivos"
                  :key="item.type"
                  class="flex items-center gap-2 text-[11px] text-slate-900 dark:text-slate-100 group cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-1 py-0.5 -mx-1 transition-colors"
                  @click="toggleColorEditor(item.type)"
                >
                  <span
                    class="inline-flex h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
                    :style="legendCircleStyleWrapper(item)"
                  />
                  <span class="flex-1">{{ legendLabel(item.type) }}</span>
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    leave-active-class="transition-all duration-200 ease-in"
                    enter-from-class="opacity-0 w-0"
                    enter-to-class="opacity-100 w-6"
                    leave-from-class="opacity-100 w-6"
                    leave-to-class="opacity-0 w-0"
                  >
                    <input
                      v-if="editingColorFor === item.type"
                      type="color"
                      :value="getCurrentColorWrapper(item.type)"
                      class="h-4 w-6 rounded border border-slate-300 dark:border-slate-600 cursor-pointer shrink-0"
                      @click.stop
                      @input="updateLegendColor(item.type, ($event.target as HTMLInputElement).value)"
                    >
                  </Transition>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-300 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="!isSidebarExpanded"
        class="w-12 h-full bg-white/50 dark:bg-slate-900/50 border-l border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 backdrop-blur-sm hover:bg-white/70 dark:hover:bg-slate-900/70 transition-colors cursor-pointer group"
        @click="isSidebarExpanded = true"
      >
        <UButton
          icon="i-heroicons-chevron-double-left"
          variant="ghost"
          size="xs"
          class="text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100"
          @click.stop="isSidebarExpanded = true"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.calendar-container {
  background: transparent !important;
}

.calendar-widget {
  font-size: 0.75rem;
  background: transparent !important;
}

.calendar-widget :deep(.vc-container) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

.calendar-widget :deep(.vc-weeks),
.calendar-widget :deep(.vc-week),
.calendar-widget :deep(.vc-header),
.calendar-widget :deep(.vc-header-title),
.calendar-widget :deep(.vc-month),
.calendar-widget :deep(.vc-day),
.calendar-widget :deep(.vc-day-box),
.calendar-widget :deep(.vc-day-content),
.calendar-widget :deep(.vc-day-layer),
.calendar-widget :deep(.vc-day-title),
.calendar-widget :deep(.vc-weekday),
.calendar-widget :deep(.vc-weekdays),
.calendar-widget :deep(.vc-weekday-content),
.calendar-widget :deep(.vc-day-popover-container) {
  background: transparent !important;
  border: none;
}

.calendar-widget :deep(.vc-month) {
  padding: 0.25rem;
}

.calendar-widget :deep(.vc-day),
.calendar-widget :deep(.vc-day-box),
.calendar-widget :deep(.vc-day-content),
.calendar-widget :deep(.vc-day-layer) {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.calendar-widget :deep(.vc-day-content) {
  font-size: 0.7rem;
  padding: 0.125rem;
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  background: transparent !important;
}

.calendar-widget :deep(.vc-highlights) {
  pointer-events: none;
  z-index: 1;
  background: transparent !important;
}

.calendar-widget :deep(.vc-highlight) {
  border-radius: 0.375rem;
  z-index: 1;
  border: none !important;
}

.calendar-widget :deep(.vc-root),
.calendar-widget :deep(.vc-scroll),
.calendar-widget :deep(.vc-pane),
.calendar-widget :deep(.vc-pane *),
.calendar-widget :deep(.vc-days),
.calendar-widget :deep(.vc-days *) {
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  border-color: transparent !important;
}

.calendar-widget :deep(.vc-calendar),
.calendar-widget :deep(.vc-calendar *) {
  background-color: transparent !important;
  background-image: none !important;
}

/* Additional rules to ensure complete transparency */
.calendar-widget :deep(.vc-body),
.calendar-widget :deep(.vc-body *) {
  background-color: transparent !important;
  background-image: none !important;
}

.calendar-widget :deep(.vc-weeks),
.calendar-widget :deep(.vc-weeks *) {
  background-color: transparent !important;
  background-image: none !important;
}

/* Force all VCalendar elements to be transparent */
.calendar-widget :deep(*) {
  background-color: transparent !important;
  background-image: none !important;
}

.calendar-widget :deep(.vc-day-content),
.calendar-widget :deep(.vc-day-title),
.calendar-widget :deep(.vc-header-title) {
  color: rgb(15 23 42); /* slate-900 */
}

.calendar-widget :deep(.vc-weekday) {
  color: rgb(51 65 85); /* slate-700 */
  font-size: 0.65rem;
  padding: 0.125rem;
}

.dark .calendar-widget :deep(.vc-day-content),
.dark .calendar-widget :deep(.vc-day-title),
.dark .calendar-widget :deep(.vc-header-title) {
  color: rgb(241 245 249); /* slate-100 */
}

.dark .calendar-widget :deep(.vc-weekday) {
  color: rgb(203 213 225); /* slate-300 */
}
</style>
