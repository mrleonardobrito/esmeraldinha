<template>
  <UDashboardNavbar
    :title="title"
    :ui="{ right: 'gap-3' }"
  >
    <template #leading>
      <UDashboardSidebarCollapse />
    </template>

    <template #right>
      <UButton
        v-for="(button, index) in buttons"
        :key="index"
        v-bind="button"
        @click="button.onClick"
      >
        {{ button.label }}
      </UButton>
      <UTooltip
        text="Notifications"
        :shortcuts="['N']"
      >
        <UButton
          color="neutral"
          variant="ghost"
          square
        >
          <UChip
            color="error"
            inset
          >
            <UIcon
              name="i-lucide-bell"
              class="size-5 shrink-0"
            />
          </UChip>
        </UButton>
      </UTooltip>
    </template>
  </UDashboardNavbar>
</template>

<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

interface Props {
  title?: string
  rightButton?: ButtonProps
  rightButtons?: ButtonProps[]
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Home',
  rightButton: () => ({
    color: 'primary',
    variant: 'solid',
    icon: 'i-lucide-plus',
    label: '',
    onClick: () => {},
  }),
  rightButtons: () => [],
})

const buttons = computed(() => {
  return props.rightButtons.length > 0 ? props.rightButtons : [props.rightButton]
})
</script>
