import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

import { env } from '../env';
import type { AuthSession } from './supabase';

export type IdentidadeDaSessao =
  | { readonly papel: 'auxiliar de ensino'; readonly contaId: string }
  | { readonly papel: 'professor'; readonly professorId: string; readonly authRevision: number };

export interface SessaoDaEsmeraldinha {
  readonly identidade: IdentidadeDaSessao;
  readonly provider: AuthSession;
  purpose: 'full' | 'setup' | 'recovery';
  expiraEm: number;
}

const sessoes = new Map<string, SessaoDaEsmeraldinha>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const requestSession = new AsyncLocalStorage<string>();
const cleanupHandlers = new Set<(token: string) => Promise<void>>();

export function tokenDaSessaoAtual(): string | undefined { return requestSession.getStore(); }
export function sessaoAindaAtiva(token: string): boolean { return (sessoes.get(token)?.expiraEm ?? 0) > Date.now(); }
export function naSessaoDoAuxiliar<T>(token: string, work: () => T): T { return requestSession.run(token, work); }
export function registrarLimpezaDeSessao(handler: (token: string) => Promise<void>): void { cleanupHandlers.add(handler); }

function scheduleIdle(token: string, sessao: SessaoDaEsmeraldinha): void {
  clearTimeout(idleTimers.get(token));
  const timer = setTimeout(() => {
    if (sessoes.get(token) !== sessao) return;
    if (sessao.expiraEm <= Date.now()) void encerrarSessao(token);
    else scheduleIdle(token, sessao);
  }, Math.min(Math.max(1, sessao.expiraEm - Date.now()), 2_147_483_647));
  timer.unref();
  idleTimers.set(token, timer);
}

export function abrirSessao(identidade: IdentidadeDaSessao, provider: AuthSession, purpose: SessaoDaEsmeraldinha['purpose'] = 'full'): string {
  for (const [token, sessao] of sessoes) if (sessao.expiraEm <= Date.now()) void encerrarSessao(token);
  const token = randomBytes(32).toString('base64url');
  sessoes.set(token, { identidade, provider, purpose, expiraEm: Date.now() + env.conta.sessaoIdleMs });
  scheduleIdle(token, sessoes.get(token)!);
  return token;
}

/** Provider refresh never extends app idleness; only an authenticated request does. */
export async function usarSessao(token: string): Promise<SessaoDaEsmeraldinha | null> {
  const sessao = sessoes.get(token);
  if (!sessao) return null;
  if (sessao.expiraEm <= Date.now()) {
    void encerrarSessao(token);
    return null;
  }
  await sessao.provider.accessToken();
  if (sessoes.get(token) !== sessao || sessao.expiraEm <= Date.now()) return null;
  sessao.expiraEm = Date.now() + env.conta.sessaoIdleMs;
  scheduleIdle(token, sessao);
  return sessao;
}

export async function encerrarSessao(token: string): Promise<void> {
  const sessao = sessoes.get(token);
  if (!sessao) return;
  sessoes.delete(token);
  clearTimeout(idleTimers.get(token));
  idleTimers.delete(token);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled([sessao.provider.signOut('local'), ...[...cleanupHandlers].map((handler) => handler(token))]),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 2000); timer.unref(); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function encerrarSessoesDaConta(contaId: string, exceto?: string): Promise<void> {
  await Promise.all([...sessoes].filter(([token, sessao]) =>
    token !== exceto && sessao.identidade.papel === 'auxiliar de ensino' && sessao.identidade.contaId === contaId,
  ).map(([token]) => encerrarSessao(token)));
}

export async function encerrarSessoesDoProfessor(professorId: string): Promise<void> {
  await Promise.all([...sessoes].filter(([, sessao]) =>
    sessao.identidade.papel === 'professor' && sessao.identidade.professorId === professorId,
  ).map(([token]) => encerrarSessao(token)));
}

export async function encerrarTodasAsSessoes(): Promise<void> {
  await Promise.all([...sessoes.keys()].map(encerrarSessao));
}

export function renovarSessao(token: string): string {
  const sessao = sessoes.get(token);
  if (!sessao) throw new Error('Cannot rotate an ended sessão do auxiliar.');
  sessoes.delete(token);
  clearTimeout(idleTimers.get(token));
  idleTimers.delete(token);
  for (const handler of cleanupHandlers) void handler(token).catch(() => {});
  return abrirSessao(sessao.identidade, sessao.provider, 'full');
}
