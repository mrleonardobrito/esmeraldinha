import { callData } from '../database/remote';
import { env } from '../env';
import { transaction } from '../database/types';
import { randomUUID } from 'node:crypto';
import type { Database } from '../database/types';

import { turnoDaTurma } from './turno';

/**
 * Uma turma do professor, como o portal a nomeia. Ela é descoberta no cadastro
 * do professor, não pedida a ninguém: quem sabe em quais turmas um professor
 * trabalha é o portal.
 */
export interface Turma {
  id: string;
  professorId: string;
  nome: string;
  /** Lido do fim do nome da turma; nulo quando o portal não o escreveu. */
  turno: string | null;
  /**
   * O período letivo em que o portal oferece a turma ("2026", "2026 EJA").
   * Nulo nas turmas lidas antes de o cadastro guardá-lo: uma rebusca preenche.
   */
  periodoLetivo: string | null;
  /** Null until an unambiguous grupo diário has been read from the portal. */
  grupoDiario: string | null;
  totalDeEstudantes: number;
  createdAt: string;
}

/** Uma turma como a busca no portal a traz: o nome e o período em que mora. */
export interface TurmaEncontrada {
  readonly nome: string;
  readonly periodoLetivo?: string | null;
  readonly grupoDiario?: string | null;
}

/** Um estudante matriculado na turma, como o portal o lista. */
export interface EstudanteDaTurma {
  matricula: string;
  nome: string;
  situacao: string | null;
  /** `null` enquanto a busca de estudantes não estiver implementada. */
  dataMatricula: string | null;
}

export class TurmaNotFoundError extends Error {
  constructor(id: string) {
    super(`Nenhuma turma encontrada com o id ${id}.`);
    this.name = 'TurmaNotFoundError';
  }
}

interface TurmaRow {
  id: string;
  professor_id: string;
  nome: string;
  turno: string | null;
  periodo_letivo: string | null;
  grupo_diario: string | null;
  created_at: string;
  total_de_estudantes: number;
}

function toTurma(row: TurmaRow): Turma {
  return {
    id: row.id,
    professorId: row.professor_id,
    nome: row.nome,
    turno: row.turno,
    periodoLetivo: row.periodo_letivo,
    grupoDiario: row.grupo_diario,
    totalDeEstudantes: Number(row.total_de_estudantes),
    createdAt: row.created_at,
  };
}

const SELECT_TURMA = `
  SELECT t.id,
         t.professor_id,
         t.nome,
         t.turno,
         t.periodo_letivo,
         t.grupo_diario,
         t.created_at,
         COUNT(e.matricula) AS total_de_estudantes
    FROM turmas t
    LEFT JOIN turma_estudantes e ON e.turma_id = t.id
`;

/**
 * As turmas de um professor, em ordem de nome. Ordenar pelo cadastro não
 * serviria: uma rebusca mantém as turmas que continuam no portal e só as
 * novas ganham data nova, então a ordem dependeria de quando cada uma
 * apareceu, e não do que a pessoa lê na tela.
 */
export async function listTurmas(
  db: Database,
  professorId: string,
): Promise<Turma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listTurmas>>>(
      'turmas.listTurmas',
      [professorId],
    );
  const rows = (await db
    .prepare(
      `${SELECT_TURMA} WHERE t.professor_id = ?
        GROUP BY t.id ORDER BY t.nome ASC`,
    )
    .all(professorId)) as unknown as TurmaRow[];

  return rows.map(toTurma);
}

/** @throws {TurmaNotFoundError} quando `id` não é de nenhuma turma. */
export async function getTurma(db: Database, id: string): Promise<Turma> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof getTurma>>>('turmas.getTurma', [
      id,
    ]);
  const row = (await db
    .prepare(`${SELECT_TURMA} WHERE t.id = ? GROUP BY t.id`)
    .get(id)) as unknown as TurmaRow | undefined;

  if (!row) throw new TurmaNotFoundError(id);

  return toTurma(row);
}

/**
 * Guarda as turmas que a busca no portal trouxe, substituindo as que o
 * professor tinha. O nome vem inteiro do portal e o turno é lido do fim dele:
 * nenhum dos dois é digitado. O período letivo também é do portal — é nele
 * que a turma tem de ser procurada de novo.
 *
 * Uma turma que continua no portal mantém o id e os estudantes que já tinha —
 * é a mesma turma, relida, só com o período atualizado. Uma que sumiu do
 * portal sai daqui junto com eles.
 */
