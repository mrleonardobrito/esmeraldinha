import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * Resolves a base path for `createRequire` that is valid in both module
 * formats this code ships in.
 *
 * The Electron main process is an esbuild CJS bundle, where `import.meta` is
 * rewritten to an empty object — `import.meta.url` is `undefined` there, and
 * `createRequire(undefined)` throws. That bundle does get a real `__dirname`.
 * Under `tsx` the module stays ESM, where `__dirname` is absent but
 * `import.meta.url` is real.
 */
function requireBase(): string {
  const dir = (globalThis as { __dirname?: string }).__dirname;
  if (typeof dir === 'string') return pathToFileURL(`${dir}/`).href;
  return import.meta.url;
}

/**
 * Loads `electron` at runtime, without letting a bundler resolve it
 * statically — `electron` is external to the bundle and only exists inside
 * the Electron process.
 */
export function requireElectron<T>(): T {
  return createRequire(requireBase())('electron') as T;
}
