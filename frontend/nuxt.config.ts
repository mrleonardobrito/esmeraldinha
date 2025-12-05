import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, 'app')

const aliasPair = (alias: string, dir: string) => ({
  [alias]: dir,
  [`${alias}/*`]: `${dir}/*`,
})

const aliasTargets: Array<[string, string]> = [
  ['@composables', resolve(appDir, 'composables')],
  ['@types', resolve(appDir, 'types')],
  ['@components', resolve(appDir, 'components')],
  ['@layouts', resolve(appDir, 'layouts')],
  ['@pages', resolve(appDir, 'pages')],
  ['@plugins', resolve(appDir, 'plugins')],
  ['@schemas', resolve(appDir, 'schemas')],
  ['@app', appDir],
]

const nuxtAliases = aliasTargets.reduce<Record<string, string>>(
  (acc, [alias, dir]) => ({ ...acc, ...aliasPair(alias, dir) }),
  {},
)

const viteAliases = Object.entries(nuxtAliases).map(([find, replacement]) => ({
  find,
  replacement,
}))

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/hints',
  ],
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],
  alias: nuxtAliases,
  compatibilityDate: '2025-07-15',

  vite: {
    plugins: [tsconfigPaths()],
    resolve: {
      alias: viteAliases,
    },
  },

  typescript: {
    typeCheck: true,
  },
  debug: true,
  icon: {
    collections: ['lucide'],
  },
})
