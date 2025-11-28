import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'

const resolveAlias = (alias, target) => [
  { find: alias, replacement: target },
  { find: new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*)`), replacement: `${target}/$1` },
]

const appDir = fileURLToPath(new URL('./app', import.meta.url))

const aliasTargets = [
  ['@app', appDir],
  ['@composables', `${appDir}/composables`],
  ['@components', `${appDir}/components`],
  ['@layouts', `${appDir}/layouts`],
  ['@pages', `${appDir}/pages`],
  ['@plugins', `${appDir}/plugins`],
  ['@schemas', `${appDir}/schemas`],
  ['@types', `${appDir}/types`],
]

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: aliasTargets.flatMap(([alias, target]) => resolveAlias(alias, target)),
  },
})
