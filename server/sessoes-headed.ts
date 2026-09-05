import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { login } from './scrape/portal';
import type { ProfessorCredenciais } from './scrape/types';
import { env } from './env';

/**
 * A sessão visível do portal, aquela em que o auxiliar de ensino confere e
 * salva com as próprias mãos.
 *
 * É uma sessão à parte das de `portal-sessions.ts` de propósito: lá o
 * navegador é único e nasce com `headless` decidido no `launch`, e não há como
 * mostrar depois uma janela que nasceu invisível. Aqui o navegador é sempre
 * headed, e existe uma janela por professor — reaproveitada entre aulas, para
 * que preencher a segunda aula não custe outro login.
 */
export interface SessaoHeaded {
  readonly professorId: string;
  readonly login: string;
  readonly escola: string;
  readonly page: Page;
  readonly context: BrowserContext;
}

interface SessaoRastreada extends SessaoHeaded {
  /** Uma aula por vez na página: dois preenchimentos juntos se atropelariam. */
  fila: Promise<unknown>;
}

const sessoes = new Map<string, SessaoRastreada>();
/** Os logins em voo, para dois cliques seguidos não abrirem duas janelas. */
const abrindo = new Map<string, Promise<SessaoRastreada>>();

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: false }).catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

/** A janela ainda está de pé? O auxiliar pode tê-la fechado no X. */
function estaViva(sessao: SessaoRastreada): boolean {
  return !sessao.page.isClosed();
}

async function abrir(
  professorId: string,
  credenciais: ProfessorCredenciais,
): Promise<SessaoRastreada> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    await login(page, credenciais, env.portalUrl);
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }

  const sessao: SessaoRastreada = {
    professorId,
    login: credenciais.login,
    escola: credenciais.escola,
    page,
    context,
    fila: Promise.resolve(),
  };

  // Fechada pelo auxiliar, a sessão não deve ficar no mapa fingindo existir.
  page.on('close', () => {
    if (sessoes.get(professorId) === sessao) sessoes.delete(professorId);
  });

  sessoes.set(professorId, sessao);

  return sessao;
}

/**
 * A janela do professor: a que já está aberta, ou uma nova. Um login em voo é
 * esperado em vez de refeito.
 */
async function obterSessao(
  professorId: string,
  credenciais: ProfessorCredenciais,
): Promise<SessaoRastreada> {
  const atual = sessoes.get(professorId);
  if (atual && estaViva(atual)) return atual;
  if (atual) sessoes.delete(professorId);

  const emVoo = abrindo.get(professorId);
  if (emVoo) return emVoo;

  const promessa = abrir(professorId, credenciais).finally(() => {
    abrindo.delete(professorId);
  });

  abrindo.set(professorId, promessa);

  return promessa;
}

/**
 * Roda `trabalho` na janela do professor, atrás do que já foi pedido para ela.
 * A janela fica aberta depois — é ela o resultado da operação.
 */
export async function naSessaoHeaded<T>(
  professorId: string,
  credenciais: ProfessorCredenciais,
  trabalho: (page: Page) => Promise<T>,
): Promise<T> {
  const sessao = await obterSessao(professorId, credenciais);

  const atual = sessao.fila.then(
    () => trabalho(sessao.page),
    () => trabalho(sessao.page),
  );

  // A fila só guarda a vez; o erro de cada trabalho é de quem o pediu.
  sessao.fila = atual.catch(() => {});

  const resultado = await atual;

  await sessao.page.bringToFront().catch(() => {});

  return resultado;
}

export async function fecharSessaoHeaded(professorId: string): Promise<boolean> {
  const sessao = sessoes.get(professorId);
  if (!sessao) return false;

  sessoes.delete(professorId);
  await sessao.context.close().catch(() => {});

  return true;
}

export async function fecharSessoesHeaded(): Promise<void> {
  await Promise.all([...sessoes.keys()].map((id) => fecharSessaoHeaded(id)));

  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close().catch(() => {});
  }
}
