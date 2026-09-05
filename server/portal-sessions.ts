import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { comAvaliacoes, listConteudoOptions, login } from './scrape/portal';
import type { ConteudoCatalogo, ProfessorCredenciais } from './scrape/types';
import { env } from './env';
import { createEncryptionPort } from './encryption';
import { getDb } from './professores/db';
import { getProfessorCredenciais } from './professores/store';
import {
  fecharConexaoRedis,
  invalidarSessao,
  lerSessao,
  renovarSessao,
  salvarSessao,
} from './sessoes-redis';

export interface PortalSession {
  readonly id: string;
  readonly professorId: string;
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
  /** O mesmo catálogo, mais as disciplinas e avaliações. Só o boletim o pede. */
  catalogoComAvaliacoes?: Promise<ConteudoCatalogo>;
}

const sessions = new Map<string, TrackedSession>();
/** De quem era cada sessão, para saber com qual login refazê-la ao expirar. */
const donos = new Map<string, string>();
/** As retomadas em voo, para dois pedidos juntos não fazerem dois logins. */
const retomando = new Map<string, Promise<PortalSession | undefined>>();

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
    void expireSession(session.id);
  }, env.sessionIdleMs);
  // Uma sessão ociosa não deve segurar o processo aberto.
  session.timer.unref();

  // O TTL no Redis acompanha o timer em memória: os dois devem expirar juntos.
  void renovarSessao(session.id);
}

/**
 * Larga o navegador da sessão ociosa, mas guarda de quem ela era: expirar é o
 * portal cansando de esperar, não o auxiliar de ensino dizendo que terminou.
 * É o que `retomarSessao` desfaz.
 */
export async function expireSession(id: string): Promise<boolean> {
  const session = sessions.get(id);
  if (!session) return false;

  sessions.delete(id);
  clearTimeout(session.timer);
  await session.context.close().catch(() => {});
  await invalidarSessao(id);

  return true;
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
  options: { professorId?: string; id?: string } = {},
): Promise<PortalSession> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  // `tsx` compila o servidor com o `keepNames` do esbuild ligado, que injeta
  // um `__name(fn, "fn")` ao redor de função nomeada. Como `page.evaluate` e
  // companhia serializam só o texto da função para rodar dentro da página,
  // esse `__name` não viaja junto — e a chamada quebra com
  // `ReferenceError: __name is not defined`. Suprir um `__name` inofensivo
  // no escopo da página neutraliza o vazamento sem mexer em cada callback.
  await context.addInitScript(() => {
    (window as unknown as { __name?: <T>(fn: T) => T }).__name = (fn) => fn;
  });
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
    // Uma sessão retomada mantém o id: a tela que a abriu continua com ele na mão.
    id: options.id ?? randomUUID(),
    professorId: options.professorId ?? '',
    login: credentials.login,
    escola: credentials.escola,
    page,
    context,
    createdAt: now,
    lastUsedAt: now,
    timer: setTimeout(() => {}, 0),
  };

  sessions.set(session.id, session);
  if (session.professorId) donos.set(session.id, session.professorId);
  scheduleExpiration(session);

  await salvarSessao({
    id: session.id,
    professorId: session.professorId,
    login: session.login,
    escola: session.escola,
    createdAt: session.createdAt,
  });

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

/**
 * O catálogo de opções do professor, raspado na primeira chamada. Uma sessão
 * expirada é retomada antes: o catálogo mora na página, e a página nova não
 * herda o que a antiga tinha raspado.
 */
export async function getCatalogo(id: string): Promise<ConteudoCatalogo | undefined> {
  if (!(await retomarSessao(id))) return undefined;

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

/**
 * O catálogo com as disciplinas e as avaliações de cada etapa. Fica à parte de
 * `getCatalogo` porque custa uma volta ao portal por etapa e por disciplina:
 * quem só vai lançar conteúdo não paga por isso.
 */
export async function getCatalogoComAvaliacoes(
  id: string,
): Promise<ConteudoCatalogo | undefined> {
  const base = await getCatalogo(id);
  if (!base) return undefined;

  const session = sessions.get(id);
  if (!session) return undefined;

  session.catalogoComAvaliacoes ??= comAvaliacoes(session.page, base).catch(
    (error: unknown) => {
      session.catalogoComAvaliacoes = undefined;
      throw error;
    },
  );

  return session.catalogoComAvaliacoes;
}

/**
 * De quem é a sessão `id`. O `Map` em memória responde primeiro; quando ele
 * não sabe — o processo reiniciou e perdeu tudo que não estava no disco —,
 * o Redis é a segunda fonte, desde que o registro ainda não tenha vencido o
 * TTL. Sem essa segunda fonte, um restart em desenvolvimento (o `tsx watch`
 * reinicia a cada arquivo salvo) faz `retomarSessao` desistir na hora, mesmo
 * a sessão estando viva na visão de quem a abriu.
 */
async function donoDaSessao(id: string): Promise<string | undefined> {
  const emMemoria = donos.get(id);
  if (emMemoria) return emMemoria;

  const metadados = await lerSessao(id);
  if (!metadados) return undefined;

  donos.set(id, metadados.professorId);
  return metadados.professorId;
}

/**
 * A sessão de `id`, viva. Quando ela já expirou por ociosidade, um novo login
 * é feito com as credenciais do professor que a abriu e a sessão volta com o
 * mesmo id — a tela que a pediu não precisa saber que ela caiu.
 *
 * Devolve `undefined` quando não há o que retomar: uma sessão encerrada de
 * propósito, um id que nunca existiu, ou um professor que saiu do cadastro.
 * O login que o portal recusa vira `LoginError`, para quem chamou avisar que
 * a senha guardada não serve mais.
 */
export async function retomarSessao(id: string): Promise<PortalSession | undefined> {
  const viva = touchSession(id);
  if (viva) return viva;

  const professorId = await donoDaSessao(id);
  if (!professorId) return undefined;

  const emVoo = retomando.get(id);
  if (emVoo) return emVoo;

  const promessa = (async () => {
    const credenciais = await getProfessorCredenciais(
      getDb(),
      createEncryptionPort(),
      professorId,
    );

    if (!credenciais) {
      // Sem professor não há como refazer o login: a sessão morreu de vez.
      donos.delete(id);
      return undefined;
    }

    return openSession(credenciais, { professorId, id });
  })().finally(() => {
    retomando.delete(id);
  });

  retomando.set(id, promessa);

  return promessa;
}

export async function closeSession(id: string): Promise<boolean> {
  // Encerrar de propósito é diferente de expirar: esta sessão não volta.
  donos.delete(id);

  return expireSession(id);
}

export async function closeAllSessions(): Promise<void> {
  await Promise.all([...sessions.keys()].map((id) => closeSession(id)));
  donos.clear();

  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => {});
  }

  await fecharConexaoRedis();
}

export const sessionIdleMs = env.sessionIdleMs;
