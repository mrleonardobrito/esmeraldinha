import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { listConteudoOptions, login } from './scrape/portal';
import type { ConteudoCatalogo, ProfessorCredenciais } from './scrape/types';
import { env } from './env';

export interface PortalSession {
  readonly id: string;
  readonly login: string;
  readonly escola: string;
  readonly page: Page;
  readonly createdAt: number;
  lastUsedAt: number;
}

interface TrackedSession extends PortalSession {
  readonly context: BrowserContext;
  timer: NodeJS.Timeout;
  /** Raspar o catálogo custa uma volta por etapa, e ele não muda na sessão. */
  catalogo?: Promise<ConteudoCatalogo>;
}

const sessions = new Map<string, TrackedSession>();

let browserPromise: Promise<Browser> | null = null;

/** O navegador é único e compartilhado; cada sessão ganha um contexto isolado. */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: env.headless.login }).catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

function scheduleExpiration(session: TrackedSession): void {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    void closeSession(session.id);
  }, env.sessionIdleMs);
  // Uma sessão ociosa não deve segurar o processo aberto.
  session.timer.unref();
}

/** Salva screenshot e HTML da página; devolve o caminho base, sem extensão. */
async function captureFailure(page: Page): Promise<string | null> {
  try {
    await mkdir(env.debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = resolve(join(env.debugDir, `login-${stamp}`));

    await page.screenshot({ path: `${base}.png`, fullPage: true });
    await writeFile(`${base}.html`, await page.content(), 'utf8');

    return base;
  } catch {
    return null;
  }
}

export async function openSession(
  credentials: ProfessorCredenciais,
): Promise<PortalSession> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await login(page, credentials, env.portalUrl);
  } catch (error) {
    // A página no momento da falha é a única forma de saber o que o portal mostrou.
    const artifacts = await captureFailure(page);
    if (artifacts) {
      console.error(`Página no momento da falha: ${artifacts}.png / .html`);
    }
    await context.close();
    throw error;
  }

  const now = Date.now();
  const session: TrackedSession = {
    id: randomUUID(),
    login: credentials.login,
    escola: credentials.escola,
    page,
    context,
    createdAt: now,
    lastUsedAt: now,
    timer: setTimeout(() => {}, 0),
  };

  sessions.set(session.id, session);
  scheduleExpiration(session);

  return session;
}

/** Devolve a sessão e renova o tempo de ociosidade. */
export function touchSession(id: string): PortalSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  session.lastUsedAt = Date.now();
  scheduleExpiration(session);

  return session;
}

/** O catálogo de opções do professor, raspado na primeira chamada. */
export async function getCatalogo(id: string): Promise<ConteudoCatalogo | undefined> {
  const session = sessions.get(id);
  if (!session) return undefined;

  session.lastUsedAt = Date.now();
  scheduleExpiration(session);

  session.catalogo ??= listConteudoOptions(session.page).catch((error: unknown) => {
    // Uma falha não pode virar cache: a próxima tentativa precisa tentar de novo.
    session.catalogo = undefined;
    throw error;
  });

  return session.catalogo;
}

export async function closeSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session) return false;

  sessions.delete(id);
  clearTimeout(session.timer);
  await session.context.close().catch(() => {});

  return true;
}

export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeSession(id)));

  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => {});
  }
}

export const sessionIdleMs = env.sessionIdleMs;
