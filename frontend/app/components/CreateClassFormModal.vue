<script setup lang="ts">
import { useClasses } from '@composables/useClasses'
import { useSchools } from '@composables/useSchools'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { ClassCreate, PaginatedResponse, School } from '@types'
import { computed, reactive, ref } from 'vue'
import { z } from 'zod'

interface Props {
  open: boolean
  onClose: () => void
  schoolId?: number
  className?: string
}

const toast = useToast()

const props = withDefaults(defineProps<Props>(), {
  schoolId: 0,
  className: '',
})

const state = reactive({
  label: props.className ?? '',
  code: '',
  school_id: props.schoolId,
})

watch(props, () => {
  state.label = props.className ?? ''
  state.school_id = props.schoolId ?? 0
}, { immediate: true })

const { list: listSchools } = useSchools()
const { create: createClass } = useClasses()
const classSchema = z.object({
  label: z.string().refine(val => !!val, 'Nome da turma é obrigatório'),
  code: z.string().refine(val => !!val, 'Código da turma é obrigatório'),
  school_id: z.number().refine(val => !!val, 'Escola é obrigatória'),
})

const submitError = ref<string | null>(null)

const {
  data: schoolsData,
  pending: schoolsPending,
} = await useAsyncData<PaginatedResponse<School>>(
  'schools',
  () => listSchools({ page: 1, page_size: 500 }),
  {
    server: false,
  },
)

const schoolOptions = computed(() => {
  return schoolsData.value?.results.map(school => ({
    label: school.name,
    value: school.id,
  })) ?? []
})

async function handleCreateClassSubmit() {
  submitError.value = null

  const payload: ClassCreate = {
    label: state.label,
    code: state.code,
    school_id: state.school_id,
  }

  const result = await createClass(payload)

  if (!result) {
    toast.add({
      title: 'Erro ao criar turma',
      description: 'Não foi possível criar a turma. Verifique os dados e tente novamente.',
      color: 'error',
      id: 'class-create-error',
    })
    return
  }

  toast.add({
    title: 'Turma criada com sucesso!',
    color: 'success',
    id: 'class-created',
  })

  props.onClose()
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Nova turma"
    description="Cadastre uma turma vinculada a uma escola."
    class="md:max-w-2xl"
    :close="{ onClick: props.onClose }"
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

        <UAlert
          v-else-if="schoolOptions.length === 0"
          icon="i-lucide-school"
          color="warning"
          variant="soft"
          description="Cadastre ao menos uma escola para vincular a turma."
        />

        <UForm
          id="class-form"
          :schema="classSchema"
          :state="state"
          class="space-y-4"
          @submit="handleCreateClassSubmit"
        >
          <UFormField
            name="label"
            label="Nome da turma"
            type="text"
          >
            <UInput
              v-model="state.label"
              :default-value="props.className ?? undefined"
              placeholder="Ex: 4º ano - Manhã"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-model="state.code"
            name="code"
            label="Código da turma"
            type="text"
          >
            <template #label>
              <div class="flex items-center gap-2">
                Código da turma
                <UTooltip
                  :delay-duration="0"
                  class="w-4 h-4"
                  text="O código interno da turma utilizado para entrar no sistema da SEMED."
                >
                  <UIcon
                    name="i-lucide-info"
                    class="w-4 h-4"
                  />
                </UTooltip>
              </div>
            </template>
            <UInput
              v-model="state.code"
              placeholder="Ex: ABC123"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="school_id"
            label="Escola"
            type="select"
            placeholder="Selecione a escola"
            :items="schoolOptions"
          >
            <USelectMenu
              v-model="state.school_id"
              :items="schoolOptions"
              :loading="schoolsPending"
              icon="i-lucide-school"
              placeholder="Selecione a escola"
              class="w-full"
              value-key="value"
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
          @click="props.onClose"
        >
          Cancelar
        </UButton>
        <UButton
          type="submit"
          form="class-form"
          color="primary"
          variant="solid"
          @click="handleCreateClassSubmit"
        >
          Criar turma
        </UButton>
      </div>
    </template>
  </UModal>
</template>
