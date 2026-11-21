import type { DatabaseSync } from 'node:sqlite';

import type { AreaDeConhecimento, EstruturaDaFicha } from '../../shared/ficha-de-desempenho';

/** Stores the áreas and habilidades read from a turma's ficha, replacing any earlier read. */
export function salvarEstruturaDaFicha(
  db: DatabaseSync,
  professorId: string,
  turma: string,
  { ficha, areas }: Omit<EstruturaDaFicha, 'lidaEm'>,
): EstruturaDaFicha {
  const lidaEm = new Date().toISOString();
  db.prepare(
    `INSERT INTO ficha_estruturas (professor_id, turma, ficha, areas_json, lida_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (professor_id, turma)
     DO UPDATE SET ficha = excluded.ficha, areas_json = excluded.areas_json, lida_em = excluded.lida_em`,
  ).run(professorId, turma, ficha, JSON.stringify(areas), lidaEm);
  return { ficha, areas, lidaEm };
}

export function getEstruturaDaFicha(
  db: DatabaseSync,
  professorId: string,
  turma: string,
): EstruturaDaFicha | null {
  const row = db
    .prepare('SELECT ficha, areas_json, lida_em FROM ficha_estruturas WHERE professor_id = ? AND turma = ?')
    .get(professorId, turma) as { ficha: string; areas_json: string; lida_em: string } | undefined;

  return row
    ? { ficha: row.ficha, areas: JSON.parse(row.areas_json) as AreaDeConhecimento[], lidaEm: row.lida_em }
    : null;
}
