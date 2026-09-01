import { PORTAL_URL as DEFAULT_PORTAL_URL } from './scrape/portal';

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  /** URL do portal do professor. */
  portalUrl: process.env.PORTAL_URL?.trim() || DEFAULT_PORTAL_URL,
  port: readInt(process.env.SERVER_PORT, 3001),
  /**
   * Cada funcionalidade tem seu próprio controle de headless: use
   * <FUNCIONALIDADE>_HEADLESS=false para acompanhar o navegador ao depurar.
   */
  headless: {
    login: process.env.LOGIN_HEADLESS !== 'false',
  },
  /** Onde salvar screenshot + HTML quando o login no portal falha. */
  debugDir: process.env.PORTAL_DEBUG_DIR?.trim() || '.portal-debug',
  /** O agente que lê o material enviado pelo professor. */
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY?.trim() ?? '',
    /** Precisa aceitar imagem e PDF: é isso que o professor manda. */
    model: process.env.OPENROUTER_MODEL?.trim() || 'google/gemini-2.5-flash',
    baseUrl:
      process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
  },
  /** Tamanho máximo de cada arquivo de um envio. */
  maxUploadBytes: readInt(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
  /** Uma sessão ociosa é encerrada depois desse tempo. */
  sessionIdleMs: readInt(process.env.PORTAL_SESSION_IDLE_MS, 15 * 60_000),
  /**
   * Qual adapter de encriptação usar para a senha do professor. Por
   * padrão, `electron` dentro do processo principal do Electron e `dev`
   * em qualquer outro lugar (`pnpm dev:api`, testes). Pode ser forçado via
   * ENCRYPTION_ADAPTER, o que os testes usam para nunca tocar o keychain
   * do sistema operacional.
   */
  encryptionAdapter: (process.env.ENCRYPTION_ADAPTER === 'electron' ||
  (!process.env.ENCRYPTION_ADAPTER && process.versions.electron)
    ? 'electron'
    : 'dev') as 'electron' | 'dev',
  /** Chave de desenvolvimento usada pelo DevEncryptionAdapter. */
  devEncryptionKey: process.env.ESMERALDINHA_ENCRYPTION_KEY?.trim() ?? '',
  /**
   * Caminho do arquivo SQLite onde os professores são persistidos. Sob
   * Electron, `electron/main.ts` aponta isso para `app.getPath('userData')`,
   * do mesmo jeito que já faz com `PORTAL_DEBUG_DIR`. Testes apontam para um
   * caminho temporário.
   */
  dbPath: process.env.ESMERALDINHA_DB_PATH?.trim() || './data/esmeraldinha.db',
} as const;
