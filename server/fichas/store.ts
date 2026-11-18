import { callData } from '../database/remote';
import type { Database } from '../database/types';
import { env } from '../env';

import type { AreaDeConhecimento, EstruturaDaFicha, PreviaDaFicha } from '../../shared/ficha-de-desempenho';

/** Stores the áreas and habilidades read from a turma's ficha, replacing any earlier read. */
export async function salvarEstruturaDaFicha(
  db: Database,
  professorId: string,
  turma: string,
  { ficha, areas }: Omit<EstruturaDaFicha, 'lidaEm'>,
): Promise<EstruturaDaFicha> {
  if (env.dataApiUrl)
    return callData<EstruturaDaFicha>('fichas.salvarEstruturaDaFicha', [professorId, turma, { ficha, areas }]);
  const lidaEm = new Date().toISOString();
  await db.prepare(
    `INSERT INTO ficha_estruturas (professor_id, turma, ficha, areas_json, lida_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (professor_id, turma)
     DO UPDATE SET ficha = excluded.ficha, areas_json = excluded.areas_json, lida_em = excluded.lida_em`,
  ).run(professorId, turma, ficha, JSON.stringify(areas), lidaEm);
  return { ficha, areas, lidaEm };
}

export async function getEstruturaDaFicha(
  db: Database,
  professorId: string,
  turma: string,
): Promise<EstruturaDaFicha | null> {
  if (env.dataApiUrl)
    return callData<EstruturaDaFicha | null>('fichas.getEstruturaDaFicha', [professorId, turma]);
  const row = (await db
    .prepare('SELECT ficha, areas_json, lida_em FROM ficha_estruturas WHERE professor_id = ? AND turma = ?')
    .get(professorId, turma)) as { ficha: string; areas_json: string; lida_em: string } | undefined;

  return row
    ? { ficha: row.ficha, areas: JSON.parse(row.areas_json) as AreaDeConhecimento[], lidaEm: row.lida_em }
    : null;
}

/** Stores the prévia of a turma's ficha, replacing the earlier one. */
export async function salvarPrevia(
  db: Database,
  cadernetaId: string,
  turma: string,
  previa: Omit<PreviaDaFicha, 'atualizadaEm'>,
): Promise<PreviaDaFicha> {
  if (env.dataApiUrl)
    return callData<PreviaDaFicha>('fichas.salvarPrevia', [cadernetaId, turma, previa]);
  const atualizadaEm = new Date().toISOString();
  const salva: PreviaDaFicha = { ...previa, atualizadaEm };
  await db.prepare(
    `INSERT INTO ficha_previas (caderneta_id, turma, previa_json, atualizada_em)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (caderneta_id, turma)
     DO UPDATE SET previa_json = excluded.previa_json, atualizada_em = excluded.atualizada_em`,
  ).run(cadernetaId, turma, JSON.stringify(salva), atualizadaEm);
  return salva;
}

export async function getPrevia(db: Database, cadernetaId: string, turma: string): Promise<PreviaDaFicha | null> {
  if (env.dataApiUrl)
    return callData<PreviaDaFicha | null>('fichas.getPrevia', [cadernetaId, turma]);
  const row = (await db
    .prepare('SELECT previa_json FROM ficha_previas WHERE caderneta_id = ? AND turma = ?')
    .get(cadernetaId, turma)) as { previa_json: string } | undefined;
  return row ? (JSON.parse(row.previa_json) as PreviaDaFicha) : null;
}

export async function apagarPrevia(db: Database, cadernetaId: string, turma: string): Promise<void> {
  if (env.dataApiUrl)
    return callData<void>('fichas.apagarPrevia', [cadernetaId, turma]);
  await db.prepare('DELETE FROM ficha_previas WHERE caderneta_id = ? AND turma = ?').run(cadernetaId, turma);
}
