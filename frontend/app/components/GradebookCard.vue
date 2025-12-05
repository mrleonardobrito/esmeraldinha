<script setup lang="ts">
import type { Gradebook } from '@types'
import { computed } from 'vue'

interface Props {
  gradebook: Gradebook
}

const props = defineProps<Props>()

const progress = computed(() => props.gradebook.progress)

const emit = defineEmits<{
  edit: [gradebook: Gradebook]
  archive: [gradebook: Gradebook]
  delete: [gradebook: Gradebook]
}>()

const teacherAvatarUrl = computed(() => {
  const seed = props.gradebook.teacher.id.toString()
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
})

const formattedDate = computed(() => {
  if (!props.gradebook.created_at) return ''
  try {
    const date = new Date(props.gradebook.created_at)
    const monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    const day = date.getDate()
    const month = monthNames[date.getMonth()]
    return `${month}, ${day}`
  }
  catch {
    return ''
  }
})

const displayTitle = computed(() => {
  return props.gradebook.title || `Caderneta ${props.gradebook.id}`
})

const handleEdit = () => {
  emit('edit', props.gradebook)
}

const handleArchive = () => {
  emit('archive', props.gradebook)
}

const handleDelete = () => {
  emit('delete', props.gradebook)
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border select-none cursor-move"
  >
    <div class="mb-3">
      <h4 class="font-medium text-gray-900 dark:text-white mb-2">
        {{ displayTitle }}
      </h4>
      <div class="w-full">
        <UProgress
          v-model="progress"
          :max="100"
          size="xs"
          class="w-full"
          :animated="false"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {{ progress }}% concluído
        </p>
      </div>
    </div>

    <div class="flex items-start gap-3 mb-3">
      <UAvatar
        :src="teacherAvatarUrl"
        :alt="`Avatar de ${gradebook.teacher.code}`"
        size="md"
        class="shrink-0"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 dark:text-white">
          {{ gradebook.teacher.code }}
        </p>
        <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
          {{ gradebook.teacher.school.name }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-500">
          Calendário: {{ gradebook.calendar.year }}
        </p>
      </div>
    </div>
    <div
      class="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700"
    >
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {{ formattedDate }}
      </span>

      <UPopover :popper="{ placement: 'bottom-end' }">
        <UButton
          color="neutral"
          variant="ghost"
          square
          size="sm"
          class="no-drag"
        >
          <UIcon
            name="i-lucide-more-vertical"
            class="size-4"
          />
        </UButton>
        <template #content>
          <div class="p-1 min-w-[120px]">
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start no-drag"
              @click="handleEdit"
            >
              <UIcon
                name="i-lucide-edit"
                class="size-4 mr-2"
              />
              Editar
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start no-drag"
              @click="handleArchive"
            >
              <UIcon
                name="i-lucide-archive"
                class="size-4 mr-2"
              />
              Arquivar
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="justify-start text-red-600 dark:text-red-400 no-drag"
              @click="handleDelete"
            >
              <UIcon
                name="i-lucide-trash"
                class="size-4 mr-2"
              />
              Excluir
            </UButton>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<style scoped>
.cursor-move {
  user-select: none;
  -webkit-user-select: none;
}

.dragging {
  opacity: 0.5;
  transform: rotate(5deg);
}
</style>
