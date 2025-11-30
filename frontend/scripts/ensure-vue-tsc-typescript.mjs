import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const logPrefix = '[vite-plugin-checker-fix]'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const frontendRoot = resolve(__dirname, '..')
const nodeModulesDir = resolve(frontendRoot, 'node_modules')
const pnpmStoreDir = resolve(nodeModulesDir, '.pnpm')
const typescriptLibDir = resolve(nodeModulesDir, 'typescript', 'lib')
const filesToCopy = ['typescript.js', 'typescript.d.ts', 'typesMap.json', 'typingsInstaller.js']

// Busca todos os arquivos lib.*.d.ts da biblioteca padrão do TypeScript
const getLibFiles = () => {
  if (!existsSync(typescriptLibDir)) {
    return []
  }
  return readdirSync(typescriptLibDir)
    .filter(file => file.startsWith('lib.') && file.endsWith('.d.ts'))
    .map(file => ({ file, path: resolve(typescriptLibDir, file) }))
    .filter(({ path }) => existsSync(path))
}

if (!existsSync(typescriptLibDir)) {
  console.warn(`${logPrefix} diretório base do TypeScript não encontrado em ${typescriptLibDir}. Execute pnpm install antes.`)
  process.exit(0)
}

const resolveCandidates = () => {
  if (!existsSync(pnpmStoreDir)) {
    return []
  }

  return readdirSync(pnpmStoreDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('vite-plugin-checker@'))
    .map(entry =>
      resolve(
        pnpmStoreDir,
        entry.name,
        'node_modules',
        'vite-plugin-checker',
        'dist',
        'checkers',
        'vueTsc',
        'typescript-vue-tsc',
        'lib',
      ),
    )
    .filter(candidate => existsSync(candidate))
}

const ensureFiles = () => {
  const candidates = resolveCandidates()
  if (candidates.length === 0) {
    console.log(`${logPrefix} nenhum checker do Vite encontrado. Nada para ajustar.`)
    return
  }

  const sourceFiles = filesToCopy
    .map(file => ({ file, path: resolve(typescriptLibDir, file) }))
    .filter(({ path }) => existsSync(path))

  // Adiciona os arquivos lib.*.d.ts da biblioteca padrão
  const libFiles = getLibFiles()
  const allSourceFiles = [...sourceFiles, ...libFiles]

  if (allSourceFiles.length === 0) {
    console.warn(`${logPrefix} arquivos de origem do TypeScript ausentes em ${typescriptLibDir}.`)
    return
  }

  let fixes = 0

  for (const libDir of candidates) {
    const missing = allSourceFiles.filter(({ file }) => !existsSync(join(libDir, file)))
    if (missing.length === 0) {
      continue
    }

    for (const { file, path } of missing) {
      const target = join(libDir, file)
      copyFileSync(path, target)
    }

    fixes += 1
    const missingFiles = missing.map(({ file }) => file)
    const libFilesCount = missingFiles.filter(f => f.startsWith('lib.')).length
    const otherFilesCount = missingFiles.length - libFilesCount
    const summary = []
    if (otherFilesCount > 0) {
      summary.push(`${otherFilesCount} arquivo(s) principal(is)`)
    }
    if (libFilesCount > 0) {
      summary.push(`${libFilesCount} arquivo(s) de biblioteca`)
    }
    console.log(`${logPrefix} restaurado ${summary.join(' e ')} em ${libDir}`)
  }

  if (fixes === 0) {
    console.log(`${logPrefix} todos os checkers já estavam completos.`)
  }
}

ensureFiles()
