<script setup lang="ts">
import type { AcademicCalendarSummary, CalendarData, PaginatedResponse } from '@types'

import LazyCreateAcademicCalendarFormModal from '@components/CreateAcademicCalendarFormModal.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAcademicCalendars } from '@composables/useAcademicCalendars'
import { useToast } from '@nuxt/ui/composables/useToast'

const overlay = useOverlay()
const toast = useToast()
const { getByYear, saveCalendar, listLegends, list: listCalendars } = useAcademicCalendars()

const currentYear = new Date().getFullYear()
const selectedCalendar = ref<number | undefined>(undefined)
const calendarData = ref<CalendarData | null>(null)
const isDirty = ref(false)
const isSaving = ref(false)
const legendOptions = ref<CalendarData['legend']>([])
const isLoadingLegend = ref(false)
const legendLoadError = ref<string | null>(null)
const AUTOSAVE_DELAY_MS = 1200
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

const {
  data: calendarsData,
  pending: calendarsPending,
} = await useAsyncData<PaginatedResponse<AcademicCalendarSummary>>(
  'calendars',
  () => listCalendars(),
  {
    server: false,
    immediate: true,
  },
)

const calendarOptions = computed(() => calendarsData.value?.results.map((calendar: AcademicCalendarSummary) => ({
  label: `${calendar.year}`,
  value: calendar.year,
})) ?? [])

const initialOption = computed(() => ({
  label: calendarsData.value?.results[0] ? `${calendarsData.value.results[0].year}` : `${currentYear}`,
  value: calendarsData.value?.results[0]?.year ?? undefined,
}))

const loadingCalendar = ref(false)
const calendarLoadError = ref<string | null>(null)
const loadCalendar = async () => {
  if (!selectedCalendar.value) return
  loadingCalendar.value = true
  try {
    const response = await getByYear(selectedCalendar.value)
    calendarData.value = response.calendar_data
  }
  catch (error) {
    console.error(error)
    calendarLoadError.value = 'Não foi possível carregar o calendário.'
    calendarData.value = null
  }
  finally {
    loadingCalendar.value = false
  }
}

const loadLegendOptions = async () => {
  isLoadingLegend.value = true
  legendLoadError.value = null
  try {
    legendOptions.value = await listLegends()
  }
  catch (error) {
    console.error(error)
    legendLoadError.value = 'Não foi possível carregar as legendas compatíveis.'
  }
  finally {
    isLoadingLegend.value = false
  }
}

async function openCreateAcademicCalendar() {
  const modal = overlay.create(LazyCreateAcademicCalendarFormModal)
  const instance = modal.open()
  await instance.result
}

const applyLegendSet = () => {
  if (!calendarData.value) return
  if (!legendOptions.value.length) return
  calendarData.value = {
    ...calendarData.value,
    legend: legendOptions.value,
  }
  isDirty.value = true
}

const persistCalendar = async (silent = false) => {
  if (!calendarData.value) return
  isSaving.value = true
  try {
    await saveCalendar(selectedCalendar.value ?? currentYear, calendarData.value)
    isDirty.value = false
    if (!silent) {
      toast.add({
        title: 'Calendário salvo',
        description: 'Alterações aplicadas com sucesso.',
        color: 'success',
      })
    }
  }
  catch (error) {
    console.error(error)
    toast.add({
      title: 'Erro ao salvar',
      description: 'Não foi possível salvar o calendário. Tente novamente.',
      color: 'error',
    })
  }
  finally {
    isSaving.value = false
  }
}

watch(calendarData, () => {
  if (loadingCalendar.value) return
  isDirty.value = true
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
  autosaveTimer = setTimeout(() => persistCalendar(true), AUTOSAVE_DELAY_MS)
}, { deep: true })

onMounted(() => {
  loadLegendOptions()
})

onBeforeUnmount(() => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
})

watch(calendarsData, (value) => {
  const firstCalendar = value?.results?.[0]
  if (!firstCalendar) return

  if (!selectedCalendar.value || selectedCalendar.value !== firstCalendar.year) {
    selectedCalendar.value = firstCalendar.year
  }
}, { immediate: true })

