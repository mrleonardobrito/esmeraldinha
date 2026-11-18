/** Only public desktop configuration is embedded in the installer. */
export const VARIAVEIS_DE_BUILD = [
  'ESMERALDINHA_LOGIN',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_AUXILIAR_AUTH_ID',
  'SUPABASE_AUXILIAR_EMAIL',
  'SUPABASE_AUTH_ADMIN_URL',
];

export function definesDoBuild(env = process.env) {
  if (env.SUPABASE_PUBLISHABLE_KEY && !env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key. Secret keys cannot enter a desktop build.');
  }
  return Object.fromEntries(
    VARIAVEIS_DE_BUILD.filter((name) => (env[name] ?? '').trim() !== '').map(
      (name) => [`process.env.${name}`, JSON.stringify(env[name])],
    ),
  );
}
