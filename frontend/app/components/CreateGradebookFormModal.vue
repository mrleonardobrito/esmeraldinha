<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables/useToast'
import { computed, reactive, ref } from 'vue'
import { z } from 'zod'

import { getTeacherAvatarUrl, groupClassesBySchool } from '@app/utils/teacher'
import { useAcademicCalendars } from '@composables/useAcademicCalendars'
import { useGradebooks } from '@composables/useGradebooks'
import { useTeachers } from '@composables/useTeachers'
import type { SelectMenuItem } from '@nuxt/ui'
import type {
  AcademicCalendar,
  ClassResumed,
  GradebookCreate,
  PaginatedResponse,
  Teacher,
} from '@types'
import CreateClassFormModal from './CreateClassFormModal.vue'

interface Props {
  open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
})

const emit = defineEmits<{
  'close': [boolean]
  'after:leave': []
}>()

const toast = useToast()
const { create: createGradebook } = useGradebooks()
const { list: listTeachers } = useTeachers()
const { list: listCalendars } = useAcademicCalendars()

interface TeacherOption {
  id: number
  name: string
  code: string
  school: {
    id: number
    name: string
    code: number
  }
  classes: {
    id: number
    label: string
    code: string
    school: {
      id: number
      name: string
      code: number
    }
  }[]
  avatar: {
    src: string
    alt: string
  }
}

const schema = z.object({
  teacher: z.object({
    id: z.number().refine(val => !!val, 'Professor é obrigatório'),
  }),
  calendar: z.object({
    id: z.number().refine(val => !!val, 'Calendário é obrigatório'),
  }),
  class_id: z.number().refine(val => !!val, 'Turma é obrigatória'),
  progress: z.number().min(0).max(100).default(0),
})

const {
  data: teachersData,
  pending: teachersPending,
} = await useAsyncData<PaginatedResponse<Teacher>>('teachers', () => listTeachers())

const teacherOptions = computed(() => teachersData.value?.results.map(teacher => ({
  id: teacher.id,
  name: teacher.name,
  code: teacher.code,
  classes: teacher.classes?.map((classItem: ClassResumed) => ({
    id: classItem.id,
    label: classItem.label,
    code: classItem.code,
    school: classItem.school,
  })) ?? [],
  avatar: {
    src: getTeacherAvatarUrl(teacher.name, false),
    alt: `Avatar de ${teacher.name}`,
  },
})) ?? [])

const _getClassesGroupedBySchool = (classes: ClassResumed[]) => {
  const grouped: Record<string, {
    school: {
      id: string
      name: string
      code: number
    }
    classes: ClassResumed[]
  }> = {}

  classes.forEach((classItem) => {
    const schoolKey = classItem.school?.id?.toString() || 'unknown'
    const schoolName = classItem.school?.name || 'Escola não informada'
    const schoolCode = classItem.school?.code || 0

    if (!grouped[schoolKey]) {
      grouped[schoolKey] = {
        school: {
          id: schoolKey,
          name: schoolName,
          code: schoolCode,
        },
        classes: [],
      }
    }

    grouped[schoolKey].classes.push(classItem)
  })
  return Object.values(grouped).sort((a, b) => a.school.name.localeCompare(b.school.name))
}

const hasTeacherOptions = computed(() => {
  return teacherOptions.value.length > 0 && !teachersPending.value
})

const {
  data: calendarsData,
  pending: calendarsPending,
} = await useAsyncData<PaginatedResponse<AcademicCalendar>>(
  'calendars',
  () => listCalendars(),
  {
    server: false,
  },
)

const calendarsDataExists = computed(() => {
  return calendarsData.value && calendarsData.value.results.length > 0
})

const calendarOptions = computed(
  () =>
    calendarsData.value?.results.map((calendar: AcademicCalendar) => ({
      label: `${calendar.year}`,
      value: calendar.id,
    })) ?? [],
)