watch(selectedCalendar, () => {
  loadCalendar()
  loadLegendOptions()
})
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
            label: 'Novo Calendário',
            onClick: openCreateAcademicCalendar,
          }"
        >
          <template #right-prepend>
            <div class="flex items-center gap-2">
              <span class="text-xs uppercase text-gray-400">Ano</span>
              <USelectMenu
                v-if="!calendarsPending"
                v-model:value="selectedCalendar"
                :options="calendarOptions"
                placeholder="Escolha o calendário"
                size="sm"
                class="w-32"
                :clearable="false"
                :default-value="initialOption.value"
              />
              <div
                v-else
                class="flex items-center justify-center w-32 h-8"
              >
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-5 h-5 animate-spin text-primary"
                />
              </div>
            </div>
          </template>
        </AppNavBar>
      </template>

      <template #body>
        <div class="relative h-full flex flex-col">
          <div
            v-if="loadingCalendar"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-10 h-10 animate-spin text-primary mb-3"
            />
            <p class="text-gray-500">
              Carregando calendário {{ selectedCalendar ?? currentYear }}...
            </p>
          </div>

          <div
            v-else-if="calendarLoadError"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="w-32 h-32 mx-auto mb-4 opacity-50"
            />
            <p class="text-gray-500 mb-4 text-center">
              {{ calendarLoadError }}
            </p>
            <UButton
              color="primary"
              variant="solid"
              @click="loadCalendar"
            >
              Tentar novamente
            </UButton>
          </div>

          <div
            v-else-if="!calendarData"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="w-32 h-32 mx-auto mb-4 opacity-50"
            />
            <p class="text-gray-500 mb-6">
              Nenhum calendário acadêmico encontrado.
            </p>
            <UButton
              color="primary"
              variant="solid"
              @click="openCreateAcademicCalendar"
            >
              Criar Calendário
            </UButton>
          </div>

          <div
            v-else-if="calendarData && !calendarData.legend?.length"
            class="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
          >
            <div class="space-y-2">
              <UIcon
                name="i-lucide-book-open"
                class="w-12 h-12 mx-auto opacity-70"
              />
              <p class="text-gray-200 text-sm">
                Selecione uma legenda compatível antes de exibir o calendário.
              </p>
            </div>
            <div class="w-full max-w-md space-y-2">
              <div class="text-xs uppercase text-gray-400">
                Legendas disponíveis ({{ currentYear }})
              </div>
              <div
                class="rounded border border-gray-700 p-2 max-h-48 overflow-y-auto"
              >
                <template v-if="isLoadingLegend">
                  <div class="text-gray-400 text-sm">
                    Carregando legendas...
                  </div>
                </template>
                <template v-else-if="legendLoadError">
                  <div class="text-red-400 text-sm">
                    {{ legendLoadError }}
                  </div>
                </template>
                <template v-else-if="legendOptions.length === 0">
                  <div class="text-gray-400 text-sm">
                    Nenhuma legenda compatível encontrada.
                  </div>
                </template>
                <template v-else>
                  <ul class="space-y-1 text-left text-sm text-gray-100">
                    <li
                      v-for="legend in legendOptions"
                      :key="legend.type"
                      class="flex items-center gap-2"
                    >
                      <span
                        class="inline-flex h-3 w-3 rounded-full border border-gray-500"
                        :style="{ backgroundColor: legend.color_hex || '#9CA3AF' }"
                      />
                      <span class="font-medium">{{ legend.description }}</span>
                      <span class="text-xs text-gray-400">({{ legend.type }})</span>
                    </li>
                  </ul>
                </template>
              </div>
              <UButton
                color="primary"
                variant="solid"
                :disabled="!legendOptions.length"
                @click="applyLegendSet"
              >
                Aplicar legenda
              </UButton>
            </div>
          </div>

          <div
            v-else
            class="flex-1 flex flex-col gap-2"
          >
            <div class="flex items-center justify-between px-1">
              <div class="text-sm text-gray-600">
                <template v-if="isSaving">
                  Salvando automaticamente...
                </template>
                <template v-else-if="isDirty">
                  Alterações não salvas
                </template>
                <template v-else>
                  Calendário atualizado
                </template>
              </div>
              <div class="text-xs text-gray-400 flex items-center gap-1">
                <UIcon
                  name="i-lucide-rotate-ccw"
                  class="w-4 h-4"
                />
                Auto-save
              </div>
            </div>
            <AcademicCalendar v-model:calendar-data="calendarData" />
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
