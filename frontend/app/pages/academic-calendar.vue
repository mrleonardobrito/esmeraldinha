<script setup lang="ts">
import type { CalendarData } from '@types'

import LazyAcademicCalendarFormModal from '@components/AcademicCalendarFormModal.vue'
import AcademicCalendar from '@components/AcademicCalendar.vue'
import { onMounted, ref, watch } from 'vue'
import { useAcademicCalendars } from '@composables/useAcademicCalendars'
import { useToast } from '@nuxt/ui/composables/useToast'

const overlay = useOverlay()
const toast = useToast()
const { getByYear, saveCalendar, listLegends } = useAcademicCalendars()

const currentYear = new Date().getFullYear()
const calendarData = ref<CalendarData | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)
const isDirty = ref(false)
const isSaving = ref(false)
const legendOptions = ref<CalendarData['legend']>([])
const isLoadingLegend = ref(false)
const legendLoadError = ref<string | null>(null)

const loadCalendar = async () => {
  isLoading.value = true
  loadError.value = null
  try {
    const response = await getByYear(currentYear)
    calendarData.value = response.calendar_data
    isDirty.value = false

    // Se vier sem legendas, tentar carregar legendas compatíveis do backend
    if (!calendarData.value?.legend?.length) {
      await loadLegendOptions()
    }
  }
  catch (error) {
    console.error(error)
    loadError.value = 'Não foi possível carregar o calendário.'
    calendarData.value = null
  }
  finally {
    isLoading.value = false
  }
}

const loadLegendOptions = async () => {
  isLoadingLegend.value = true
  legendLoadError.value = null
  try {
    legendOptions.value = await listLegends(currentYear)
  }
  catch (error) {
    console.error(error)
    legendLoadError.value = 'Não foi possível carregar as legendas compatíveis.'
  }
  finally {
    isLoadingLegend.value = false
  }
}

async function openAcademicCalendar() {
  const modal = overlay.create(LazyAcademicCalendarFormModal)
  const instance = modal.open()
  const result = await instance.result

  if (result) {
    isLoading.value = true
    calendarData.value = result
    isDirty.value = false
    isLoading.value = false
  }
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

const persistCalendar = async () => {
  if (!calendarData.value) return
  isSaving.value = true
  try {
    await saveCalendar(currentYear, calendarData.value)
    isDirty.value = false
    toast.add({
      title: 'Calendário salvo',
      description: 'Alterações aplicadas com sucesso.',
      color: 'success',
    })
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
  if (!isLoading.value) {
    isDirty.value = true
  }
}, { deep: true })

onMounted(() => {
  loadCalendar()
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
            label: calendarData ? 'Novo Calendário' : 'Configurar Calendário',
            onClick: openAcademicCalendar,
          }"
        />
      </template>

      <template #body>
        <div class="relative h-full flex flex-col">
          <div
            v-if="isLoading"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-10 h-10 animate-spin text-primary mb-3"
            />
            <p class="text-gray-500">
              Carregando calendário {{ currentYear }}...
            </p>
          </div>

          <div
            v-else-if="loadError"
            class="flex flex-1 flex-col items-center justify-center"
          >
            <UIcon
              name="i-lucide-calendar-days"
              class="w-32 h-32 mx-auto mb-4 opacity-50"
            />
            <p class="text-gray-500 mb-4 text-center">
              {{ loadError }}
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
              @click="openAcademicCalendar"
            >
              Configurar Calendário
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
                {{ isDirty ? 'Alterações não salvas' : 'Calendário atualizado' }}
              </div>
              <UButton
                color="primary"
                variant="solid"
                size="sm"
                :loading="isSaving"
                :disabled="!isDirty || isSaving"
                icon="i-heroicons-arrow-up-tray"
                @click="persistCalendar"
              >
                Salvar alterações
              </UButton>
            </div>
            <!-- Usar v-model para permitir que o componente filho atualize o calendarData (cores, tipos de dia, etc.) -->
            <AcademicCalendar v-model:calendar-data="calendarData" />
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
