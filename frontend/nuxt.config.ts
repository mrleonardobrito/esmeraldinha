export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/image', '@nuxt/eslint', '@nuxt/hints'],
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],
  compatibilityDate: '2025-07-15',

  typescript: {
    typeCheck: true,
  },
  debug: true,
  eslint: {
    config: {
      stylistic: true,
    },
  },
})
