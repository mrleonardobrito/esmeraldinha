<script setup lang="ts">
import type { CalendarData } from '@types'

import LazyAcademicCalendarFormModal from '@components/AcademicCalendarFormModal.vue'
import AcademicCalendar from '@components/AcademicCalendar.vue'
import { ref } from 'vue'

const overlay = useOverlay()

const calendarData = ref<CalendarData | null>(null)

async function openAcademicCalendar() {
  const modal = overlay.create(LazyAcademicCalendarFormModal)
  const instance = modal.open()
  const result = await instance.result

  if (result) {
    calendarData.value = result
  }
}
</script>

<template>
  <div style="display: contents">
    <UDashboardPanel id="academic-calendar">
      <template #header>
        <AppNavBar
          title="Calendário Acadêmico"
          :right-button="{
            color: 'primary',
            variant: 'solid',
            icon: 'i-lucide-calendar',
            label: calendarData ? 'Novo Calendário' : 'Configurar Calendário',
            onClick: openAcademicCalendar,
          }"
        />
      </template>

      <template #body>
        <div class="relative h-full flex flex-col">
          <div
            v-if="!calendarData"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="w-32 h-32 mx-auto mb-4 opacity-50"
            />
            <p class="text-gray-500 mb-6">
              Nenhum calendário acadêmico encontrado.
            </p>
          </div>

          <div
            v-else
            class="flex-1"
          >
            <!-- Usar v-model para permitir que o componente filho atualize o calendarData (cores, tipos de dia, etc.) -->
            <AcademicCalendar v-model:calendar-data="calendarData" />
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
