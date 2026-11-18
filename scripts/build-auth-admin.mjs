import { build } from 'esbuild';

await build({
  entryPoints: ['server/auth-admin/index.ts'],
  outfile: 'dist-auth-admin/index.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
});
