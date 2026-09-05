import { createRequire } from 'node:module';

/**
 * Loads the `electron` module regardless of the module format this file
 * ends up compiled to.
 *
 * Under `tsx`/Vitest (real ESM) `createRequire(import.meta.url)` is the way
 * in. Under the esbuild CJS bundle that ships in the packaged app,
 * `import.meta.url` is stripped to an empty string — esbuild does not
 * rewrite it for the "cjs" output format — and `createRequire('')` throws;
 * CJS already has a `require` global at that point, so that's the fallback.
 * `typeof require` alone isn't a reliable signal here: some ESM test runners
 * still expose a global `require`, which would skip `import.meta.url`
 * (and any `vi.mock('node:module', ...)`) even though it works fine.
 */
export function requireElectron(): typeof import('electron') {
  const nodeRequire: NodeJS.Require = import.meta.url
    ? createRequire(import.meta.url)
    : require;

  return nodeRequire('electron') as typeof import('electron');
}
