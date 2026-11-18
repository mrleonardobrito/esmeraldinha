import { callData } from '../database/remote';
import { transaction, type Database } from '../database/types';
import { env } from '../env';

import {
  CLASSIFICACAO_PADRAO_INICIAL,
  isClassificacao,
  type Classificacao,
} from '../../shared/classificacao-de-notas';

/** The turma's classificação padrão; Acima da média until someone changes it. */
export async function getClassificacaoPadrao(
  db: Database,
  professorId: string,
  turma: string,
): Promise<Classificacao> {
  if (env.dataApiUrl)
    return callData<Classificacao>('notas.getClassificacaoPadrao', [professorId, turma]);
  const row = (await db
    .prepare('SELECT classificacao FROM classificacoes_padrao WHERE professor_id = ? AND turma = ?')
    .get(professorId, turma)) as { classificacao: string } | undefined;

  return isClassificacao(row?.classificacao) ? row.classificacao : CLASSIFICACAO_PADRAO_INICIAL;
}

export async function setClassificacaoPadrao(
  db: Database,
  professorId: string,
  turma: string,
  classificacao: Classificacao,
): Promise<void> {
  if (env.dataApiUrl)
    return callData<void>('notas.setClassificacaoPadrao', [professorId, turma, classificacao]);
  await db.prepare(
    `INSERT INTO classificacoes_padrao (professor_id, turma, classificacao) VALUES (?, ?, ?)
     ON CONFLICT (professor_id, turma) DO UPDATE SET classificacao = excluded.classificacao`,
  ).run(professorId, turma, classificacao);
}

/** Each estudante's classificação in the turma, keyed by matrícula. */
export async function listClassificacoes(
  db: Database,
  professorId: string,
  turma: string,
): Promise<Record<string, Classificacao>> {
  if (env.dataApiUrl)
    return callData<Record<string, Classificacao>>('notas.listClassificacoes', [professorId, turma]);
  const rows = (await db
    .prepare(
      'SELECT matricula, classificacao FROM classificacoes_dos_estudantes WHERE professor_id = ? AND turma = ?',
    )
    .all(professorId, turma)) as unknown as { matricula: string; classificacao: string }[];

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
export async function salvarClassificacoes(
  db: Database,
  professorId: string,
  turma: string,
  itens: readonly { matricula: string; classificacao: Classificacao }[],
): Promise<void> {
  if (env.dataApiUrl)
    return callData<void>('notas.salvarClassificacoes', [professorId, turma, itens]);
  const upsert = db.prepare(
    `INSERT INTO classificacoes_dos_estudantes (professor_id, turma, matricula, classificacao)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (professor_id, turma, matricula) DO UPDATE SET classificacao = excluded.classificacao`,
  );

  const remover = db.prepare(
    'DELETE FROM classificacoes_dos_estudantes WHERE professor_id = ? AND turma = ? AND matricula = ?',
  );
  const padrao = await getClassificacaoPadrao(db, professorId, turma);

  await transaction(db, async () => {
    for (const { matricula, classificacao } of itens) {
      if (classificacao === padrao) await remover.run(professorId, turma, matricula);
      else await upsert.run(professorId, turma, matricula, classificacao);
    }
  });
}
