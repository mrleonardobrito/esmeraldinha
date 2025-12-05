<script setup lang="ts">
import { computed, ref } from 'vue'

import LazyCreateTeacherFormModal from '@components/CreateTeacherFormModal.vue'
import { useTeachers } from '@composables/useTeachers'
import type {
  PaginatedResponse,
  Teacher,
} from '@types'

const {
  list: listTeachers,
} = useTeachers()

const overlay = useOverlay()

const {
  data: teachersData,
  refresh,
} = await useAsyncData<PaginatedResponse<Teacher>>('teachers', () => listTeachers())

const teachers = computed(() => teachersData.value?.results ?? [])

const selectedTeacher = ref<Teacher | null>(null)

async function openCreateTeacher() {
  const createTeacherModal = overlay.create(LazyCreateTeacherFormModal)
  const instance = createTeacherModal.open()
  const result = await instance.result

  if (result) {
    await refresh()
  }
}

function onTeacherSelected(teacher: Teacher) {
  selectedTeacher.value = teacher
}

async function onTeacherDeleted() {
  selectedTeacher.value = null
  await refresh()
}

async function onTeacherUpdated() {
  await refresh()
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
        <div class="relative flex gap-4 overflow-hidden">
          <div
            class="flex flex-1 flex-wrap overflow-auto content-start gap-4"
          >
            <div
              v-for="teacher in teachers"
              :key="teacher.id"
              class="flex-1 min-w-full sm:min-w-80 lg:max-w-1/2 xl:max-w-1/3"
              :class="[selectedTeacher ? 'lg:min-w-full 2xl:min-w-80 2xl:max-w-1/3' : '']"
            >
              <TeacherCard
                :teacher="teacher"
                :selected="selectedTeacher?.id === teacher.id"
                @select="onTeacherSelected"
              />
            </div>
          </div>
          <div
            v-if="selectedTeacher"
            class="hidden xl:block xl:w-[420px] 2xl:w-[480px] shrink-0"
          >
            <TeacherDetail
              :teacher="selectedTeacher"
              @teacher-deleted="onTeacherDeleted"
              @teacher-updated="onTeacherUpdated"
              @selection-cleared="selectedTeacher = null"
            />
          </div>

          <div
            v-if="selectedTeacher"
            class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 xl:hidden"
          >
            <div class="w-full max-w-md">
              <TeacherDetail
                :teacher="selectedTeacher"
                @teacher-deleted="onTeacherDeleted"
                @teacher-updated="onTeacherUpdated"
                @selection-cleared="selectedTeacher = null"
              />
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
