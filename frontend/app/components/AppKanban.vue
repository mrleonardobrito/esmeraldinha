<script setup lang="ts">
import type { ChipProps } from '@nuxt/ui'
import { Container, Draggable } from 'vue3-smooth-dnd'

type DropResult = {
  removedIndex: number | null
  addedIndex: number | null
  payload: unknown
  addedToContainerId?: string
}

export interface KanbanColumn {
  id: string
  title: string
  color?: ChipProps['color']
  description?: string
}

export interface KanbanItem {
  id: number | string
  [key: string]: unknown
}

interface Props {
  columns: KanbanColumn[]
  itemsByColumn: Record<string, unknown[]>
  groupName?: string
}

const props = withDefaults(defineProps<Props>(), {
  groupName: 'kanban',
})

const emit = defineEmits<{
  drop: [
    payload: {
      removedIndex: number | null
      addedIndex: number | null
      payload: KanbanItem
      columnId: string
    },
  ]
}>()

const handleDrop = (dropResult: DropResult) => {
  if (dropResult.removedIndex !== null || dropResult.addedIndex !== null) {
    emit('drop', {
      removedIndex: dropResult.removedIndex,
      addedIndex: dropResult.addedIndex,
      payload: dropResult.payload as KanbanItem,
      columnId: dropResult.addedToContainerId || '',
    })
  }
}

const getColumnItems = (columnId: string): KanbanItem[] => {
  return (props.itemsByColumn[columnId] || []) as KanbanItem[]
}

const getChildPayload
  = (columnId: string) =>
    (index: number): KanbanItem => {
      return getColumnItems(columnId)[index] as KanbanItem
    }

const handleContainerDrop = (dropResult: DropResult) => {
  handleDrop(dropResult)
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div
      v-for="column in columns"
      :key="column.id"
      class="min-h-96"
    >
      <div class="mb-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <UChip
            :color="column.color"
            size="sm"
          >
            {{ getColumnItems(column.id).length }}
          </UChip>
          {{ column.title }}
        </h3>
        <p
          v-if="column.description"
          class="text-sm text-gray-600 dark:text-gray-400 mt-1"
        >
          {{ column.description }}
        </p>
      </div>

      <Container
        :group-name="groupName"
        :get-child-payload="getChildPayload(column.id)"
        non-drag-area-selector=".no-drag"
        drag-class="dragging"
        behaviour="move"
        class="space-y-3 min-h-96 p-4 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700"
        :class="{
          'border-orange-300 dark:border-orange-600':
            column.color === 'warning',
          'border-green-300 dark:border-green-600': column.color === 'success',
          'border-red-300 dark:border-red-600': column.color === 'error',
        }"
        @drop="handleContainerDrop"
      >
        <Draggable
          v-for="item in getColumnItems(column.id)"
          :key="item.id"
          class="select-none"
        >
          <slot
            :item="item"
            :column="column"
          />
        </Draggable>

        <template v-if="getColumnItems(column.id).length === 0">
          <slot
            name="empty"
            :column="column"
          >
            <div
              class="flex flex-col items-center justify-center py-8 text-gray-400"
            >
              <UIcon
                name="i-lucide-inbox"
                class="size-8 mb-2"
              />
              <p class="text-sm">
                Nenhum item
              </p>
            </div>
          </slot>
        </template>
      </Container>
    </div>
  </div>
</template>
