import type { DatabaseSync } from 'node:sqlite';

import {
  CLASSIFICACAO_PADRAO_INICIAL,
  isClassificacao,
  type Classificacao,
} from '../../shared/classificacao-de-notas';

/** The turma's classificação padrão; Acima da média until someone changes it. */
export function getClassificacaoPadrao(
  db: DatabaseSync,
  professorId: string,
  turma: string,
): Classificacao {
  const row = db
    .prepare('SELECT classificacao FROM classificacoes_padrao WHERE professor_id = ? AND turma = ?')
    .get(professorId, turma) as { classificacao: string } | undefined;

  return isClassificacao(row?.classificacao) ? row.classificacao : CLASSIFICACAO_PADRAO_INICIAL;
}

export function setClassificacaoPadrao(
  db: DatabaseSync,
  professorId: string,
  turma: string,
  classificacao: Classificacao,
): void {
  db.prepare(
    `INSERT INTO classificacoes_padrao (professor_id, turma, classificacao) VALUES (?, ?, ?)
     ON CONFLICT (professor_id, turma) DO UPDATE SET classificacao = excluded.classificacao`,
  ).run(professorId, turma, classificacao);
}

/** Each estudante's classificação in the turma, keyed by matrícula. */
export function listClassificacoes(
  db: DatabaseSync,
  professorId: string,
  turma: string,
): Record<string, Classificacao> {
  const rows = db
    .prepare(
      'SELECT matricula, classificacao FROM classificacoes_dos_estudantes WHERE professor_id = ? AND turma = ?',
    )
    .all(professorId, turma) as unknown as { matricula: string; classificacao: string }[];

  const classificacoes: Record<string, Classificacao> = {};
  for (const { matricula, classificacao } of rows) {
    if (isClassificacao(classificacao)) classificacoes[matricula] = classificacao;
  }
  return classificacoes;
}

/**
 * Remembers each estudante's classificação. Only the ones that differ from the
 * turma's padrão are kept: an estudante who matches it goes back to following
 * the padrão, so changing the padrão later still moves them.
 */
export function salvarClassificacoes(
  db: DatabaseSync,
  professorId: string,
  turma: string,
  itens: readonly { matricula: string; classificacao: Classificacao }[],
): void {
  const upsert = db.prepare(
    `INSERT INTO classificacoes_dos_estudantes (professor_id, turma, matricula, classificacao)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (professor_id, turma, matricula) DO UPDATE SET classificacao = excluded.classificacao`,
  );

  const remover = db.prepare(
    'DELETE FROM classificacoes_dos_estudantes WHERE professor_id = ? AND turma = ? AND matricula = ?',
  );
  const padrao = getClassificacaoPadrao(db, professorId, turma);

  db.exec('BEGIN');
  try {
    for (const { matricula, classificacao } of itens) {
      if (classificacao === padrao) remover.run(professorId, turma, matricula);
      else upsert.run(professorId, turma, matricula, classificacao);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
