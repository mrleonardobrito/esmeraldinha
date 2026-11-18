import { build } from 'esbuild';

await build({
  entryPoints: ['server/database/index.ts'],
  outfile: 'dist-data-api/index.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  packages: 'external',
});
