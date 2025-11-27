<script setup lang="ts">
import { reactive, watch } from "vue";
import type { z } from "zod";
type AppFormFieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "textarea"
  | "select"
  | "checkbox";

type AppFormFieldValue = unknown;
type SelectItem = { label: string; value: unknown };

export interface AppFormField {
  name: string;
  label?: string;
  type?: AppFormFieldType;
  placeholder?: string;
  description?: string;
  required?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items?: SelectItem[] | { value: SelectItem[] } | any;
}

const props = defineProps<{
  schema: z.ZodTypeAny;
  fields: AppFormField[];
  initialValues?: Record<string, AppFormFieldValue>;
  submitLabel?: string;
  loading?: boolean;
  showCancel?: boolean;
  cancelLabel?: string;
  submitDisabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [Record<string, AppFormFieldValue>];
  cancel: [];
}>();

const defaultValues: Partial<Record<AppFormFieldType, AppFormFieldValue>> = {
  text: "",
  email: "",
  password: "",
  number: "",
  textarea: "",
  select: undefined,
  checkbox: false,
};

function buildInitialState(): Record<string, AppFormFieldValue> {
  const initialState: Record<string, AppFormFieldValue> = {};

  for (const field of props.fields) {
    initialState[field.name] =
      props.initialValues?.[field.name] ??
      defaultValues[field.type ?? "text"] ??
      "";
  }

  return initialState;
}

const state = reactive<Record<string, AppFormFieldValue>>(buildInitialState());

watch(
  () => [props.fields, props.initialValues] as const,
  () => {
    Object.assign(state, buildInitialState());
  },
  { deep: true }
);

const basicInputTypes: AppFormFieldType[] = [
  "text",
  "email",
  "password",
  "number",
];

const isBasicInputType = (type?: AppFormFieldType) =>
  !type || basicInputTypes.includes(type);

const handleSelectUpdate = (value: unknown, fieldName: string): void => {
  state[fieldName] =
    value && typeof value === "object" ? (value as SelectItem).value : value;
};

function onSubmit(_: SubmitEvent): void {
  emit("submit", state);
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
    <UFormField
      v-for="field in fields"
      :key="field.name"
      :name="field.name"
      :label="field.label"
      :help="field.description"
      :required="field.required"
    >
      <UInput
        v-if="isBasicInputType(field.type)"
        v-model="state[field.name]"
        :type="field.type ?? 'text'"
        :placeholder="field.placeholder"
      />

      <UTextarea
        v-else-if="field.type === 'textarea'"
        v-model="state[field.name]"
        :placeholder="field.placeholder"
        :rows="4"
      />

      <UCheckbox
        v-else-if="field.type === 'checkbox'"
        v-model="state[field.name]"
        :true-value="true"
        :false-value="false"
      />

      <USelectMenu
        v-else-if="field.type === 'select'"
        v-model="state[field.name]"
        :items="field.items || []"
        :placeholder="field.placeholder"
        value-attribute="value"
        option-attribute="label"
        @update:model-value="(value) => handleSelectUpdate(value, field.name)"
      />

      <UInput
        v-else
        v-model="state[field.name]"
        :placeholder="field.placeholder"
      />
    </UFormField>

    <div class="flex justify-end gap-2 pt-2">
      <UButton
        v-if="showCancel !== false"
        color="neutral"
        variant="ghost"
        :disabled="loading"
        @click="emit('cancel')"
      >
        {{ cancelLabel || "Cancelar" }}
      </UButton>

      <UButton
        type="submit"
        :loading="loading"
        :disabled="loading || submitDisabled"
      >
        {{ submitLabel || "Salvar" }}
      </UButton>
    </div>
  </UForm>
</template>
