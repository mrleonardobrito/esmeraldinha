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
        v-bind="rightButton"
        @click="rightButton.onClick"
      >
        {{ rightButton.label }}
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
}

withDefaults(defineProps<Props>(), {
  title: 'Home',
  rightButton: () => ({
    color: 'primary',
    variant: 'solid',
    icon: 'i-lucide-plus',
    label: '',
    onClick: () => {},
  }),
})
</script>
