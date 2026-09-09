import { randomBytes } from 'node:crypto';

import { env } from '../env';

/**
 * A sessão do auxiliar de ensino — não confundir com a sessão do portal, que
 * é um navegador aberto com as credenciais de um professor. Esta é só a
 * prova de que quem está do outro lado já entrou com a senha da conta.
 *
 * Mora em memória de propósito: o processo que serve a API é o mesmo que o
 * app fecha ao sair, e uma sessão que não sobrevive a isso é exatamente o
 * que se quer de um app que guarda as credenciais dos professores.
 */
interface SessaoDoAuxiliar {
  readonly contaId: string;
  expiraEm: number;
}

const sessoes = new Map<string, SessaoDoAuxiliar>();

/** Sessões vencidas só ocupam memória: cada consulta aproveita para limpá-las. */
function descartarVencidas(agora: number): void {
  for (const [token, sessao] of sessoes) {
    if (sessao.expiraEm <= agora) sessoes.delete(token);
  }
}

/** Abre uma sessão para a conta e devolve o token que a identifica. */
export function abrirSessao(contaId: string): string {
  const agora = Date.now();
  descartarVencidas(agora);

  const token = randomBytes(32).toString('base64url');
  sessoes.set(token, { contaId, expiraEm: agora + env.conta.sessaoIdleMs });

  return token;
}

/**
 * A conta dona do token, renovando a ociosidade — ou `null` se o token não
 * vale mais.
 */
export function usarSessao(token: string): string | null {
  const agora = Date.now();
  const sessao = sessoes.get(token);

  if (!sessao) return null;

  if (sessao.expiraEm <= agora) {
    sessoes.delete(token);
    return null;
  }

  sessao.expiraEm = agora + env.conta.sessaoIdleMs;
  return sessao.contaId;
}

/** Encerra a sessão do token. É o que o botão de sair faz. */
export function encerrarSessao(token: string): void {
  sessoes.delete(token);
}

/**
 * Encerra todas as sessões da conta. Trocar a senha passa por aqui: uma
 * senha nova não deve deixar sessões antigas abertas por aí.
 */
export function encerrarSessoesDaConta(contaId: string, exceto?: string): void {
  for (const [token, sessao] of sessoes) {
    if (sessao.contaId === contaId && token !== exceto) sessoes.delete(token);
  }
}
