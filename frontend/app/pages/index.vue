<script setup lang="ts">
import LazyCreateGradebookFormModal from '@components/CreateGradebookFormModal.vue'
import { useGradebooks } from '@composables/useGradebooks'
import { useToast } from '@nuxt/ui/composables/useToast'
import type {
  Gradebook,
  GradebookStatus,
  PaginatedResponse,
  PaginationParams,
} from '@types'
import { gradebookStatusColumns } from '@types'
import { computed, ref } from 'vue'

const toGradebook = (item: unknown) => item as Gradebook

const {
  list: listGradebooks,
  update: updateGradebook,
} = useGradebooks()

const toast = useToast()
const overlay = useOverlay()

const gradebookParams = ref<PaginationParams>({
  page: 1,
  page_size: 50,
})

const {
  data: gradebooksData,
  pending: _pending,
  error: _error,
  refresh,
} = useAsyncData<PaginatedResponse<Gradebook>>('gradebooks', async () => {
  return await listGradebooks(gradebookParams.value)
})

const gradebooks = computed<Gradebook[]>(
  () => gradebooksData.value?.results ?? ([] as Gradebook[]),
)

const itemsByColumn = computed<Record<GradebookStatus, Gradebook[]>>(() => {
  const grouped = gradebookStatusColumns.reduce(
    (acc, column) => {
      acc[column.id] = []
      return acc
    },
    {} as Record<GradebookStatus, Gradebook[]>,
  )

  gradebooks.value.forEach((gradebook) => {
    if (!grouped[gradebook.status]) {
      grouped[gradebook.status] = []
    }
    grouped[gradebook.status].push(gradebook)
  })

  return grouped
})

const handleDrop = async (payload: {
  removedIndex: number | null
  addedIndex: number | null
  payload: unknown
  columnId: string
}) => {
  if (payload.addedIndex === null) return

  const gradebook = payload.payload as Gradebook

  try {
    const newStatus = payload.columnId as GradebookStatus
    await updateGradebook(gradebook.id, { status: newStatus })
    await refresh()
  }
  catch (error) {
    toast.add({
      title: 'Erro ao mover caderneta',
      color: 'error',
      id: 'move-error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
    await refresh()
  }
}

async function open() {
  const modal = overlay.create(LazyCreateGradebookFormModal)

  const instance = modal.open()
  const result = await instance.result

  if (result) {
    await refresh()
  }
}
</script>

<template>
  <div style="display: contents">
    <UDashboardPanel id="home">
      <template #header>
        <AppNavBar
          title="Home"
          :right-button="{
            color: 'primary',
            variant: 'solid',
            icon: 'i-lucide-plus',
            label: 'Nova Gradebook',
            onClick: open,
          }"
        />
      </template>

      <template #body>
        <AppKanban
          :columns="gradebookStatusColumns"
          :items-by-column="itemsByColumn"
          group-name="gradebooks"
          @drop="handleDrop"
        >
          <template #default="{ item }">
            <GradebookCard :gradebook="toGradebook(item)" />
          </template>

          <template #empty="{ column }">
            <div
              class="flex flex-col items-center justify-center py-8 text-gray-400"
            >
              <UIcon
                name="i-lucide-sparkles"
                class="size-8 mb-2"
              />
              <p class="text-sm">
                Tudo limpo por aqui! Nenhuma gradebook na coluna "{{
                  column.title
                }}".
              </p>
            </div>
          </template>
        </AppKanban>
      </template>
    </UDashboardPanel>
  </div>
</template>
