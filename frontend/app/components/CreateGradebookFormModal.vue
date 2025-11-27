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

const { data: teachersData } = useAsyncData<PaginatedResponse<Teacher>>(
  "overlay-teachers",
  async () => await listTeachers({ page: 1, page_size: 500 }),
  {
    server: false,
    default: () => ({ count: 0, next: null, previous: null, results: [] }),
  }
);

const { data: calendarsData } = useAsyncData<
  PaginatedResponse<AcademicCalendar>
>("overlay-calendars", async () => await listCalendars(), {
  server: false,
  default: () => ({ count: 0, next: null, previous: null, results: [] }),
});

const teacherOptions = computed(
  () =>
    teachersData.value?.results.map((teacher) => ({
      label: `${teacher.code} - ${teacher.school.name}`,
      value: teacher.id,
    })) ?? []
);

const calendarOptions = computed(
  () =>
    calendarsData.value?.results.map((calendar) => ({
      label: `${calendar.year}`,
      value: calendar.id,
    })) ?? []
);

const formSchema = gradebookFormSchema;

const formFields = computed(() => [
  {
    name: "title",
    label: "Título da Caderneta",
    type: "text" as const,
    placeholder: "Digite o título da caderneta",
    required: true,
  },
  {
    name: "teacher_id",
    label: "Professor",
    type: "select" as const,
    placeholder:
      teacherOptions.value.length === 0
        ? "Nenhum professor cadastrado"
        : "Selecione o professor",
    required: true,
    items: teacherOptions,
  },
  {
    name: "calendar_id",
    label: "Calendário",
    type: "select" as const,
    placeholder: "Selecione o calendário",
    required: true,
    items: calendarOptions,
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
