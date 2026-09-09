import { build } from 'esbuild';

import { definesDoBuild } from './build-defines.mjs';

const define = definesDoBuild();

// O valor é secreto, então só os nomes aparecem no log — nunca o conteúdo.
if (Object.keys(define).length > 0) {
  console.log(`Embutidas no bundle: ${Object.keys(define).join(', ')}`);
}

/**
 * O processo principal do Electron é CommonJS: o `package.json` tem
 * `type: module`, então a extensão `.cjs` é obrigatória.
 *
 * O Playwright fica de fora do bundle porque carrega os próprios arquivos em
 * disco — o electron-builder o empacota a partir de `node_modules`.
 */
await build({
  entryPoints: { main: 'electron/main.ts' },
  define,
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  external: ['electron', 'playwright', 'playwright-core', '@playwright/test'],
  logLevel: 'info',
});
