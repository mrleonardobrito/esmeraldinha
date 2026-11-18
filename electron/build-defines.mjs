/** Only public desktop configuration is embedded in the installer. */
export const VARIAVEIS_DE_BUILD = [
  'ESMERALDINHA_LOGIN',
  'ESMERALDINHA_DATA_API_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_AUXILIAR_AUTH_ID',
  'SUPABASE_AUXILIAR_EMAIL',
  'SUPABASE_AUTH_ADMIN_URL',
];

export function definesDoBuild(env = process.env) {
  if ((env.ESMERALDINHA_DATA_API_URL ?? '').trim()) {
    let url;
    try {
      url = new URL(env.ESMERALDINHA_DATA_API_URL);
    } catch {
      throw new Error('Configure a valid public data API URL.');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ))
    )
      throw new Error(
        'The public data API URL requires HTTPS and cannot contain credentials, a query, or a fragment.',
      );
  }
  if (
    env.SUPABASE_PUBLISHABLE_KEY &&
    !env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')
  ) {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY must be a publishable key. Secret keys cannot enter a desktop build.',
    );
  }
  return Object.fromEntries(
    VARIAVEIS_DE_BUILD.filter((name) => (env[name] ?? '').trim() !== '').map(
      (name) => [`process.env.${name}`, JSON.stringify(env[name])],
    ),
  );
}
