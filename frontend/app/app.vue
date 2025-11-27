<script setup lang="ts">
import { computed } from "vue";
import { useHead } from "nuxt/app";
import { useColorMode } from "@vueuse/core";

const colorMode = useColorMode();

const color = computed(() =>
  colorMode.value === "dark" ? "#1b1718" : "white"
);

useHead({
  meta: [
    { charset: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { key: "theme-color", name: "theme-color", content: color },
  ],
  link: [{ rel: "icon", href: "/favicon.ico" }],
  htmlAttrs: {
    lang: "en",
  },
});
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <AppApiUnavailable />
    <AppErrorOverlay />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
