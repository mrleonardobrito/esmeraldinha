<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables/useToast'
import { computed, reactive, ref } from 'vue'

import {
  getDiaryTypeLabel,
  getDiaryTypeOptions,
  getReductionDayLabel,
  getReductionDayOptions,
  getTeacherAvatarUrl,
  getTeacherDisplayName,
  groupClassesBySchool,
} from '@app/utils/teacher'
import { useClasses } from '@composables/useClasses'
import { useTeachers } from '@composables/useTeachers'
import type {
  Class,
  PaginatedResponse,
  Teacher,
} from '@types'

type EditableField = 'name' | 'code' | 'school' | 'reduction_day' | 'diary_type' | 'classes'

interface Props {
  teacher: Teacher
}

interface Emits {
  (e: 'teacher-deleted' | 'teacher-updated' | 'selection-cleared'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { list: listClasses } = useClasses()
const { update: updateTeacher, destroy: deleteTeacher } = useTeachers()

const toast = useToast()

const activeEditableField = ref<EditableField | null>(null)
const isUpdatingTeacher = ref(false)

const editState = reactive({
  name: props.teacher.name,
  code: props.teacher.code,
  reduction_day: props.teacher.reduction_day,
  diary_type: props.teacher.diary_type,
  class_ids: props.teacher.classes.map(c => c.id),
})

const {
  data: classesData,
  pending: classesPending,
  execute: ensureClassOptions,
} = await useAsyncData<PaginatedResponse<Class>>(
  'classes',
  () => listClasses(),
  { server: false },
)

const groupedClassOptions = computed((): SelectMenuItem[] => {
  const grouped = groupClassesBySchool(classesData.value?.results ?? [])
  const options: SelectMenuItem[] = []

  grouped.forEach((group) => {
    options.push({
      type: 'label',
      label: group.school.name,
    })

    options.push(...group.classes.map(classItem => ({
      label: classItem.label,
      value: classItem.value,
      fullLabel: classItem.fullLabel,
    })))
  })

  return options
})

const groupedTeacherClasses = computed(() => {
  return groupClassesBySchool(props.teacher.classes)
})

const selectedSchoolsCount = computed(() => {
  if (!classesData.value?.results || editState.class_ids.length === 0) {
    return 0
  }

  const selectedClasses = classesData.value.results.filter(classItem =>
    editState.class_ids.includes(classItem.id),
  )

  const uniqueSchools = new Set(selectedClasses.map(classItem => classItem.school.id))
  return uniqueSchools.size
})

const teacherResumeSections = computed(() => [
  {
    key: 'name',
    label: 'Nome',
    value: editState.name,
    description: 'Nome do professor',
    editable: true,
    type: 'text',
  },
  {
    key: 'code',
    label: 'Código interno',
    value: editState.code,
    description: 'Identificador utilizado nos sistemas da SEMED.',
    editable: true,
    type: 'text',
  },
  {
    key: 'reduction_day',
    label: 'Dia de redução',
    value: getReductionDayLabel(editState.reduction_day),
    description: 'Dia da semana com horário reduzido para planejamento',
    editable: true,
    type: 'select',
    options: getReductionDayOptions(),
  },
  {
    key: 'diary_type',
    label: 'Tipo de diário',
    value: getDiaryTypeLabel(editState.diary_type),
    description: 'Tipo de diário do professor(C1 ou C2)',
    editable: true,
    type: 'select',
    options: getDiaryTypeOptions(),
  },
  {
    key: 'classes',
    label: 'Turmas',
    value: selectedSchoolsCount.value === 0
      ? 'Nenhuma escola selecionada'
      : `${selectedSchoolsCount.value} escola${selectedSchoolsCount.value > 1 ? 's' : ''} selecionada${selectedSchoolsCount.value > 1 ? 's' : ''}`,
    description: 'Turmas que o professor leciona',
    editable: true,
    type: 'select',
  },
])

const teacherDisplayName = computed(() =>
  props.teacher ? getTeacherDisplayName(props.teacher) : '',
)

function startEditingField(field: EditableField) {
  activeEditableField.value = field
}

async function saveInlineField() {
  if (!props.teacher || isUpdatingTeacher.value) return

  isUpdatingTeacher.value = true

  try {
    await updateTeacher(props.teacher.id, {
      name: editState.name,
      code: editState.code,
      reduction_day: editState.reduction_day,
      diary_type: editState.diary_type,
      class_ids: editState.class_ids,
    })

    toast.add({
      title: 'Professor atualizado',
      description: 'Os dados foram salvos com sucesso.',
      color: 'success',
    })

    emit('teacher-updated')
  }
  catch (error) {
    toast.add({
      title: 'Erro ao atualizar professor',
      color: 'error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
  finally {
    isUpdatingTeacher.value = false
    activeEditableField.value = null
  }
}

async function handleTeacherDelete() {
  if (!props.teacher || isUpdatingTeacher.value) return

  const confirmDelete = confirm(
    `Tem certeza que deseja remover o professor ${teacherDisplayName.value}?`,
  )

  if (!confirmDelete) return

  try {
    await deleteTeacher(props.teacher.id)
    toast.add({
      title: 'Professor removido',
      description: 'Os dados foram excluídos da lista.',
      color: 'success',
    })
    emit('teacher-deleted')
  }
  catch (error) {
    toast.add({
      title: 'Erro ao remover professor',
      color: 'error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
}

function clearTeacherSelection() {
  emit('selection-cleared')
}

async function handleCreateClass() {
  try {
    await ensureClassOptions()

    toast.add({
      title: 'Turma criada',
      description: 'A nova turma foi adicionada com sucesso.',
      color: 'success',
    })
  }
  catch (error) {
    toast.add({
      title: 'Erro ao criar turma',
      color: 'error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
}
</script>

<template>
  <div
    v-if="teacher"
    class="flex flex-col gap-6 rounded-2xl border p-6 shadow-sm backdrop-blur-sm border-gray-800 bg-gray-900/80 max-h-[calc(100vh-6rem)] overflow-y-auto"
  >
    <div class="flex items-center justify-end gap-2">
      <UButton
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        :disabled="isUpdatingTeacher"
        @click="handleTeacherDelete"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        @click="clearTeacherSelection"
      />
    </div>

    <div class="flex flex-col items-center gap-4 text-center">
      <div class="rounded-full border-4 border-primary/30 p-1">
        <img
          :src="getTeacherAvatarUrl(teacher.name)"
          :alt="`Avatar de ${teacherDisplayName}`"
          class="size-24 rounded-full bg-linear-to-br from-primary/10 to-primary/5"
        >
      </div>
      <div>
        <p
          class="text-xs uppercase tracking-wide text-gray-500"
        >
          Professor
        </p>
        <p class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ teacherDisplayName }}
        </p>
        <p class="text-sm text-gray-500">
          Código {{ teacher.code }}
        </p>
      </div>
    </div>

    <div class="space-y-3">
      <div
        v-for="section in teacherResumeSections"
        :key="section.label"
        class="group rounded-xl border border-gray-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80"
      >
        <p
          class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
        >
          {{ section.label }}
        </p>
        <div class="mt-1 flex align-center items-start gap-3">
          <div class="flex-1">
            <template
              v-if="
                section.editable && activeEditableField === section.key
              "
            >
              <div v-if="section.key === 'name'">
                <UInput
                  v-model:model-value="editState.name"
                  placeholder="Nome do professor"
                  :disabled="isUpdatingTeacher"
                />
              </div>
              <div v-else-if="section.key === 'code'">
                <UInput
                  v-model:model-value="editState.code"
                  placeholder="Ex: ABC123"
                  :disabled="isUpdatingTeacher"
                />
              </div>
              <div v-else-if="section.key === 'reduction_day'">
                <USelectMenu
                  v-model="editState.reduction_day"
                  :items="getReductionDayOptions()"
                  placeholder="Selecione o dia"
                  :disabled="isUpdatingTeacher"
                  value-key="value"
                  label-key="label"
                />
              </div>
              <div v-else-if="section.key === 'diary_type'">
                <USelectMenu
                  v-model="editState.diary_type"
                  :items="getDiaryTypeOptions()"
                  placeholder="Selecione o tipo"
                  :disabled="isUpdatingTeacher"
                  value-key="value"
                  label-key="label"
                />
              </div>
              <div v-else-if="section.key === 'classes'">
                <div class="space-y-2">
                  <USelectMenu
                    v-model="editState.class_ids"
                    class="max-w-full sm:max-w-sm"
                    :items="groupedClassOptions"
                    :loading="classesPending"
                    :disabled="isUpdatingTeacher"
                    icon="i-lucide-school"
                    placeholder="Selecione as turmas"
                    multiple
                    create-item
                    value-key="value"
                    label-key="label"
                    @open="ensureClassOptions()"
                    @create="handleCreateClass"
                  >
                    <template #item="{ item }">
                      <UTooltip
                        v-if="(item as any)?.type !== 'label'"
                        :text="(item as any)?.fullLabel"
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
                    <template #empty>
                      <div class="flex items-center gap-2">
                        <span>
                          Nenhuma turma encontrada. Você pode criar uma
                          nova turma clicando no botão + ou digitando no
                          campo de busca e clicando em "Create xyz".
                        </span>
                      </div>
                    </template>
                  </USelectMenu>
                </div>
              </div>
              <p class="mt-2 text-xs text-gray-500">
                {{ section.description }}
              </p>
              <div class="mt-3 flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="activeEditableField = null"
                >
                  Cancelar
                </UButton>
                <UButton
                  color="primary"
                  size="sm"
                  :loading="isUpdatingTeacher"
                  @click="saveInlineField()"
                >
                  Salvar
                </UButton>
              </div>
            </template>
            <template v-else>
              <div v-if="section.key === 'classes'">
                <div
                  v-if="teacher.classes.length"
                  class="max-h-40 overflow-y-auto pr-1 space-y-3"
                >
                  <div
                    v-for="group in groupedTeacherClasses"
                    :key="group.school.id"
                    class="space-y-1.5"
                  >
                    <div class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      {{ group.school.name }}
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-for="classItem in group.classes"
                        :key="classItem.value"
                        class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium text-gray-700 bg-gray-100 border-gray-300 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700 max-w-[200px]"
                      >
                        <span class="truncate">
                          {{ classItem.label }}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <p
                  v-else
                  class="text-base font-medium text-gray-500 dark:text-gray-400"
                >
                  Nenhuma turma atribuída
                </p>
              </div>
              <p
                v-else
                class="text-base font-medium text-gray-900 dark:text-white"
              >
                {{ section.value }}
              </p>
              <p class="text-sm text-gray-500">
                {{ section.description }}
              </p>
            </template>
          </div>
          <UButton
            v-if="
              section.editable && activeEditableField !== section.key
            "
            color="neutral"
            variant="ghost"
            icon="i-lucide-pencil-line"
            @click="startEditingField(section.key as EditableField)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