const isSubmitting = ref(false)
const submitError = ref<string | null>(null)

const teacherClassOptions = computed(() => {
  if (!state.teacher?.classes) return []

  const grouped = groupClassesBySchool(state.teacher.classes)
  const options: SelectMenuItem[] = []

  grouped.forEach((group) => {
    options.push({
      type: 'label',
      label: group.school.name || 'Escola não informada',
    })

    options.push(...group.classes.map(classItem => ({
      label: classItem.label,
      searchLabel: `${group.school.name} ${classItem.label}`,
      value: classItem.value,
    })))
  })

  return options
})

const createClassModalState = reactive({
  open: false,
  className: undefined as string | undefined,
})

const state = reactive({
  title: '',
  teacher: undefined as TeacherOption | undefined,
  calendar_id: undefined as number | undefined,
  class_id: undefined as number | undefined,
  progress: 0,
})

function onCreateTeacher() {
  emit('close', false)
  navigateTo('/teachers?openCreateTeacher=1')
}

function onCreateCalendar() {
  emit('close', false)
  navigateTo('/calendars')
}

const isFormValid = computed(() => {
  return schema.safeParse(state).success
})

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
    class_id: Number(values.class_id),
    progress: Number(values.progress ?? 0),
  }

  const result = await createGradebook(payload)

  if (!result) {
    toast.add({
      title: 'Erro ao criar caderneta',
      description: 'Não foi possível criar a caderneta. Verifique os dados e tente novamente.',
      color: 'error',
      id: 'gradebook-create-error',
    })
    emit('close', false)
    return
  }

  toast.add({
    title: 'Caderneta criada com sucesso!',
    color: 'success',
    id: 'gradebook-created',
  })

  emit('close', true)

  isSubmitting.value = false
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="'Nova caderneta'"
    description="Escolha o professor, calendário e acompanhe o progresso da turma."
    class="md:max-w-2xl"
    :close="{ onClick: () => emit('close', false) }"
    @after:leave="() => emit('after:leave')"
  >
    <template #body>
      <UAlert
        v-if="submitError"
        icon="i-lucide-alert-triangle"
        color="error"
        variant="soft"
        :description="submitError"
      />

      <div class="space-y-4 mb-4">
        <UAlert
          v-if="!hasTeacherOptions"
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
              @click="onCreateTeacher"
            >
              Cadastrar professor
            </UButton>
          </template>
        </UAlert>
        <UAlert
          v-if="!calendarsDataExists"
          icon="i-lucide-calendar"
          color="warning"
          variant="soft"
          description="Não encontramos calendários acadêmicos. Cadastre um novo calendário para continuar."
        >
          <template #actions>
            <UButton
              color="primary"
              variant="soft"
              icon="i-lucide-arrow-up-right"
              @click="onCreateCalendar"
            >
              Cadastrar calendário
            </UButton>
          </template>
        </UAlert>
      </div>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="handleSubmit"
      >
        <UFormField
          name="teacher"
          label="Professor"
          type="select"
          placeholder="Selecione o professor"
          :items="teacherOptions"
        >
          <USelectMenu
            v-model="state.teacher"
            :items="teacherOptions"
            placeholder="Selecione o professor"
            class="w-full"
            label-key="name"
          >
            <template #leading="{ modelValue }">
              <UAvatar
                v-if="modelValue"
                :src="modelValue.avatar.src"
                :alt="`Avatar de ${modelValue.name}`"
                size="xs"
              />
              <UIcon
                v-else
                name="i-lucide-user"
                size="md"
                class="mr-3 shrink-0"
              />
            </template>
            <template #item="{ item }">
              <div class="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors min-h-fit w-full">
                <UAvatar
                  :src="item.avatar.src"
                  :alt="`Avatar de ${item.name}`"
                  size="md"
                  class="shrink-0 mt-0.5"
                />
                <div class="flex flex-col min-w-0 flex-1 gap-1">
                  <div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span class="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                      {{ item.name }}
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ item.code }}</span>
                  </div>
                  <div
                    v-if="item.classes.length > 0"
                    class="space-y-2"
                  >
                    <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Turmas por Escola
                    </div>
                    <div class="space-y-2">
                      <div
                        v-for="schoolGroup in groupClassesBySchool(item.classes)"
                        :key="schoolGroup.school.id"
                        class="space-y-1"
                      >
                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {{ schoolGroup.school.name }}
                        </div>
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="classItem in schoolGroup.classes"
                            :key="classItem.value"
                            class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700"
                          >
                            {{ classItem.label }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </USelectMenu>
        </UFormField>
        <UFormField
          name="class_id"
          label="Turma"
          type="select"
          :items="teacherClassOptions"
        >
          <template #label>
            <div class="flex items-center gap-2">
              Turma
              <UTooltip
                :delay-duration="0"
                class="w-4 h-4"
                text="Selecione a turma que você deseja criar a caderneta."
              >
                <UIcon
                  name="i-lucide-info"
                  class="w-4 h-4"
                />
              </UTooltip>
            </div>
          </template>
          <div class="w-full flex items-center gap-2">
            <UTooltip
              :text="
                !state.teacher
                  ? '🚫 Você precisa selecionar um professor primeiro.'
                  : ''
              "
              :delay-duration="0"
            >
              <USelectMenu
                v-model="state.class_id"
                :items="teacherClassOptions"
                :disabled="!state.teacher"
                icon="i-lucide-users"
                placeholder="Selecione a turma"
                value-key="value"
                label-key="label"
                search-attribute="searchLabel"
                class="w-full"
              >
                <template #item="{ item }">
                  <UTooltip
                    v-if="(item as any)?.type !== 'label'"
                    :text="(item as any)?.label"
                    :delay-duration="150"
                  >
                    <span class="truncate block max-w-xs">
                      {{ (item as any)?.label }}
                    </span>
                  </UTooltip>
                  <div
                    v-else
                    class="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50"
                  >
                    {{ (item as any)?.label }}
                  </div>
                </template>
              </USelectMenu>
            </UTooltip>
          </div>
        </UFormField>
        <UFormField
          v-model="state.calendar_id"
          name="calendar_id"
          label="Calendário"
          type="select"
          :items="calendarOptions"
        >
          <UTooltip
            v-if="!calendarsDataExists"
            icon="i-lucide-alert-triangle"
            color="warning"
            variant="soft"
            text="Não encontramos calendários acadêmicos. Cadastre um novo calendário para continuar."
          >
            <USelectMenu
              v-model="state.calendar_id"
              :items="calendarOptions"
              :loading="calendarsPending"
              icon="i-lucide-calendar"
              placeholder="Selecione o calendário"
              class="w-full"
              value-key="value"
              :disabled="!calendarsDataExists"
            />
          </UTooltip>
        </UFormField>
        <UFormField
          name="progress"
          :label="`Progresso (${state.progress}%)`"
          type="number"
          class="w-full"
          placeholder="0"
        >
          <div class="flex items-center gap-2">
            <USlider
              v-model="state.progress"
              :min="0"
              :max="100"
              :step="5"
              class="w-full"
            />
            <UInput
              v-model="state.progress"
              type="number"
              placeholder="0"
              class="w-16"
            />
          </div>
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-between items-center gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="solid"
          @click="emit('close', false)"
        >
          Cancelar
        </UButton>
        <UButton
          type="submit"
          color="primary"
          variant="solid"
          :loading="isSubmitting"
          :disabled="!isFormValid"
        >
          Criar caderneta
        </UButton>
      </div>
    </template>
  </UModal>

  <CreateClassFormModal
    v-model:open="createClassModalState.open"
    :class-name="createClassModalState.className"
    :on-close="() => createClassModalState.open = false"
  />
</template>
