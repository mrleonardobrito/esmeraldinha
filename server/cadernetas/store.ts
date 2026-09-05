import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { AulaDoPortal } from '../scrape/types';
import { turnoDaTurma } from '../turmas/turno';

/** As cinco partes da caderneta, como definidas no CONTEXT.md. */
export const PARTES = [
  'conteudo',
  'frequencia',
  'ficha-desempenho',
  'ficha-descritiva',
  'boletim',
] as const;

export type ParteDaCaderneta = (typeof PARTES)[number];

/**
 * O quanto de uma parte já está no portal. `processando` nunca é persistido:
 * um envio em voo é estado de tela, não fato da caderneta.
 */
export type StatusDaParte = 'pendente' | 'parcial' | 'concluido';

/** Como anda a raspagem do portal para esta caderneta. */
export type SyncStatus = 'pendente' | 'sincronizando' | 'sincronizada' | 'falhou';

/** Um estudante da turma, como o portal o lista. */
export interface EstudanteDaCaderneta {
  matricula: string;
  nome: string;
  situacao: string | null;
}

/** Uma aula da caderneta, com o que o portal disse sobre ela. */
export interface AulaDaCaderneta {
  etapa: string;
  mes: string;
  data: string;
  /** `null` quando o portal não informa a ordem da aula. */
  ordem: number | null;
  conteudoPreenchido: boolean;
  /** O conteúdo lançado no portal; `null` quando o campo está vazio lá. */
  codigoCR: string | null;
  desenvolvimento: string | null;
  ferramentas: string | null;
}

/** Uma etapa da caderneta e o progresso do conteúdo dentro dela. */
export interface EtapaDaCaderneta {
  nome: string;
  meses: string[];
  totalDeAulas: number;
  aulasPreenchidas: number;
  conteudo: StatusDaParte;
}

export interface Caderneta {
  id: string;
  professorId: string;
  turma: string;
  turno: string | null;
  etapas: EtapaDaCaderneta[];
  totalDeEstudantes: number;
  createdAt: string;
  /** Nulo enquanto a primeira raspagem não terminou. */
  syncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
}

/** O que uma raspagem do portal traz para uma etapa da turma. */
export interface EtapaRaspada {
  nome: string;
  meses: string[];
  /** As aulas datadas da etapa, com o mês em que o portal as lista. */
  aulas: (AulaDoPortal & { mes: string })[];
}

export class CadernetaNotFoundError extends Error {
  constructor(id: string) {
    super(`Nenhuma caderneta encontrada com o id ${id}.`);
    this.name = 'CadernetaNotFoundError';
  }
}

export class TurmaJaCadastradaError extends Error {
  constructor(turma: string) {
    super(`Já existe uma caderneta cadastrada para a turma ${turma}.`);
    this.name = 'TurmaJaCadastradaError';
  }
}

/** O portal não numera toda aula; no banco a ausência vira -1. */
const SEM_ORDEM = -1;

interface CadernetaRow {
  id: string;
  professor_id: string;
  turma: string;
  turno: string | null;
  created_at: string;
  synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
}

interface EtapaRow {
  nome: string;
  meses: string;
  total: number;
  preenchidas: number;
}

interface AulaRow {
  etapa: string;
  mes: string;
  data: string;
  ordem: number;
  conteudo_preenchido: number;
  codigo_cr: string | null;
  desenvolvimento: string | null;
  ferramentas: string | null;
}

function statusDoConteudo(total: number, preenchidas: number): StatusDaParte {
  if (total === 0 || preenchidas === 0) return 'pendente';
  return preenchidas >= total ? 'concluido' : 'parcial';
}

function readEtapas(db: DatabaseSync, cadernetaId: string): EtapaDaCaderneta[] {
  const rows = db
    .prepare(
      `SELECT e.nome,
              e.meses,
              COUNT(a.data) AS total,
              COALESCE(SUM(a.conteudo_preenchido), 0) AS preenchidas
         FROM caderneta_etapas e
         LEFT JOIN caderneta_aulas a
           ON a.caderneta_id = e.caderneta_id AND a.etapa = e.nome
        WHERE e.caderneta_id = ?
        GROUP BY e.nome, e.meses, e.posicao
        ORDER BY e.posicao ASC`,
    )
    .all(cadernetaId) as unknown as EtapaRow[];

  return rows.map((row) => ({
    nome: row.nome,
    meses: JSON.parse(row.meses) as string[],
    totalDeAulas: Number(row.total),
    aulasPreenchidas: Number(row.preenchidas),
    conteudo: statusDoConteudo(Number(row.total), Number(row.preenchidas)),
  }));
}

function toCaderneta(db: DatabaseSync, row: CadernetaRow): Caderneta {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM caderneta_estudantes WHERE caderneta_id = ?')
    .get(row.id) as unknown as { total: number };

  return {
    id: row.id,
    professorId: row.professor_id,
    turma: row.turma,
    turno: row.turno,
    etapas: readEtapas(db, row.id),
    totalDeEstudantes: Number(total),
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
  };
}

