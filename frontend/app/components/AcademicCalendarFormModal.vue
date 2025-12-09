<script setup lang="ts">
import { useAcademicCalendars } from '@composables/useAcademicCalendars'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { CalendarData, LegendItem } from '@types'
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  },
)

const emit = defineEmits<{
  'close': [CalendarData | null]
  'after:leave': []
}>()

const toast = useToast()
const { listLegends, processCalendar, getLegendOptions } = useAcademicCalendars()

const formState = reactive({
  calendarFile: null as File | null,
  selectedLegendType: 'letivo' as string,
})

const calendarData = ref<CalendarData | null>(null)
const isProcessing = ref(false)
const isLoadingLegends = ref(false)
const legends = ref<LegendItem[]>([])

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen && legends.value.length === 0) {
      await loadLegends()
    }
  },
  { immediate: true },
)

const calendarSchema = z.object({
  calendarFile: z
    .instanceof(File)
    .refine(
      file => file.size <= 5 * 1024 * 1024,
      'O arquivo deve ter no máximo 5MB',
    )
    .refine(
      file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
      'O arquivo deve ser um PDF',
    ),
  selectedLegendType: z.string().min(1, 'Selecione uma legenda padrão'),
})

const legendOptions = computed(() => getLegendOptions(legends.value))

async function loadLegends() {
  isLoadingLegends.value = true
  try {
    legends.value = await listLegends()
  }
  catch (error) {
    toast.add({
      title: 'Erro ao carregar legendas',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
      color: 'error',
      id: 'legends-load-error',
    })
  }
  finally {
    isLoadingLegends.value = false
  }
}

async function onSubmit() {
  if (!formState.calendarFile) {
    toast.add({
      title: 'Arquivo obrigatório',
      description: 'Selecione um arquivo PDF do calendário para continuar',
      color: 'error',
      id: 'file-required-error',
    })
    return
  }

  if (!formState.selectedLegendType) {
    toast.add({
      title: 'Legenda obrigatória',
      description: 'Selecione uma legenda padrão para os dias não especificados',
      color: 'error',
      id: 'legend-required-error',
    })
    return
  }

  const validation = calendarSchema.safeParse(formState)
  if (!validation.success) {
    const errorMessages = validation.error.issues.map(issue => issue.message).join(', ')
    toast.add({
      title: 'Dados inválidos',
      description: errorMessages,
      color: 'error',
      id: 'validation-error',
    })
    return
  }

  isProcessing.value = true
  try {
    toast.add({
      title: 'Processando calendário...',
      description: 'Aguarde enquanto analisamos o arquivo e geramos o calendário',
      color: 'primary',
      id: 'processing-start',
    })

    const targetYear = new Date().getFullYear()
    calendarData.value = await processCalendar(
      targetYear,
      formState.calendarFile,
      formState.selectedLegendType,
    )

    toast.add({
      title: 'Calendário processado com sucesso!',
      description: 'Você pode agora visualizar e editar os dias do calendário',
      color: 'success',
      id: 'processing-success',
    })

    emit('close', calendarData.value)
  }
  catch (error) {
    console.error('Erro ao processar calendário:', error)
    toast.add({
      title: 'Erro ao processar calendário',
      description: error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.',
      color: 'error',
      id: 'calendar-process-error',
    })
  }
  finally {
    isProcessing.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      toast.add({
        title: 'Arquivo muito grande',
        description: 'O arquivo deve ter no máximo 5MB',
        color: 'error',
        id: 'file-size-error',
      })
      return
    }

    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.add({
        title: 'Tipo de arquivo inválido',
        description: 'Selecione apenas arquivos PDF',
        color: 'error',
        id: 'file-type-error',
      })
      return
    }

    formState.calendarFile = file
    toast.add({
      title: 'Arquivo selecionado',
      description: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      color: 'success',
      id: 'file-selected',
    })
  }
}

function onClose(data: CalendarData | null = null) {
  if (!data) {
    formState.calendarFile = null
    formState.selectedLegendType = 'letivo'
    calendarData.value = null
  }

  emit('close', data)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Configurar Calendário Letivo"
    description="Faça upload do PDF do calendário e configure as legendas"
    class="md:max-w-6xl"
    :close="{ onClick: () => onClose(null) }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="space-y-6">
        <div class="space-y-4">
          <UAlert
            v-if="isLoadingLegends"
            color="primary"
            variant="soft"
            icon="i-lucide-loader-2"
            class="animate-pulse"
          >
            Carregando legendas...
          </UAlert>

          <UForm
            id="calendar-form"
            :state="formState"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField
              name="calendarFile"
              label="Arquivo do Calendário (PDF)"
              type="file"
            >
              <UInput
                type="file"
                accept=".pdf,application/pdf"
                placeholder="Selecione o arquivo PDF do calendário"
                @change="onFileChange"
              />
              <template #label>
                <div class="flex items-center gap-2">
                  Arquivo do Calendário (PDF)
                  <UTooltip
                    :delay-duration="0"
                    text="Selecione o arquivo PDF contendo o calendário letivo a ser processado"
                  >
                    <UIcon
                      name="i-lucide-info"
                      class="w-4 h-4"
                    />
                  </UTooltip>
                </div>
              </template>
            </UFormField>

            <UFormField
              name="selectedLegendType"
              label="Legenda Padrão"
            >
              <template #label>
                <div class="flex items-center gap-2">
                  Legenda Padrão
                  <UTooltip
                    :delay-duration="0"
                    text="Tipo de dia usado por padrão para dias não especificados no calendário"
                  >
                    <UIcon
                      name="i-lucide-info"
                      class="w-4 h-4"
                    />
                  </UTooltip>
                </div>
              </template>
              <div class="space-y-3">
                <USelect
                  v-model="formState.selectedLegendType"
                  :options="legendOptions"
                  placeholder="Selecione a legenda padrão"
                  option-attribute="label"
                />

                <div class="space-y-2 rounded-lg border border-neutral-700 bg-neutral-900/40 p-3">
                  <p class="text-sm text-neutral-200">
                    Itens da legenda
                  </p>
                  <ul class="space-y-2">
                    <li
                      v-for="option in legendOptions"
                      :key="option.value"
                      class="flex items-center gap-3 text-sm text-neutral-100"
                    >
                      <span
                        class="w-3 h-3 rounded-full border"
                        :style="{ backgroundColor: option.color ?? '#FFFFFF' }"
                      />
                      <span>{{ option.label }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </UFormField>
          </UForm>
        </div>

        <div
          v-if="isProcessing"
          class="flex items-center justify-center py-8"
        >
          <div class="text-center">
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 animate-spin text-primary mx-auto mb-2"
            />
            <p class="text-sm text-gray-600">
              Processando calendário...
            </p>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-between items-center gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="soft"
          :loading="isProcessing"
          @click="onClose(null)"
        >
          Cancelar
        </UButton>

        <UButton
          type="submit"
          form="calendar-form"
          color="primary"
          variant="solid"
          :loading="isProcessing"
          :disabled="!formState.calendarFile"
        >
          Processar Calendário
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.calendar-preview {
  max-height: 600px;
  overflow-y: auto;
}

.calendar-preview :deep(.vc-day-content) {
  cursor: pointer;
}

.calendar-preview :deep(.vc-day-content:hover) {
  background-color: rgba(0, 0, 0, 0.05);
}
</style>
