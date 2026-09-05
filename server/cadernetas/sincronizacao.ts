import type { Page } from 'playwright';

import { getDb } from '../professores/db';
import { rasparCaderneta } from './raspagem';
import {
  getCaderneta,
  marcarFalhaNaSincronizacao,
  marcarSincronizando,
  syncCaderneta,
} from './store';
import type { ConteudoCatalogo } from '../scrape/types';

/** As sincronizações em voo, para não raspar a mesma caderneta duas vezes. */
const emAndamento = new Set<string>();

export interface SincronizarInput {
  cadernetaId: string;
  /** A sessão dona da página: é por ela que os jobs fazem fila. */
  sessionId: string;
  page: Page;
  catalogo: ConteudoCatalogo;
}

/**
 * A página em que o job vai raspar, resolvida na hora de rodar e não na de
 * entrar na fila: esperando a vez, a sessão pode ter expirado e voltado com
 * outra página — a antiga, fechada, não raspa nada.
 */
async function paginaDoJob(input: SincronizarInput): Promise<Page> {
  if (!input.page.isClosed?.()) return input.page;

  const { retomarSessao } = await import('../portal-sessions');
  const sessao = await retomarSessao(input.sessionId);

  if (!sessao) throw new Error('A sessão do portal expirou e não pôde ser retomada.');

  return sessao.page;
}

/**
 * Raspa o portal e grava o resultado, carimbando o status em cada etapa do
 * caminho. Erros viram estado da caderneta, não exceção: quem chama isto é um
 * disparo em segundo plano, e não há ninguém para capturar o `throw`.
 *
 * Devolve `false` quando a caderneta já está sendo sincronizada.
 */
export async function sincronizarCaderneta(input: SincronizarInput): Promise<boolean> {
  const { cadernetaId, catalogo } = input;

  if (emAndamento.has(cadernetaId)) return false;

  emAndamento.add(cadernetaId);

  try {
    const caderneta = getCaderneta(getDb(), cadernetaId);
    marcarSincronizando(getDb(), cadernetaId);

    const page = await paginaDoJob(input);
    const raspagem = await rasparCaderneta(page, catalogo, caderneta.turma);
    syncCaderneta(getDb(), cadernetaId, raspagem);

    return true;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    console.error(`Falha ao sincronizar a caderneta ${cadernetaId}:`, error);

    try {
      marcarFalhaNaSincronizacao(getDb(), cadernetaId, motivo);
    } catch {
      // A caderneta pode ter sido excluída no meio da raspagem.
    }

    return false;
  } finally {
    emAndamento.delete(cadernetaId);
  }
}

/**
 * A fila de cada sessão. Uma sessão tem uma única página do Playwright, e
 * raspar é navegar por ela: dois jobs ao mesmo tempo se atropelariam e as
 * aulas de uma turma cairiam na outra. Cada job continua sendo seu, com o
 * `syncStatus` da sua caderneta, mas eles esperam a vez.
 */
const filas = new Map<string, Promise<unknown>>();

/**
 * Dispara a sincronização sem esperar por ela, atrás das que já foram pedidas
 * para a mesma sessão.
 */
export function sincronizarEmSegundoPlano(input: SincronizarInput): void {
  const anterior = filas.get(input.sessionId) ?? Promise.resolve();
  // `sincronizarCaderneta` já trata os próprios erros; o `catch` aqui é só
  // para uma falha inesperada não interromper a fila de quem vem depois.
  const atual = anterior.then(
    () => sincronizarCaderneta(input),
    () => sincronizarCaderneta(input),
  );

  filas.set(input.sessionId, atual);

  void atual.finally(() => {
    // Só o último da fila a terminar apaga a entrada: apagar a de outro job
    // deixaria o próximo pedido furar a fila.
    if (filas.get(input.sessionId) === atual) filas.delete(input.sessionId);
  });
}

/** Só para os testes: esquece o que estava em andamento. */
export function resetSincronizacoes(): void {
  emAndamento.clear();
  filas.clear();
}
