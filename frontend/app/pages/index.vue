<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAsyncData } from '#imports'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useOverlay } from '#imports'

import type {
  Gradebook,
  PaginatedResponse,
  PaginationParams,
} from '../types/index'
import { GradebookStatus } from '../types/index'
import { useGradebooks } from '../composables/useGradebooks'
import { LazyCreateGradebookFormModal } from '#components'

const toGradebook = (item: unknown) => item as Gradebook

const {
  list: listGradebooks,
  update: updateGradebook,
  destroy: destroyGradebook,
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
} = useAsyncData<PaginatedResponse<Gradebook>, PaginatedResponse<Gradebook>, PaginatedResponse<Gradebook>>('gradebooks', async () => {
  return await listGradebooks(gradebookParams.value)
})

const gradebooks = computed<Gradebook[]>(
  () => gradebooksData.value?.results ?? ([] as Gradebook[]),
)

const itemsByColumn = computed(() => {
  const grouped: Record<GradebookStatus, Gradebook[]> = {
    [GradebookStatus.PENDING]: [],
    [GradebookStatus.COMPLETED]: [],
    [GradebookStatus.CANCELLED]: [],
  }

  gradebooks.value.forEach((gradebook) => {
    grouped[gradebook.status].push(gradebook)
  })

  return grouped
})

const _handleEdit = async (_gradebook: Gradebook) => {
  toast.add({
    title: 'Funcionalidade de edição em desenvolvimento',
    color: 'warning',
    id: 'edit-not-implemented',
  })
}

const _handleArchive = async (_gradebook: Gradebook) => {
  if (
    !confirm(
      `Tem certeza que deseja arquivar a caderneta "${
        _gradebook.title || _gradebook.id
      }"?`,
    )
  )
    return

  try {
    await updateGradebook(_gradebook.id, {
      status: GradebookStatus.CANCELLED,
    })
    await refresh()
    toast.add({
      title: 'Caderneta arquivada com sucesso!',
      color: 'success',
      id: 'gradebook-archived',
    })
  }
  catch (error) {
    toast.add({
      title: 'Erro ao arquivar caderneta',
      color: 'error',
      id: 'archive-error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
}

const _handleDelete = async (_gradebook: Gradebook) => {
  if (
    !confirm(
      `Tem certeza que deseja excluir a caderneta "${
        _gradebook.title || _gradebook.id
      }"?`,
    )
  )
    return

  try {
    await destroyGradebook(_gradebook.id)
    await refresh()
    toast.add({
      title: 'Caderneta excluída com sucesso!',
      color: 'success',
      id: 'gradebook-deleted',
    })
  }
  catch (error) {
    toast.add({
      title: 'Erro ao excluir caderneta',
      color: 'error',
      id: 'delete-error',
      description: error instanceof Error ? error.message : 'Erro desconhecido',
    })
  }
}

const handleDrop = async (payload: {
  removedIndex: number | null
  addedIndex: number | null
  payload: unknown
  columnId: string
}) => {
  if (!payload.addedIndex) return

  const gradebook = payload.payload as Gradebook

  try {
    const newStatus = payload.columnId as GradebookStatus
    await updateGradebook(gradebook.id, { status: newStatus })
    await refresh()
    toast.add({
      title: 'Caderneta movida com sucesso!',
      color: 'success',
      id: 'gradebook-moved',
    })
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

const statusColumns = [
  {
    id: GradebookStatus.PENDING,
    title: 'Pendente',
    color: 'warning' as const,
    description: 'Gradebooks aguardando processamento',
  },
  {
    id: GradebookStatus.COMPLETED,
    title: 'Concluída',
    color: 'success' as const,
    description: 'Gradebooks finalizadas',
  },
  {
    id: GradebookStatus.CANCELLED,
    title: 'Cancelada',
    color: 'error' as const,
    description: 'Gradebooks canceladas',
  },
]

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
          :columns="statusColumns"
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
