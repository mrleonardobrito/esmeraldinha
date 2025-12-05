<script setup lang="ts">
import {
  getDiaryTypeLabel,
  getReductionDayLabel,
  getTeacherAvatarUrl,
  getTeacherDisplayName,
} from '@app/utils/teacher'
import type { Teacher } from '@types'
import { computed, toRefs } from 'vue'

interface Props {
  teacher: Teacher
  selected: boolean
}

const props = defineProps<Props>()
const { teacher } = toRefs(props)

const emit = defineEmits<{
  select: [teacher: Teacher]
}>()

const diaryLabel = computed(() => getDiaryTypeLabel(teacher.value.diary_type))
const reductionLabel = computed(() =>
  getReductionDayLabel(teacher.value.reduction_day),
)
const avatarUrl = computed(() => getTeacherAvatarUrl(teacher.value.name))
const teacherClasses = computed(() => teacher.value.classes)

const handleSelect = () => emit('select', props.teacher)
</script>

<template>
  <button
    type="button"
    :class="[
      'rounded-2xl w-full border p-4 sm:p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg bg-gray-900/35',
      selected
        ? 'border-primary/70 shadow-lg ring-2 ring-primary/30'
        : 'border-gray-800',
    ]"
    @click="handleSelect"
  >
    <div class="flex flex-col items-center">
      <img
        :src="avatarUrl"
        :alt="`Avatar de ${teacher.name || teacher.code}`"
        class="shrink-0 size-24 rounded-full bg-linear-to-br from-primary/10 to-primary/5 mb-4"
      >
      <div class="min-w-0">
        <p
          class="text-xs uppercase tracking-wide text-gray-500"
        >
          Professor
        </p>
        <p class="text-lg font-semibold text-gray-100 truncate">
          {{ getTeacherDisplayName(teacher) }}
        </p>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Código {{ teacher.code }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <span
            class="rounded-full border px-3 py-1 text-xs text-gray-100 border-gray-800"
          >
            Diário: {{ diaryLabel }}
          </span>
          <span
            class="rounded-full border px-3 py-1 text-xs text-gray-100 border-gray-800"
          >
            Redução: {{ reductionLabel }}
          </span>
        </div>
      </div>
    </div>
    <div
      v-if="teacherClasses.length"
      class="mt-4"
    >
      <p class="text-xs uppercase tracking-wide text-gray-400">
        Turmas
      </p>
      <div class="mt-2 flex flex-col items-center flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
        <span
          v-for="academicClass in teacherClasses"
          :key="academicClass.id"
          class="rounded-xl border max-w-fit px-3 py-1 text-xs font-medium text-gray-100/80 bg-gray-900/80 border-gray-700"
        >
          <span class="block truncate">
            {{ academicClass.school?.name || 'Escola não informada' }} · {{ academicClass.code }} · {{ academicClass.label }}
          </span>
        </span>
      </div>
    </div>
  </button>
</template>
