<script setup lang="ts">
import { computed, ref } from "vue";
import { useAsyncData, navigateTo } from "nuxt/app";
import { useToast } from "@nuxt/ui/composables/useToast";

import type {
  PaginatedResponse,
  Teacher,
  AcademicCalendar,
  GradebookCreate,
} from "../types";
import { gradebookFormSchema } from "../schemas/gradebook";
import { useGradebooks } from "../composables/useGradebooks";
import { useTeachers } from "../composables/useTeachers";
import { useAcademicCalendars } from "../composables/useAcademicCalendars";

const emit = defineEmits<{ close: [boolean] }>();

const toast = useToast();
const { create: createGradebook } = useGradebooks();
const { listRaw: listTeachers } = useTeachers();
const { listRaw: listCalendars } = useAcademicCalendars();

const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

const {
  data: teachersData,
  pending: teachersPending,
  error: teachersError,
} = useAsyncData<PaginatedResponse<Teacher>>(
  "overlay-teachers",
  async () => await listTeachers({ page: 1, page_size: 500 }),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  }
);

const {
  data: calendarsData,
  pending: calendarsPending,
  error: calendarsError,
} = useAsyncData<PaginatedResponse<AcademicCalendar>>(
  "overlay-calendars",
  async () => await listCalendars(),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  }
);

const formSchema = gradebookFormSchema;

const formFields = computed(() => [
  {
    name: "teacher_id",
    label: "Professor",
    type: "select" as const,
    placeholder: "Selecione o professor",
    pending: teachersPending,
    error: teachersError,
    required: true,
    items:
      teachersData.value?.results.map((teacher) => ({
        label: `${teacher.code} - ${teacher.school.name}`,
        value: teacher.id,
      })) ?? [],
  },
  {
    name: "calendar_id",
    label: "Calendário",
    type: "select" as const,
    placeholder: "Selecione o calendário",
    pending: calendarsPending,
    error: calendarsError,
    required: true,
    items: calendarsData.value
      ? calendarsData.value.results.map((calendar) => ({
          label: `${calendar.year}`,
          value: calendar.id,
        }))
      : [],
  },
  {
    name: "progress",
    label: "Progresso (%)",
    type: "number" as const,
    placeholder: "0",
    required: false,
  },
]);

const initialValues = {
  progress: 0,
};

const canSubmit = computed(
  () => teacherOptions.value.length > 0 && calendarOptions.value.length > 0
);

async function handleSubmit(event: Record<string, unknown>) {
  if (isSubmitting.value) {
    return;
  }

  submitError.value = null;
  isSubmitting.value = true;

  const payload: GradebookCreate = {
    title: event.title as string,
    teacher_id: Number(event.teacher_id),
    calendar_id: Number(event.calendar_id),
    progress: Number(event.progress ?? 0),
  };

  const result = await createGradebook(payload);

  if (result) {
    toast.add({
      title: "Caderneta criada com sucesso!",
      color: "success",
      id: "gradebook-created",
    });

    emit("close", true);
  }

  isSubmitting.value = false;
}

function handleCancel() {
  emit("close", false);
}

function handleCreateTeacher() {
  emit("close", false);
  navigateTo("/teachers?openCreateTeacher=1");
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
      <div class="space-y-4">
        <UAlert
          v-if="submitError"
          icon="i-lucide-alert-triangle"
          color="error"
          variant="soft"
          :description="submitError"
        />

        <UAlert
          v-else-if="teacherOptions.length === 0"
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
          v-else-if="calendarOptions.length === 0"
          icon="i-lucide-calendar"
          color="warning"
          variant="soft"
          description="Não encontramos calendários acadêmicos. Cadastre um novo calendário para continuar."
        />

        <AppForm
          :schema="formSchema"
          :fields="formFields"
          :initial-values="initialValues"
          submit-label="Criar caderneta"
          :loading="isSubmitting"
          :submit-disabled="!canSubmit"
          @submit="handleSubmit"
          @cancel="handleCancel"
        />
      </div>
    </template>
  </UModal>
</template>
