<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAsyncData } from 'nuxt/app'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useOverlay } from '#imports'

import type { Teacher, PaginatedResponse, PaginationParams } from '../types'
import { useTeachers } from '../composables/useTeachers'
import { LazyCreateTeacherFormModal } from '#components'

const { listRaw: listTeachers } = useTeachers()
const toast = useToast()
const overlay = useOverlay()

const teacherParams = ref<PaginationParams>({
  page: 1,
  page_size: 50,
})

const {
  data: teachersData,
  pending,
  error,
  refresh,
} = useAsyncData<PaginatedResponse<Teacher>>('teachers', async () => {
  return await listTeachers(teacherParams.value)
})

const teachers = computed<Teacher[]>(
  () => teachersData.value?.results ?? ([] as Teacher[]),
)

async function openCreateTeacher() {
  const modal = overlay.create(LazyCreateTeacherFormModal)
  const instance = modal.open()
  const result = await instance.result

  if (result) {
    await refresh()
  }
}
</script>

<template>
  <div style="display: contents">
    <UDashboardPanel id="teachers">
      <template #header>
        <AppNavBar
          title="Professores"
          :right-button="{
            color: 'primary',
            variant: 'solid',
            icon: 'i-lucide-plus',
            label: 'Adicionar Professor',
            onClick: openCreateTeacher,
          }"
        />
      </template>

      <template #body>
        <div
          v-if="pending"
          class="flex justify-center py-8"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="size-8 animate-spin"
          />
        </div>

        <div
          v-else-if="error"
          class="flex flex-col items-center justify-center py-12"
        >
          <UIcon
            name="i-lucide-alert-circle"
            class="size-8 text-error mb-2"
          />
          <p class="text-sm text-gray-500 mb-4">
            {{ error }}
          </p>
          <UButton
            color="primary"
            variant="outline"
            @click="refresh()"
          >
            Tentar novamente
          </UButton>
        </div>

        <div
          v-else
          class="space-y-3"
        >
          <div
            v-for="teacher in teachers"
            :key="teacher.id"
            class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border"
          >
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">
                  {{ teacher.code }}
                </h4>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  {{ teacher.school.name }}
                </p>
              </div>
              <!-- ações futuras (editar, remover etc) -->
            </div>
          </div>

          <div
            v-if="teachers.length === 0"
            class="flex flex-col items-center justify-center py-8 text-gray-400"
          >
            <UIcon
              name="i-lucide-inbox"
              class="size-8 mb-2"
            />
            <p class="text-sm">
              Nenhum professor cadastrado ainda
            </p>
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