export async function replaceTurmas(
  db: Database,
  professorId: string,
  turmas: readonly TurmaEncontrada[],
): Promise<Turma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof replaceTurmas>>>(
      'turmas.replaceTurmas',
      [professorId, turmas],
    );
  const nomes = turmas.map((turma) => turma.nome);
  const insert = db.prepare(
    `INSERT INTO turmas (id, professor_id, nome, turno, periodo_letivo, grupo_diario, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    'UPDATE turmas SET periodo_letivo = ?, grupo_diario = ? WHERE id = ?',
  );
  const existentes = new Map(
    (await listTurmas(db, professorId)).map((turma) => [turma.nome, turma]),
  );
  const createdAt = new Date().toISOString();

  await transaction(db, async () => {
    for (const turma of existentes.values()) {
      if (!nomes.includes(turma.nome)) {
        await db
          .prepare('DELETE FROM turma_estudantes WHERE turma_id = ?')
          .run(turma.id);
        await db.prepare('DELETE FROM turmas WHERE id = ?').run(turma.id);
      }
    }
    for (const { nome, periodoLetivo, grupoDiario } of turmas) {
      const existente = existentes.get(nome);

      if (existente) {
        await update.run(periodoLetivo ?? null, grupoDiario ?? null, existente.id);
        continue;
      }

      await insert.run(
        randomUUID(),
        professorId,
        nome,
        turnoDaTurma(nome),
        periodoLetivo ?? null,
        grupoDiario ?? null,
        createdAt,
      );
    }
  });

  return await listTurmas(db, professorId);
}

/**
 * O período letivo em que a turma do professor mora, como o cadastro o
 * guardou. `undefined` quando a turma não é conhecida ou foi lida antes de o
 * período ser guardado: nesse caso a sessão fica no período em que está, que
 * é o comportamento de antes.
 */
export async function periodoLetivoDaTurma(
  db: Database,
  professorId: string,
  nome: string,
): Promise<string | undefined> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof periodoLetivoDaTurma>>>(
      'turmas.periodoLetivoDaTurma',
      [professorId, nome],
    );
  const row = (await db
    .prepare(
      'SELECT periodo_letivo FROM turmas WHERE professor_id = ? AND nome = ?',
    )
    .get(professorId, nome)) as unknown as
    | { periodo_letivo: string | null }
    | undefined;

  return row?.periodo_letivo ?? undefined;
}

/** Os estudantes da turma, na ordem em que o portal os lista. */
export async function listEstudantes(
  db: Database,
  turmaId: string,
): Promise<EstudanteDaTurma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listEstudantes>>>(
      'turmas.listEstudantes',
      [turmaId],
    );
  const rows = (await db
    .prepare(
      `SELECT matricula, nome, situacao, data_matricula FROM turma_estudantes
        WHERE turma_id = ? ORDER BY ordem ASC`,
    )
    .all(turmaId)) as unknown as {
    matricula: string;
    nome: string;
    situacao: string | null;
    data_matricula: string | null;
  }[];

  return rows.map((row) => ({
    matricula: row.matricula,
    nome: limparNomeDoEstudante(row.nome),
    situacao: row.situacao,
    dataMatricula: row.data_matricula,
  }));
}

/**
 * Substitui os estudantes da turma pelo que a busca no portal trouxe. Uma
 * busca é sempre a verdade inteira sobre a turma, então não há merge: quem
 * saiu do portal sai daqui.
 *
 * @throws {TurmaNotFoundError} quando `turmaId` não é de nenhuma turma.
 */
export async function replaceEstudantes(
  db: Database,
  turmaId: string,
  estudantes: readonly EstudanteDaTurma[],
): Promise<EstudanteDaTurma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof replaceEstudantes>>>(
      'turmas.replaceEstudantes',
      [turmaId, estudantes],
    );
  await getTurma(db, turmaId);

  const insert = db.prepare(
    `INSERT INTO turma_estudantes (turma_id, matricula, nome, situacao, data_matricula, ordem)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  await transaction(db, async () => {
    await db
      .prepare('DELETE FROM turma_estudantes WHERE turma_id = ?')
      .run(turmaId);
    for (const [ordem, estudante] of estudantes.entries()) {
      await insert.run(
        turmaId,
        estudante.matricula,
        estudante.nome,
        estudante.situacao ?? null,
        estudante.dataMatricula ?? null,
        ordem,
      );
    }
  });

  return await listEstudantes(db, turmaId);
}
import { limparNomeDoEstudante } from '../scrape/nome-do-estudante';

export async function updateTurma(
  db: Database,
  id: string,
  input: { nome: string; turno: string | null; periodoLetivo: string | null },
): Promise<Turma> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof updateTurma>>>(
      'turmas.updateTurma',
      [id, input],
    );
  await getTurma(db, id);
  await db
    .prepare(
      'UPDATE turmas SET nome = ?, turno = ?, periodo_letivo = ? WHERE id = ?',
    )
    .run(input.nome, input.turno, input.periodoLetivo, id);
  return await getTurma(db, id);
}

export async function updateEstudante(
  db: Database,
  turmaId: string,
  matricula: string,
  input: EstudanteDaTurma,
): Promise<EstudanteDaTurma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof updateEstudante>>>(
      'turmas.updateEstudante',
      [turmaId, matricula, input],
    );
  await getTurma(db, turmaId);
  const result = await db
    .prepare(
      'UPDATE turma_estudantes SET matricula = ?, nome = ?, situacao = ?, data_matricula = ? WHERE turma_id = ? AND matricula = ?',
    )
    .run(
      input.matricula,
      input.nome,
      input.situacao,
      input.dataMatricula,
      turmaId,
      matricula,
    );
  if (!result.changes) throw new Error('Estudante não encontrado.');
  return await listEstudantes(db, turmaId);
}
