import { PORTAL_URL as DEFAULT_PORTAL_URL } from '../scrape/portal';

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  /** URL do portal do professor. Sobrescreva com PORTAL_URL no .env. */
  portalUrl: process.env.PORTAL_URL?.trim() || DEFAULT_PORTAL_URL,
  port: readInt(process.env.SERVER_PORT, 3001),
  /** PORTAL_HEADLESS=false abre o navegador visível, útil para depurar o scraping. */
  headless: process.env.PORTAL_HEADLESS !== 'false',
  /** Onde salvar screenshot + HTML quando o login no portal falha. */
  debugDir: process.env.PORTAL_DEBUG_DIR?.trim() || '.portal-debug',
  /** Uma sessão ociosa é encerrada depois desse tempo. */
  sessionIdleMs: readInt(process.env.PORTAL_SESSION_IDLE_MS, 15 * 60_000),
} as const;
