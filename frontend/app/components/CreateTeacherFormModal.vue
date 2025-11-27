<script setup lang="ts">
import { computed, ref } from "vue";
import { useAsyncData } from "nuxt/app";
import { useToast } from "@nuxt/ui/composables/useToast";

import type { PaginatedResponse, School, TeacherCreate } from "../types";
import { teacherFormSchema } from "../schemas/teacher";
import { ReductionDay, DiaryType } from "../types";
import { useTeachers } from "../composables/useTeachers";
import { useSchools } from "../composables/useSchools";

const emit = defineEmits<{ close: [boolean] }>();

const toast = useToast();
const { create: createTeacher } = useTeachers();
const { listRaw: listSchools } = useSchools();

const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

const { data: schoolsData } = useAsyncData<PaginatedResponse<School>>(
  "overlay-schools",
  async () => await listSchools(),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  }
);

const schoolOptions = computed(
  () =>
    schoolsData.value?.results.map((school) => ({
      label: school.name,
      value: school.id,
    })) ?? []
);

const reductionDayOptions = [
  { label: "Segunda-feira", value: ReductionDay.MONDAY },
  { label: "Terça-feira", value: ReductionDay.TUESDAY },
  { label: "Quarta-feira", value: ReductionDay.WEDNESDAY },
  { label: "Quinta-feira", value: ReductionDay.THURSDAY },
  { label: "Sexta-feira", value: ReductionDay.FRIDAY },
];

const diaryTypeOptions = [
  { label: "C1", value: DiaryType.C1 },
  { label: "C2", value: DiaryType.C2 },
];

const formSchema = teacherFormSchema;

const formFields = computed(() => [
  {
    name: "code",
    label: "Código do Professor",
    type: "text" as const,
    placeholder: "Ex: ABC123",
    required: true,
  },
  {
    name: "school_id",
    label: "Escola",
    type: "select" as const,
    placeholder:
      schoolOptions.value.length === 0
        ? "Nenhuma escola cadastrada"
        : "Selecione a escola",
    required: true,
    items: schoolOptions.value,
  },
  {
    name: "reduction_day",
    label: "Dia de redução",
    type: "select" as const,
    placeholder: "Selecione o dia de redução",
    required: true,
    items: reductionDayOptions,
  },
  {
    name: "diary_type",
    label: "Tipo de diário",
    type: "select" as const,
    placeholder: "Selecione o tipo de diário",
    required: true,
    items: diaryTypeOptions,
  },
]);

const initialValues = {
  reduction_day: ReductionDay.MONDAY,
  diary_type: DiaryType.C1,
};

const canSubmit = computed(() => schoolOptions.value.length > 0);

async function handleSubmit(event: Record<string, unknown>) {
  if (isSubmitting.value) return;

  submitError.value = null;
  isSubmitting.value = true;

  const payload: TeacherCreate = {
    code: event.code as string,
    school_id: Number(event.school_id),
    reduction_day: event.reduction_day as ReductionDay,
    diary_type: event.diary_type as DiaryType,
  };

  const result = await createTeacher(payload);

  if (result) {
    toast.add({
      title: "Professor criado com sucesso!",
      color: "success",
      id: "teacher-created",
    });

    emit("close", true);
  }

  isSubmitting.value = false;
}

function handleCancel() {
  emit("close", false);
}
</script>

<template>
  <UModal
    :title="'Adicionar Professor'"
    description="Cadastre um novo professor vinculando-o a uma escola."
    class="md:max-w-2xl"
    :close="{ onClick: () => emit('close', false) }"
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
          description="Você precisa cadastrar ao menos uma escola antes de criar professores."
        />

        <AppForm
          :schema="formSchema"
          :fields="formFields"
          :initial-values="initialValues"
          submit-label="Criar professor"
          :loading="isSubmitting"
          :submit-disabled="!canSubmit"
          @submit="handleSubmit"
          @cancel="handleCancel"
        />
      </div>
    </template>
  </UModal>
</template>
