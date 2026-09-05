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
 *
 * Both identifiers are read bare rather than off `globalThis`: each is a
 * module-scoped binding, absent from `globalThis` in either format, so only
 * the bare form sees the value the bundler substitutes.
 */
function requireBase(): string {
  return typeof __dirname === 'string'
    ? pathToFileURL(`${__dirname}/`).href
    : import.meta.url;
}

/**
 * Loads `electron` at runtime, without letting a bundler resolve it
 * statically — `electron` is external to the bundle and only exists inside
 * the Electron process.
 */
export function requireElectron<T>(): T {
  return createRequire(requireBase())('electron') as T;
}
