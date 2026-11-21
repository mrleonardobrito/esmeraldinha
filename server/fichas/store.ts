import type { DatabaseSync } from 'node:sqlite';

import type { AreaDeConhecimento, EstruturaDaFicha, PreviaDaFicha } from '../../shared/ficha-de-desempenho';

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

/** Stores the prévia of a turma's ficha, replacing the earlier one. */
export function salvarPrevia(
  db: DatabaseSync,
  cadernetaId: string,
  turma: string,
  previa: Omit<PreviaDaFicha, 'atualizadaEm'>,
): PreviaDaFicha {
  const atualizadaEm = new Date().toISOString();
  const salva: PreviaDaFicha = { ...previa, atualizadaEm };
  db.prepare(
    `INSERT INTO ficha_previas (caderneta_id, turma, previa_json, atualizada_em)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (caderneta_id, turma)
     DO UPDATE SET previa_json = excluded.previa_json, atualizada_em = excluded.atualizada_em`,
  ).run(cadernetaId, turma, JSON.stringify(salva), atualizadaEm);
  return salva;
}

export function getPrevia(db: DatabaseSync, cadernetaId: string, turma: string): PreviaDaFicha | null {
  const row = db
    .prepare('SELECT previa_json FROM ficha_previas WHERE caderneta_id = ? AND turma = ?')
    .get(cadernetaId, turma) as { previa_json: string } | undefined;
  return row ? (JSON.parse(row.previa_json) as PreviaDaFicha) : null;
}

export function apagarPrevia(db: DatabaseSync, cadernetaId: string, turma: string): void {
  db.prepare('DELETE FROM ficha_previas WHERE caderneta_id = ? AND turma = ?').run(cadernetaId, turma);
}
