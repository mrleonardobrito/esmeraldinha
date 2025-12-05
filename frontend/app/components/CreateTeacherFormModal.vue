<script setup lang="ts">
import { useClasses } from '@composables/useClasses'
import { useTeachers } from '@composables/useTeachers'
import { useToast } from '@nuxt/ui/composables/useToast'
import {
  DiaryType,
  mapClassUpdate,
  ReductionDay,
  type Class,
  type PaginatedResponse,
  type TeacherCreate,
} from '@types'
import { computed, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import CreateClassFormModal from './CreateClassFormModal.vue'

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  },
)

const emit = defineEmits<{
  'close': [boolean]
  'after:leave': []
}>()

const toast = useToast()
const { create: createTeacher } = useTeachers()
const { list: listClasses, update: updateClass } = useClasses()

const teacherSchema = z.object({
  profile_img: z.string().optional(),
  name: z.string().min(1, 'Nome é obrigatório'),
  code: z
    .string()
    .min(1, 'Código é obrigatório')
    .max(6, 'Código deve ter no máximo 6 caracteres')
    .regex(/^[a-zA-Z0-9]+$/, 'Código deve conter apenas letras e números'),
  password: z.string().min(1, 'Senha é obrigatória'),
  reduction_day: z.number().min(1, 'Dia de redução é obrigatório'),
  diary_type: z.string().min(1, 'Tipo de diário é obrigatório'),
  class_ids: z
    .array(z.number())
    .refine(
      val => !!val && val.length > 0,
      'O professor deve estar vinculado a pelo menos uma turma.',
    )
    .default([]),
})

const imageState = reactive({
  url: '',
})

watch(
  () => imageState.url,
  (url) => {
    if (url) {
      teacherState.profile_img = url
    }
  },
)

const teacherState = reactive({
  name: '',
  code: '',
  password: '',
  profile_img: '',
  reduction_day: ReductionDay.MONDAY as number,
  diary_type: DiaryType.C1 as string,
  class_ids: [] as number[],
})

const createClassModalState = reactive({
  open: false,
  className: undefined as string | undefined,
})

const isTeacherSubmitting = ref(false)
const submitError = ref<string | null>(null)

const { data: classesData, pending: classesPending, refresh: refreshClasses } = await useAsyncData<
  PaginatedResponse<Class>
>(
  'classes',
  () => listClasses({ page: 1, page_size: 500 }),
  { server: false },
)

const classOptions = computed(() => {
  return classesData.value?.results.map(classItem => ({
    label: `${classItem.school.name} - ${classItem.label} (${classItem.code})`,
    value: classItem.id,
  }))
})
async function onCreateTeacherSubmit() {
  if (isTeacherSubmitting.value) return

  submitError.value = null

  const validation = teacherSchema.safeParse(teacherState)
  if (!validation.success) {
    toast.add({
      title: 'Erro ao criar professor',
      description: validation.error.message,
      color: 'error',
      id: 'teacher-create-error',
    })
    return
  }

  const payload: TeacherCreate = {
    code: teacherState.code,
    name: teacherState.name,
    password: teacherState.password,
    reduction_day: teacherState.reduction_day,
    diary_type: teacherState.diary_type,
    class_ids: teacherState.class_ids,
  }

  try {
    isTeacherSubmitting.value = true

    const result = await createTeacher(payload)

    if (!result) {
      submitError.value
        = 'Não foi possível criar o professor. Verifique os dados e tente novamente.'
      return
    }

    await Promise.all(
      teacherState.class_ids.map(classId =>
        updateClass(classId, mapClassUpdate('teacher_id', result.id)),
      ),
    )

    toast.add({
      title: 'Professor criado com sucesso!',
      color: 'success',
      id: 'teacher-created',
    })
    emit('close', true)
  }
  catch (error) {
    toast.add({
      title: 'Erro ao criar professor',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
      color: 'error',
      id: 'teacher-create-error',
    })
  }
  finally {
    isTeacherSubmitting.value = false
  }
}

function onTeacherNameChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value
  teacherState.name = value
  teacherState.profile_img = getTeacherAvatarUrl(value)
}

function onClassSearch(searchTerm: string) {
  createClassModalState.className = searchTerm
}

function onCreateClass(searchItem: string) {
  createClassModalState.className = searchItem
  createClassModalState.open = true
}

const isFormValid = computed(() => {
  const result = teacherSchema.safeParse(teacherState)
  return result.success
})

