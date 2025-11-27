<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { ref, onMounted } from "vue";
import { useCookie } from "nuxt/app";
import { useToast } from "@nuxt/ui/composables/useToast";

const toast = useToast();

const open = ref(false);

const links: NavigationMenuItem[] = [
  {
    label: "Home",
    icon: "i-lucide-house",
    to: "/",
    onSelect: () => {
      open.value = false;
    },
    defaultOpen: true,
  },
  {
    label: "Professores",
    icon: "i-lucide-users",
    to: "/teachers",
    onSelect: () => {
      open.value = false;
    },
  },
];

onMounted(async () => {
  const cookie = useCookie("cookie-consent");
  if (cookie.value === "accepted") {
    return;
  }

  toast.add({
    title:
      "We use first-party cookies to enhance your experience on our website.",
    duration: 0,
    close: false,
    actions: [
      {
        label: "Accept",
        color: "neutral",
        variant: "outline",
        onClick: () => {
          cookie.value = "accepted";
        },
      },
      {
        label: "Opt out",
        color: "neutral",
        variant: "ghost",
      },
    ],
  });
});
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
