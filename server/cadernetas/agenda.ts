import { createEncryptionPort } from '../encryption';
import { env } from '../env';
import { getDb } from '../professores/db';
import { getProfessorCredenciais } from '../professores/store';
import { closeSession, getCatalogo, openSession } from '../portal-sessions';
import { sincronizarCaderneta } from './sincronizacao';

interface CadernetaAgendada {
  id: string;
  professor_id: string;
  turma: string;
}

/** Quanto tempo esperar até checar de novo se é hora de sincronizar. */
const TICK_MS = 15 * 60_000;

let timer: NodeJS.Timeout | undefined;
let rodando = false;

/** A próxima madrugada de `env.sync.weekday` às `env.sync.hour`, em local time. */
export function proximaExecucao(agora: Date, weekday: number, hour: number): Date {
  const alvo = new Date(agora);
  alvo.setHours(hour, 0, 0, 0);

  const diasAte = (weekday - alvo.getDay() + 7) % 7;
  alvo.setDate(alvo.getDate() + diasAte);

  // Se o horário de hoje já passou, fica para a semana que vem.
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 7);

  return alvo;
}

/**
 * Sincroniza todas as cadernetas, uma sessão do portal por professor. Roda em
 * série de propósito: são várias voltas ao portal por caderneta, e abrir tudo
 * ao mesmo tempo derrubaria a máquina do auxiliar de ensino (e provavelmente a
 * paciência do portal).
 */
export async function sincronizarTodasAsCadernetas(): Promise<{
  sincronizadas: number;
  falhas: number;
}> {
  const cadernetas = getDb()
    .prepare('SELECT id, professor_id, turma FROM cadernetas ORDER BY professor_id, turma')
    .all() as unknown as CadernetaAgendada[];

  const porProfessor = new Map<string, CadernetaAgendada[]>();
  for (const caderneta of cadernetas) {
    const lista = porProfessor.get(caderneta.professor_id) ?? [];
    lista.push(caderneta);
    porProfessor.set(caderneta.professor_id, lista);
  }

  let sincronizadas = 0;
  let falhas = 0;

  for (const [professorId, doProfessor] of porProfessor) {
    let sessionId: string | undefined;

    try {
      const credenciais = await getProfessorCredenciais(
        getDb(),
        createEncryptionPort(),
        professorId,
      );

      if (!credenciais) {
        falhas += doProfessor.length;
        continue;
      }

      const session = await openSession(credenciais);
      sessionId = session.id;

      const catalogo = await getCatalogo(session.id);
      if (!catalogo) throw new Error('A sessão do portal expirou antes da raspagem.');

      for (const caderneta of doProfessor) {
        const ok = await sincronizarCaderneta({
          cadernetaId: caderneta.id,
          sessionId: session.id,
          page: session.page,
          catalogo,
        });

        if (ok) sincronizadas += 1;
        else falhas += 1;
      }
    } catch (error) {
      // Um professor cujo login falhou não pode impedir os outros. A causa
      // mais provável aqui é o keychain trancado — ver docs/agents/domain.md.
      console.error(`Sincronização semanal falhou para o professor ${professorId}:`, error);
      falhas += doProfessor.length;
    } finally {
      if (sessionId) await closeSession(sessionId).catch(() => {});
    }
  }

  console.log(
    `Sincronização semanal: ${sincronizadas} caderneta(s) atualizada(s), ${falhas} falha(s).`,
  );

  return { sincronizadas, falhas };
}

/**
 * Liga o agendamento semanal. O relógio é conferido a cada `TICK_MS` em vez de
 * um `setTimeout` longo porque um desktop suspende: dormir até a madrugada e
 * acordar tarde demais é a falha esperada, não a exceção.
 */
export function iniciarAgendaSemanal(): void {
  if (timer || !env.sync.enabled) return;

  let proxima = proximaExecucao(new Date(), env.sync.weekday, env.sync.hour);
  console.log(`Sincronização semanal agendada para ${proxima.toLocaleString('pt-BR')}.`);

  timer = setInterval(() => {
    if (rodando || new Date() < proxima) return;

    rodando = true;
    void sincronizarTodasAsCadernetas()
      .catch((error: unknown) => {
        console.error('Sincronização semanal falhou:', error);
      })
      .finally(() => {
        rodando = false;
        proxima = proximaExecucao(new Date(), env.sync.weekday, env.sync.hour);
        console.log(`Próxima sincronização: ${proxima.toLocaleString('pt-BR')}.`);
      });
  }, TICK_MS);

  // Uma agenda ociosa não deve segurar o processo aberto.
  timer.unref();
}

export function pararAgendaSemanal(): void {
  if (!timer) return;

  clearInterval(timer);
  timer = undefined;
}