const onClassCreated = async () => {
  createClassModalState.open = false
  await refreshClasses()
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Adicionar Professor"
    description="Cadastre um novo professor vinculando-o a uma escola."
    class="md:max-w-2xl"
    :close="{ onClick: () => emit('close', false) }"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="submitError"
          icon="i-lucide-alert-triangle"
          color="error"
          variant="soft"
          :description="submitError"
        />

        <UForm
          id="teacher-form"
          :schema="teacherSchema"
          :state="teacherState"
          class="space-y-4"
          @submit="onCreateTeacherSubmit"
        >
          <UFormField
            name="profile_img"
            type="file"
            class="w-full flex justify-center"
          >
            <UAvatar
              :src="teacherState.profile_img"
              :alt="`Avatar de ${teacherState.name}`"
              class="size-24 rounded-full bg-linear-to-br from-primary/10 to-primary/5"
            />
            <template #label>
              <UTooltip
                text="Gerado automaticamente a partir do nome do professor."
                :delay-duration="500"
              >
                <UIcon
                  name="i-lucide-info"
                  class="w-4 h-4"
                />
              </UTooltip>
            </template>
          </UFormField>
          <UFormField
            name="name"
            label="Nome do Professor"
            type="text"
          >
            <UInput
              v-model="teacherState.name"
              placeholder="Digite o nome do professor"
              class="w-full"
              @change="onTeacherNameChange"
            />
          </UFormField>

          <UFormField
            name="code"
            label="Código do Professor"
            type="text"
          >
            <UInput
              v-model="teacherState.code"
              placeholder="Ex: ABC123"
              class="w-full"
            />
            <template #label>
              <div class="flex items-center gap-2">
                Código do Professor
                <UTooltip
                  :delay-duration="0"
                  class="w-4 h-4"
                  text="O código interno do professor utilizado nos sistemas da SEMED."
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
            name="password"
            label="Senha"
            type="password"
          >
            <template #label>
              <div class="flex items-center gap-2">
                Senha
                <UTooltip
                  :delay-duration="0"
                  class="w-4 h-4"
                  text="A senha do professor utilizada nos sistemas da SEMED."
                >
                  <UIcon
                    name="i-lucide-info"
                    class="w-4 h-4"
                  />
                </UTooltip>
              </div>
            </template>
            <UInput
              v-model="teacherState.password"
              type="password"
              placeholder="Digite a senha"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="class_ids"
            label="Turmas"
            type="multiselect"
            :items="classOptions"
          >
            <template #label>
              <div class="flex items-center gap-2">
                Turmas
                <UTooltip
                  :delay-duration="0"
                  class="w-4 h-4"
                  text="Turmas que o professor leciona. Você pode criar uma nova turma clicando no botão + ou digitando no campo de busca e clicando em 'Create xyz'."
                >
                  <UIcon
                    name="i-lucide-info"
                    class="w-4 h-4"
                  />
                </UTooltip>
              </div>
            </template>
            <USelectMenu
              v-model="teacherState.class_ids"
              :items="classOptions"
              :loading="classesPending"
              icon="i-lucide-users"
              placeholder="Selecione as turmas"
              class="w-full"
              value-key="value"
              multiple
              create-item
              @update:search-term="onClassSearch"
              @create="onCreateClass"
            >
              <template #empty>
                <div class="flex items-center gap-2">
                  <span>
                    Nenhuma turma encontrada. Você pode criar uma nova turma
                    clicando no botão + ou digitando no campo de busca e
                    clicando em "Create xyz".
                  </span>
                </div>
              </template>
            </USelectMenu>
          </UFormField>

          <UFormField
            v-model="teacherState.reduction_day"
            name="reduction_day"
            label="Dia de redução"
            type="select"
            :items="getReductionDayOptions()"
          >
            <USelectMenu
              v-model="teacherState.reduction_day"
              :items="getReductionDayOptions()"
              icon="i-lucide-calendar"
              placeholder="Selecione o dia de redução"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-model="teacherState.diary_type"
            label="Tipo de diário"
            type="select"
            :items="getDiaryTypeOptions()"
          >
            <USelectMenu
              v-model="teacherState.diary_type"
              :items="getDiaryTypeOptions()"
              icon="i-lucide-book"
              placeholder="Selecione o tipo de diário"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-between items-center gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="solid"
          :loading="isTeacherSubmitting"
          @click="emit('close', false)"
        >
          Cancelar
        </UButton>
        <UButton
          type="submit"
          form="teacher-form"
          color="primary"
          variant="solid"
          :loading="isTeacherSubmitting"
          :disabled="!isFormValid"
        >
          Criar professor
        </UButton>
      </div>
    </template>
  </UModal>

  <CreateClassFormModal
    v-model:open="createClassModalState.open"
    :class-name="createClassModalState.className"
    :on-close="onClassCreated"
  />
</template>