/**
 * Grava as etapas e as aulas raspadas do portal, substituindo o que houver.
 * Uma raspagem é sempre a verdade inteira sobre a turma: uma aula que sumiu do
 * portal precisa sumir daqui também, então não há merge.
 */
function replaceEtapas(
  db: DatabaseSync,
  cadernetaId: string,
  etapas: readonly EtapaRaspada[],
): void {
  const insertEtapa = db.prepare(
    'INSERT INTO caderneta_etapas (caderneta_id, nome, posicao, meses) VALUES (?, ?, ?, ?)',
  );
  const insertAula = db.prepare(
    `INSERT INTO caderneta_aulas
       (caderneta_id, etapa, mes, data, ordem, conteudo_preenchido,
        codigo_cr, desenvolvimento, ferramentas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.prepare('DELETE FROM caderneta_etapas WHERE caderneta_id = ?').run(cadernetaId);
  db.prepare('DELETE FROM caderneta_aulas WHERE caderneta_id = ?').run(cadernetaId);

  etapas.forEach((etapa, posicao) => {
    insertEtapa.run(cadernetaId, etapa.nome, posicao, JSON.stringify(etapa.meses));

    for (const aula of etapa.aulas) {
      insertAula.run(
        cadernetaId,
        etapa.nome,
        aula.mes,
        aula.data,
        aula.ordem ?? SEM_ORDEM,
        aula.preenchida ? 1 : 0,
        aula.codigoCR ?? null,
        aula.desenvolvimento ?? null,
        aula.ferramentas ?? null,
      );
    }
  });
}

export interface CadernetaInput {
  professorId: string;
  turma: string;
}

/**
 * Cadastra uma caderneta vazia, pronta para ser preenchida pela raspagem. O
 * turno não é pedido a ninguém: o portal já o escreve no nome da turma.
 * Ela nasce `pendente` de propósito: ler o portal leva minutos, e o auxiliar
 * de ensino não deve ficar olhando para uma tela travada por causa disso.
 *
 * @throws {TurmaJaCadastradaError} quando o professor já tem caderneta
 * daquela turma.
 */
export function createCaderneta(db: DatabaseSync, input: CadernetaInput): Caderneta {
  const existing = db
    .prepare('SELECT id FROM cadernetas WHERE professor_id = ? AND turma = ?')
    .get(input.professorId, input.turma);

  if (existing) {
    throw new TurmaJaCadastradaError(input.turma);
  }

  const id = randomUUID();

  db.prepare(
    `INSERT INTO cadernetas (id, professor_id, turma, turno, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pendente')`,
  ).run(
    id,
    input.professorId,
    input.turma,
    turnoDaTurma(input.turma),
    new Date().toISOString(),
  );

  return getCaderneta(db, id);
}

/** As cadernetas de um professor, na ordem em que foram cadastradas. */
export function listCadernetas(db: DatabaseSync, professorId: string): Caderneta[] {
  const rows = db
    .prepare(
      `SELECT id, professor_id, turma, turno, created_at, synced_at, sync_status, sync_error
         FROM cadernetas WHERE professor_id = ? ORDER BY created_at ASC`,
    )
    .all(professorId) as unknown as CadernetaRow[];

  return rows.map((row) => toCaderneta(db, row));
}

/** @throws {CadernetaNotFoundError} quando `id` não é de nenhuma caderneta. */
export function getCaderneta(db: DatabaseSync, id: string): Caderneta {
  const row = db
    .prepare(
      `SELECT id, professor_id, turma, turno, created_at, synced_at, sync_status, sync_error
         FROM cadernetas WHERE id = ?`,
    )
    .get(id) as unknown as CadernetaRow | undefined;

  if (!row) throw new CadernetaNotFoundError(id);

  return toCaderneta(db, row);
}

/** As aulas de uma etapa, na ordem em que o portal as lista. */
export function listAulasDaEtapa(
  db: DatabaseSync,
  cadernetaId: string,
  etapa: string,
): AulaDaCaderneta[] {
  const rows = db
    .prepare(
      `SELECT etapa, mes, data, ordem, conteudo_preenchido,
              codigo_cr, desenvolvimento, ferramentas
         FROM caderneta_aulas
        WHERE caderneta_id = ? AND etapa = ?
        ORDER BY substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2), ordem`,
    )
    .all(cadernetaId, etapa) as unknown as AulaRow[];

  return rows.map((row) => ({
    etapa: row.etapa,
    mes: row.mes,
    data: row.data,
    ordem: row.ordem === SEM_ORDEM ? null : row.ordem,
    conteudoPreenchido: row.conteudo_preenchido === 1,
    codigoCR: row.codigo_cr,
    desenvolvimento: row.desenvolvimento,
    ferramentas: row.ferramentas,
  }));
}

/** O resultado inteiro de uma raspagem: o que o portal sabe sobre a turma. */
export interface RaspagemDaTurma {
  etapas: readonly EtapaRaspada[];
  estudantes: readonly EstudanteDaCaderneta[];
}

function replaceEstudantes(
  db: DatabaseSync,
  cadernetaId: string,
  estudantes: readonly EstudanteDaCaderneta[],
): void {
  const insert = db.prepare(
    `INSERT INTO caderneta_estudantes (caderneta_id, matricula, nome, situacao, ordem)
     VALUES (?, ?, ?, ?, ?)`,
  );

  db.prepare('DELETE FROM caderneta_estudantes WHERE caderneta_id = ?').run(cadernetaId);

  estudantes.forEach((estudante, ordem) => {
    insert.run(
      cadernetaId,
      estudante.matricula,
      estudante.nome,
      estudante.situacao ?? null,
      ordem,
    );
  });
}

/** Marca que a raspagem começou, para a tela poder mostrar o progresso. */
export function marcarSincronizando(db: DatabaseSync, id: string): void {
  db.prepare(
    "UPDATE cadernetas SET sync_status = 'sincronizando', sync_error = NULL WHERE id = ?",
  ).run(id);
}

/** Registra a falha sem apagar o que a caderneta já tinha. */
export function marcarFalhaNaSincronizacao(
  db: DatabaseSync,
  id: string,
  motivo: string,
): void {
  db.prepare(
    "UPDATE cadernetas SET sync_status = 'falhou', sync_error = ? WHERE id = ?",
  ).run(motivo, id);
}

/** Os estudantes da turma, na ordem em que o portal os lista. */
export function listEstudantes(
  db: DatabaseSync,
  cadernetaId: string,
): EstudanteDaCaderneta[] {
  const rows = db
    .prepare(
      `SELECT matricula, nome, situacao FROM caderneta_estudantes
        WHERE caderneta_id = ? ORDER BY ordem ASC`,
    )
    .all(cadernetaId) as unknown as {
    matricula: string;
    nome: string;
    situacao: string | null;
  }[];

  return rows;
}

/**
 * Substitui etapas, aulas e estudantes pelo que a raspagem trouxe e carimba a
 * sincronização. Uma raspagem é sempre a verdade inteira sobre a turma, então
 * não há merge: quem sumiu do portal some daqui.
 *
 * @throws {CadernetaNotFoundError} quando `id` não é de nenhuma caderneta.
 */
export function syncCaderneta(
  db: DatabaseSync,
  id: string,
  raspagem: RaspagemDaTurma,
): Caderneta {
  getCaderneta(db, id);

  db.exec('BEGIN');
  try {
    replaceEtapas(db, id, raspagem.etapas);
    replaceEstudantes(db, id, raspagem.estudantes);
    db.prepare(
      "UPDATE cadernetas SET synced_at = ?, sync_status = 'sincronizada', sync_error = NULL WHERE id = ?",
    ).run(new Date().toISOString(), id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getCaderneta(db, id);
}

/** Uma aula que um envio acabou de gravar no portal. */
export interface AulaGravada {
  etapa: string;
  data: string;
  ordem?: number | null;
}

/**
 * Marca como preenchidas as aulas que um envio gravou, para a grade refletir
 * o envio sem esperar uma sincronização. Uma aula que o envio menciona mas que
 * a caderneta não tem é ignorada: quem manda sobre quais aulas existem é a
 * raspagem, não o envio.
 *
 * Quando a aula gravada não traz ordem, todas as aulas daquela data são
 * marcadas — é o mesmo casamento por data que `postAulaContent` faz.
 */
export function marcarConteudoPreenchido(
  db: DatabaseSync,
  cadernetaId: string,
  aulas: readonly AulaGravada[],
): number {
  const comOrdem = db.prepare(
    `UPDATE caderneta_aulas SET conteudo_preenchido = 1
      WHERE caderneta_id = ? AND etapa = ? AND data = ? AND ordem = ?`,
  );
  const semOrdem = db.prepare(
    `UPDATE caderneta_aulas SET conteudo_preenchido = 1
      WHERE caderneta_id = ? AND etapa = ? AND data = ?`,
  );

  let changed = 0;

  db.exec('BEGIN');
  try {
    for (const aula of aulas) {
      const result =
        aula.ordem === undefined || aula.ordem === null
          ? semOrdem.run(cadernetaId, aula.etapa, aula.data)
          : comOrdem.run(cadernetaId, aula.etapa, aula.data, aula.ordem);

      changed += Number(result.changes);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return changed;
}

/** @throws {CadernetaNotFoundError} quando `id` não é de nenhuma caderneta. */
export function deleteCaderneta(db: DatabaseSync, id: string): void {
  const result = db.prepare('DELETE FROM cadernetas WHERE id = ?').run(id);

  if (Number(result.changes) === 0) {
    throw new CadernetaNotFoundError(id);
  }

  db.prepare('DELETE FROM caderneta_etapas WHERE caderneta_id = ?').run(id);
  db.prepare('DELETE FROM caderneta_aulas WHERE caderneta_id = ?').run(id);
}
