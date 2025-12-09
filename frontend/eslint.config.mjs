import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
  features: {
    stylistic: true,
  },
  rules: {
    'no-undef': 'error',
    'semantic-release/semantic-release': 'error',
  },
})
