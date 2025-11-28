<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '@nuxt/ui/composables/useToast'
import { z } from 'zod'

import type {
  PaginatedResponse,
  Teacher,
  AcademicCalendar,
  GradebookCreate,
} from '@types'
import { useGradebooks } from '@composables/useGradebooks'
import { useTeachers } from '@composables/useTeachers'
import { useAcademicCalendars } from '@composables/useAcademicCalendars'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { create: createGradebook } = useGradebooks()
const { listRaw: listTeachers } = useTeachers()
const { listRaw: listCalendars } = useAcademicCalendars()

const gradebookFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Título é obrigatório')
    .max(200, 'Título muito longo'),
  teacher_id: z.number().min(1, 'Professor é obrigatório'),
  calendar_id: z.number().min(1, 'Calendário é obrigatório'),
  progress: z.number().min(0).max(100).default(0),
})

const isSubmitting = ref(false)
const submitError = ref<string | null>(null)

const {
  data: teachersData,
  pending: teachersPending,
  execute: loadTeachers,
} = useLazyAsyncData<PaginatedResponse<Teacher>>(
  'overlay-teachers',
  async () => await listTeachers({ page: 1, page_size: 500 }),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  },
)

const {
  data: calendarsData,
  pending: calendarsPending,
  execute: loadCalendars,
} = useLazyAsyncData<PaginatedResponse<AcademicCalendar>>(
  'overlay-calendars',
  async () => await listCalendars(),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  },
)

const initialValues = {
  progress: 0,
}

async function handleSubmit(event: { data: Record<string, unknown> }) {
  if (isSubmitting.value) {
    return
  }

  submitError.value = null
  isSubmitting.value = true

  const values = event.data
  const payload: GradebookCreate = {
    title: values.title as string,
    teacher_id: Number(values.teacher_id),
    calendar_id: Number(values.calendar_id),
    progress: Number(values.progress ?? 0),
  }

  const result = await createGradebook(payload)

  if (result) {
    toast.add({
      title: 'Caderneta criada com sucesso!',
      color: 'success',
      id: 'gradebook-created',
    })

    emit('close', true)
  }

  isSubmitting.value = false
}

const teacherOptions = computed(() =>
  teachersData.value?.results.map((teacher: Teacher) => ({
    label: `${teacher.code} - ${teacher.school.name}`,
    value: teacher.id,
  })) ?? [],
)

const calendarOptions = computed(() =>
  calendarsData.value?.results.map((calendar: AcademicCalendar) => ({
    label: `${calendar.year}`,
    value: calendar.id,
  })) ?? [],
)

function handleCreateTeacher() {
  emit('close', false)
  navigateTo('/teachers?openCreateTeacher=1')
}
</script>

<template>
  <UModal
    :title="'Nova caderneta'"
    description="Escolha o professor, calendário e acompanhe o progresso da turma."
    class="md:max-w-2xl"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UAlert
        v-if="submitError"
        icon="i-lucide-alert-triangle"
        color="error"
        variant="soft"
        :description="submitError"
      />

      <UAlert
        v-if="teachersData && teachersData.results.length === 0"
        icon="i-lucide-user-plus"
        color="warning"
        variant="soft"
      >
        <template #description>
          Cadastre um professor para poder criar cadernetas. Você será
          redirecionado e poderá voltar depois.
        </template>
        <template #actions>
          <UButton
            color="primary"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            @click="handleCreateTeacher"
          >
            Cadastrar professor
          </UButton>
        </template>
      </UAlert>

      <UAlert
        v-if="calendarsData && calendarsData.results.length === 0"
        icon="i-lucide-calendar"
        color="warning"
        variant="soft"
        description="Não encontramos calendários acadêmicos. Cadastre um novo calendário para continuar."
      />

      <UForm
        :schema="gradebookFormSchema"
        :initial-values="initialValues"
        class="space-y-4"
        @submit="handleSubmit"
      >
        <UFormField
          name="teacher_id"
          label="Professor"
          type="select"
          placeholder="Selecione o professor"
          :items="teacherOptions"
        >
          <USelectMenu
            :items="teacherOptions"
            :loading="teachersPending"
            icon="i-lucide-user"
            placeholder="Selecione o professor"
            class="w-full"
            @open="loadTeachers()"
          >
            <template #leading="{ modelValue }">
              <UAvatar
                :src="`https://api.dicebear.com/7.x/avataaars/svg?seed=${modelValue}`"
                :alt="`Avatar de ${modelValue}`"
                size="xs"
                class="shrink-0"
              />
            </template>
          </USelectMenu>
        </UFormField>
        <UFormField
          name="calendar_id"
          label="Calendário"
          type="select"
          placeholder="Selecione o calendário"
        >
          <USelectMenu
            :items="calendarOptions"
            :loading="calendarsPending"
            icon="i-lucide-calendar"
            placeholder="Selecione o calendário"
            class="w-full"
            @open="loadCalendars()"
          />
        </UFormField>
        <UFormField
          name="progress"
          label="Progresso (%)"
          type="number"
          placeholder="0"
        >
          <USlider
            v-model="initialValues.progress"
            :min="0"
            :max="100"
            :step="1"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          color="primary"
          variant="solid"
          :loading="isSubmitting"
          :disabled="
            teachersData?.results.length === 0
              || calendarsData?.results.length === 0
          "
        >
          Criar caderneta
        </UButton>
      </UForm>
    </template>
  </UModal>
</template>
