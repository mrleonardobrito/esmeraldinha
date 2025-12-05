<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { useToast } from '@nuxt/ui/composables/useToast'
import { onMounted, ref } from 'vue'
import { useCookieConsent } from '../composables/useCookieConsent'

const toast = useToast()
const { acceptCookies, needsConsent } = useCookieConsent()

const open = ref(false)

const links: NavigationMenuItem[] = [
  {
    label: 'Home',
    icon: 'i-lucide-house',
    to: '/',
    onSelect: () => {
      open.value = false
    },
    defaultOpen: true,
  },
  {
    label: 'Professores',
    icon: 'i-lucide-users',
    to: '/teachers',
    onSelect: () => {
      open.value = false
    },
  },
]

onMounted(async () => {
  if (!needsConsent.value) {
    return
  }

  toast.add({
    title:
      'We use first-party cookies to enhance your experience on our website.',
    description:
      'By continuing to use this site, you agree to our use of cookies.',
    duration: 0,
    close: true,
    color: 'primary',
  })

  setTimeout(() => {
    acceptCookies()
  }, 100)
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      :open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>
    </UDashboardSidebar>
    <slot />
  </UDashboardGroup>
</template>
