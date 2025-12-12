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
const { listLegends, processCalendar, initializeCalendar, getLegendOptions } = useAcademicCalendars()

const formState = reactive({
  year: new Date().getFullYear(),
  calendarFile: null as File | null,
  selectedLegendType: 'letivo' as string,
})

const calendarData = ref<CalendarData | null>(null)
const isProcessing = ref(false)
const currentStep = ref<1 | 2>(1)

const {
  data: legendsData,
  pending: legendsPending,
  error: legendsError,
  refresh: refreshLegends,
} = await useAsyncData<LegendItem[]>(
  'academic-calendar-legends',
  () => listLegends(),
  {
    server: false,
    immediate: false,
  },
)

const legends = computed(() => legendsData.value ?? [])
const isLoadingLegends = computed(() => legendsPending.value)

watch(
  () => legendsError.value,
  (err) => {
    if (!err) return
    toast.add({
      title: 'Erro ao carregar legendas',
      description: err.message ?? 'Erro desconhecido',
      color: 'error',
      id: 'legends-load-error',
    })
  },
  { immediate: true },
)

const step1Schema = z.object({
  year: z.coerce.number().int('Ano deve ser inteiro').min(2000, 'Ano mínimo 2000').max(2100, 'Ano máximo 2100'),
  selectedLegendType: z.string().min(1, 'Selecione uma legenda padrão'),
})

const step2Schema = z.object({
  calendarFile: z
    .instanceof(File)
    .optional()
    .refine(
      file => (file ? file.size <= 5 * 1024 * 1024 : true),
      'O arquivo deve ter no máximo 5MB',
    )
    .refine(
      file => (file ? (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) : true),
      'O arquivo deve ser um PDF',
    ),
})

const legendOptions = computed(() => getLegendOptions(legends.value))

watch(
  () => formState.year,
  async (year) => {
    if (!year) return
    await refreshLegends()
    if (!legendOptions.value.find(option => option.value === formState.selectedLegendType)) {
      formState.selectedLegendType = legendOptions.value[0]?.value ?? ''
    }
  },
)

const canGoNextStep = computed(() => step1Schema.safeParse(formState).success)
const isStep2Valid = computed(() => step2Schema.safeParse(formState).success)

function goToStep(step: 1 | 2) {
  currentStep.value = step
}

function goNextStep() {
  const validation = step1Schema.safeParse(formState)
  if (!validation.success) {
    const errorMessages = validation.error.issues.map(issue => issue.message).join(', ')
    toast.add({
      title: 'Dados inválidos',
      description: errorMessages,
      color: 'error',
      id: 'validation-step1-error',
    })
    return
  }
  currentStep.value = 2
}

async function onSubmit() {
  const validationStep1 = step1Schema.safeParse(formState)
  if (!validationStep1.success) {
    const errorMessages = validationStep1.error.issues.map(issue => issue.message).join(', ')
    toast.add({
      title: 'Dados inválidos',
      description: errorMessages,
      color: 'error',
      id: 'validation-step1-error',
    })
    currentStep.value = 1
    return
  }

  const validationStep2 = step2Schema.safeParse(formState)
  if (!validationStep2.success) {
    const errorMessages = validationStep2.error.issues.map(issue => issue.message).join(', ')
    toast.add({
      title: 'Dados inválidos',
      description: errorMessages,
      color: 'error',
      id: 'validation-error',
    })
    currentStep.value = 2
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

    const targetYear = formState.year

    const initialized = await initializeCalendar(targetYear, formState.selectedLegendType)
    let finalCalendar = initialized.calendar_data

    if (formState.calendarFile) {
      const processed = await processCalendar(targetYear, formState.calendarFile, formState.selectedLegendType)
      finalCalendar = processed.calendar_data
    }

    calendarData.value = finalCalendar

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
    currentStep.value = 1
    formState.calendarFile = null
    formState.selectedLegendType = 'letivo'
    formState.year = new Date().getFullYear()
    calendarData.value = null
  }

  emit('close', data)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Configurar Calendário Letivo"
    description="Selecione o ano e a legenda. O upload do PDF é opcional."
    class="md:max-w-6xl"
    :close="{ onClick: () => onClose(null) }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="space-y-6">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center gap-2 text-sm"
            :class="currentStep === 1 ? 'text-primary' : 'text-neutral-300'"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full border border-primary/60"
              :class="currentStep === 1 ? 'bg-primary/10' : 'bg-neutral-800'"
            >
              1
            </span>
            <span>Escolher ano e legenda</span>
          </div>
          <div class="h-px flex-1 bg-neutral-700" />
          <div
            class="flex items-center gap-2 text-sm"
            :class="currentStep === 2 ? 'text-primary' : 'text-neutral-300'"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full border border-primary/60"
              :class="currentStep === 2 ? 'bg-primary/10' : 'bg-neutral-800'"
            >
              2
            </span>
            <span>Upload do PDF (opcional)</span>
          </div>
        </div>

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
          <div
            v-show="currentStep === 1"
            class="space-y-4"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UFormField
                name="year"
                label="Ano do calendário"
              >
                <UInput
                  v-model.number="formState.year"
                  type="number"
                  min="2000"
                  max="2100"
                  placeholder="Ex.: 2025"
                />
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
                <USelect
                  v-model="formState.selectedLegendType"
                  :options="legendOptions"
                  placeholder="Selecione a legenda padrão"
                  option-attribute="label"
                />
              </UFormField>
            </div>

            <div class="space-y-2 rounded-lg border border-neutral-700 bg-neutral-900/40 p-3">
              <div class="flex items-center justify-between">
                <p class="text-sm text-neutral-200">
                  Itens da legenda para o ano {{ formState.year }}
                </p>
                <small class="text-neutral-400">Recarrega ao mudar o ano</small>
              </div>
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

          <div
            v-show="currentStep === 2"
            class="space-y-4"
          >
            <UAlert
              color="neutral"
              variant="soft"
              icon="i-lucide-info"
            >
              O upload do PDF é opcional. Caso não envie, criaremos o calendário {{ formState.year }} com todos os dias como não letivos e aplicaremos as fixtures deste ano.
            </UAlert>

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
                    text="Selecione o arquivo PDF contendo o calendário letivo a ser processado (opcional)"
                  >
                    <UIcon
                      name="i-lucide-info"
                      class="w-4 h-4"
                    />
                  </UTooltip>
                </div>
              </template>
            </UFormField>
          </div>
        </UForm>

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

        <div class="flex items-center gap-2">
          <UButton
            v-if="currentStep === 2"
            type="button"
            color="neutral"
            variant="outline"
            :loading="isProcessing"
            @click="goToStep(1)"
          >
            Voltar
          </UButton>

          <UButton
            v-if="currentStep === 1"
            type="button"
            color="primary"
            variant="solid"
            :disabled="!canGoNextStep || isProcessing"
            @click="goNextStep"
          >
            Próximo
          </UButton>

          <UButton
            v-else
            type="submit"
            form="calendar-form"
            color="primary"
            variant="solid"
            :loading="isProcessing"
            :disabled="!isStep2Valid || isProcessing"
          >
            {{ formState.calendarFile ? 'Processar Calendário' : 'Criar calendário sem PDF' }}
          </UButton>
        </div>
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
