export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  debug: true,
  modules: ["@nuxt/ui", "@nuxt/image", "@nuxt/eslint", "@nuxt/hints"],

  typescript: {
    typeCheck: false,
  },

  css: ["~/assets/css/main.css"],
});
