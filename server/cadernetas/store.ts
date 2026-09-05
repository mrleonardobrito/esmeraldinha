import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  AulaDoPortal,
  AvaliacaoDoPortal,
  NotaDoEstudante,
  NotaDoPortal,
} from '../scrape/types';
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
  /** Como o portal a escreve, em DD/MM/AAAA; nula quando ele a omite. */
  dataMatricula: string | null;
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

/** Uma avaliação da etapa: uma coluna do boletim. */
export interface AvaliacaoDaCaderneta {
  nome: string;
  tipo: string | null;
  data: string | null;
  /** O valor máximo da avaliação; `null` quando o portal não o informa. */
  valor: number | null;
  /** A média que o portal exibe junto do valor. */
  media: number | null;
}

/**
 * As notas da linha do estudante que não são de nenhuma avaliação. O portal
 * calcula `calculada` e `parcial` — elas chegam desabilitadas e só são
 * exibidas; `personalizada` e `final` é que se preenche.
 */
export interface NotaDoEstudanteDaCaderneta {
  matricula: string;
  personalizada: number | null;
  final: number | null;
  calculada: number | null;
  parcial: number | null;
}

/** Uma nota lançada no portal, chaveada como o portal a chaveia. */
export interface NotaDaCaderneta {
  matricula: string;
  avaliacao: string;
  valor: number;
}

/** O boletim de uma etapa numa disciplina: quem, em quê, com quanto. */
export interface BoletimDaEtapa {
  etapa: string;
  /** A disciplina deste boletim; `null` quando a caderneta não tem nenhuma. */
  disciplina: string | null;
  /** Todas as disciplinas da caderneta, para a tela poder trocar. */
  disciplinas: string[];
  estudantes: EstudanteDaCaderneta[];
  avaliacoes: AvaliacaoDaCaderneta[];
  notas: NotaDaCaderneta[];
  notasDoEstudante: NotaDoEstudanteDaCaderneta[];
}

/** Uma etapa da caderneta e o progresso das partes dentro dela. */
export interface EtapaDaCaderneta {
  nome: string;
  meses: string[];
  totalDeAulas: number;
  aulasPreenchidas: number;
  conteudo: StatusDaParte;
  /** Quantas notas a etapa comporta: estudantes × avaliações. */
  totalDeNotas: number;
  notasLancadas: number;
  boletim: StatusDaParte;
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
/** O boletim de uma disciplina dentro de uma etapa, como a raspagem o traz. */
export interface BoletimRaspado {
  disciplina: string;
  avaliacoes: readonly AvaliacaoDoPortal[];
  notas: readonly NotaDoPortal[];
  notasDoEstudante: readonly NotaDoEstudante[];
}

export interface EtapaRaspada {
  nome: string;
  meses: string[];
  /** As aulas datadas da etapa, com o mês em que o portal as lista. */
  aulas: (AulaDoPortal & { mes: string })[];
  /**
   * Um boletim por disciplina da turma. Vazio quando a etapa não tem avaliação
   * cadastrada — aí o portal não oferece nem disciplina nem tabela.
   */
  boletins?: readonly BoletimRaspado[];
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

/**
 * O progresso de cada etapa. As aulas e as notas são contadas em consultas
 * separadas de propósito: um único JOIN entre as duas multiplicaria uma pela
 * outra, e a etapa apareceria com dez vezes mais aulas do que tem.
 */
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

  const { estudantes } = db
    .prepare(
      'SELECT COUNT(*) AS estudantes FROM caderneta_estudantes WHERE caderneta_id = ?',
    )
    .get(cadernetaId) as unknown as { estudantes: number };

  const avaliacoesPorEtapa = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT etapa, COUNT(*) AS total FROM caderneta_avaliacoes
        WHERE caderneta_id = ? GROUP BY etapa`,
    )
    .all(cadernetaId) as unknown as { etapa: string; total: number }[]) {
    // Soma as avaliações de todas as disciplinas: o progresso da etapa é o do
    // boletim inteiro, não o de uma disciplina só.
    avaliacoesPorEtapa.set(row.etapa, Number(row.total));
  }

  const notasPorEtapa = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT etapa, COUNT(*) AS total FROM caderneta_notas
        WHERE caderneta_id = ? GROUP BY etapa`,
    )
    .all(cadernetaId) as unknown as { etapa: string; total: number }[]) {
    notasPorEtapa.set(row.etapa, Number(row.total));
  }

  return rows.map((row) => {
    // O boletim está completo quando todo estudante tem nota em toda
    // avaliação: são as células da grade que o portal mostra.
    const totalDeNotas = Number(estudantes) * (avaliacoesPorEtapa.get(row.nome) ?? 0);
    const notasLancadas = notasPorEtapa.get(row.nome) ?? 0;

    return {
      nome: row.nome,
      meses: JSON.parse(row.meses) as string[],
      totalDeAulas: Number(row.total),
      aulasPreenchidas: Number(row.preenchidas),
      conteudo: statusDoConteudo(Number(row.total), Number(row.preenchidas)),
      totalDeNotas,
      notasLancadas,
      boletim: statusDoConteudo(totalDeNotas, notasLancadas),
    };
  });
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

  const insertAvaliacao = db.prepare(
    `INSERT INTO caderneta_avaliacoes
       (caderneta_id, etapa, disciplina, nome, tipo, data, valor, media, posicao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertNota = db.prepare(
    `INSERT INTO caderneta_notas
       (caderneta_id, etapa, disciplina, matricula, avaliacao, valor)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertNotaDoEstudante = db.prepare(
    `INSERT INTO caderneta_notas_do_estudante
       (caderneta_id, etapa, disciplina, matricula, personalizada, final, calculada, parcial)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDisciplina = db.prepare(
    'INSERT OR IGNORE INTO caderneta_disciplinas (caderneta_id, nome, posicao) VALUES (?, ?, ?)',
  );

  db.prepare('DELETE FROM caderneta_etapas WHERE caderneta_id = ?').run(cadernetaId);
  db.prepare('DELETE FROM caderneta_aulas WHERE caderneta_id = ?').run(cadernetaId);
  db.prepare('DELETE FROM caderneta_avaliacoes WHERE caderneta_id = ?').run(cadernetaId);
  db.prepare('DELETE FROM caderneta_notas WHERE caderneta_id = ?').run(cadernetaId);
  db.prepare('DELETE FROM caderneta_notas_do_estudante WHERE caderneta_id = ?').run(
    cadernetaId,
  );
  db.prepare('DELETE FROM caderneta_disciplinas WHERE caderneta_id = ?').run(cadernetaId);

  // As disciplinas são da turma, mas o portal as oferece por etapa: a união do
  // que apareceu em cada uma é o conjunto da caderneta.
  const disciplinas: string[] = [];

  etapas.forEach((etapa, posicao) => {
    insertEtapa.run(cadernetaId, etapa.nome, posicao, JSON.stringify(etapa.meses));

    for (const boletim of etapa.boletins ?? []) {
      if (!disciplinas.includes(boletim.disciplina)) {
        insertDisciplina.run(cadernetaId, boletim.disciplina, disciplinas.length);
        disciplinas.push(boletim.disciplina);
      }

      boletim.avaliacoes.forEach((avaliacao, ordem) => {
        insertAvaliacao.run(
          cadernetaId,
          etapa.nome,
          boletim.disciplina,
          avaliacao.nome,
          avaliacao.tipo ?? null,
          avaliacao.data ?? null,
          avaliacao.valor ?? null,
          avaliacao.media ?? null,
          ordem,
        );
      });

      for (const nota of boletim.notas) {
        insertNota.run(
          cadernetaId,
          etapa.nome,
          boletim.disciplina,
          nota.matricula,
          nota.avaliacao,
          nota.valor,
        );
      }

      for (const nota of boletim.notasDoEstudante) {
        // Uma linha só com calculadas não diz nada que o portal não recalcule;
        // guardar as quatro mesmo assim mantém a leitura fiel à tela.
        insertNotaDoEstudante.run(
          cadernetaId,
          etapa.nome,
          boletim.disciplina,
          nota.matricula,
          nota.personalizada ?? null,
          nota.final ?? null,
          nota.calculada ?? null,
          nota.parcial ?? null,
        );
      }
    }

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
    `INSERT INTO caderneta_estudantes (caderneta_id, matricula, nome, situacao, data_matricula, ordem)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.prepare('DELETE FROM caderneta_estudantes WHERE caderneta_id = ?').run(cadernetaId);

  estudantes.forEach((estudante, ordem) => {
    insert.run(
      cadernetaId,
      estudante.matricula,
      estudante.nome,
      estudante.situacao ?? null,
      estudante.dataMatricula ?? null,
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
      `SELECT matricula, nome, situacao, data_matricula FROM caderneta_estudantes
        WHERE caderneta_id = ? ORDER BY ordem ASC`,
    )
    .all(cadernetaId) as unknown as {
    matricula: string;
    nome: string;
    situacao: string | null;
    data_matricula: string | null;
  }[];

  return rows.map((row) => ({
    matricula: row.matricula,
    nome: row.nome,
    situacao: row.situacao,
    dataMatricula: row.data_matricula,
  }));
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
  db.prepare('DELETE FROM caderneta_avaliacoes WHERE caderneta_id = ?').run(id);
  db.prepare('DELETE FROM caderneta_notas WHERE caderneta_id = ?').run(id);
  db.prepare('DELETE FROM caderneta_notas_do_estudante WHERE caderneta_id = ?').run(id);
  db.prepare('DELETE FROM caderneta_disciplinas WHERE caderneta_id = ?').run(id);
}

/** As disciplinas da caderneta, na ordem em que o portal as lista. */
export function listDisciplinasDaCaderneta(
  db: DatabaseSync,
  cadernetaId: string,
): string[] {
  const rows = db
    .prepare(
      `SELECT nome FROM caderneta_disciplinas
        WHERE caderneta_id = ? ORDER BY posicao ASC`,
    )
    .all(cadernetaId) as unknown as { nome: string }[];

  return rows.map((row) => row.nome);
}

/**
 * O boletim de uma etapa numa disciplina: os estudantes, as colunas, as notas
 * já lançadas e as notas por estudante que não são de nenhuma avaliação.
 *
 * Sem `disciplina`, usa a primeira da caderneta — é o caso comum de quem tem
 * uma só e não quer escolher nada.
 */
export function getBoletimDaEtapa(
  db: DatabaseSync,
  cadernetaId: string,
  etapa: string,
  disciplina?: string,
): BoletimDaEtapa {
  const disciplinas = listDisciplinasDaCaderneta(db, cadernetaId);
  const escolhida = disciplina ?? disciplinas[0];

  // Sem nenhuma disciplina não há avaliação cadastrada, e o boletim é vazio:
  // é o que faz a tela pedir o cadastro em vez de mostrar uma grade sem colunas.
  if (escolhida === undefined) {
    return {
      etapa,
      disciplina: null,
      disciplinas,
      estudantes: listEstudantes(db, cadernetaId),
      avaliacoes: [],
      notas: [],
      notasDoEstudante: [],
    };
  }

  const avaliacoes = db
    .prepare(
      `SELECT nome, tipo, data, valor, media FROM caderneta_avaliacoes
        WHERE caderneta_id = ? AND etapa = ? AND disciplina = ?
        ORDER BY posicao ASC`,
    )
    .all(cadernetaId, etapa, escolhida) as unknown as {
    nome: string;
    tipo: string | null;
    data: string | null;
    valor: number | null;
    media: number | null;
  }[];

  const notas = db
    .prepare(
      `SELECT matricula, avaliacao, valor FROM caderneta_notas
        WHERE caderneta_id = ? AND etapa = ? AND disciplina = ?`,
    )
    .all(cadernetaId, etapa, escolhida) as unknown as NotaDaCaderneta[];

  const notasDoEstudante = db
    .prepare(
      `SELECT matricula, personalizada, final, calculada, parcial
         FROM caderneta_notas_do_estudante
        WHERE caderneta_id = ? AND etapa = ? AND disciplina = ?`,
    )
    .all(cadernetaId, etapa, escolhida) as unknown as {
    matricula: string;
    personalizada: number | null;
    final: number | null;
    calculada: number | null;
    parcial: number | null;
  }[];

  const numero = (valor: number | null) => (valor === null ? null : Number(valor));

  return {
    etapa,
    disciplina: escolhida,
    disciplinas,
    estudantes: listEstudantes(db, cadernetaId),
    avaliacoes: avaliacoes.map((avaliacao) => ({
      nome: avaliacao.nome,
      tipo: avaliacao.tipo,
      data: avaliacao.data,
      valor: numero(avaliacao.valor),
      media: numero(avaliacao.media),
    })),
    notas: notas.map((nota) => ({
      matricula: nota.matricula,
      avaliacao: nota.avaliacao,
      valor: Number(nota.valor),
    })),
    notasDoEstudante: notasDoEstudante.map((nota) => ({
      matricula: nota.matricula,
      personalizada: numero(nota.personalizada),
      final: numero(nota.final),
      calculada: numero(nota.calculada),
      parcial: numero(nota.parcial),
    })),
  };
}

/** Uma nota que um envio acabou de gravar no portal. */
export interface NotaGravada {
  etapa: string;
  disciplina: string;
  matricula: string;
  avaliacao: string;
  valor: number;
}

/** Uma nota da linha do estudante que acabou de ser gravada. */
export interface NotaDoEstudanteGravada {
  etapa: string;
  disciplina: string;
  matricula: string;
  personalizada?: number | null;
  final?: number | null;
}

/**
 * Grava as notas que um envio lançou, para a grade refletir o envio sem
 * esperar uma sincronização. Uma nota de uma avaliação que a caderneta não
 * conhece é ignorada: quem manda sobre quais avaliações existem é a raspagem,
 * como acontece com as aulas.
 */
export function marcarNotasLancadas(
  db: DatabaseSync,
  cadernetaId: string,
  notas: readonly NotaGravada[],
  notasDoEstudante: readonly NotaDoEstudanteGravada[] = [],
): number {
  const conhece = db.prepare(
    `SELECT 1 FROM caderneta_avaliacoes
      WHERE caderneta_id = ? AND etapa = ? AND disciplina = ? AND nome = ?`,
  );
  const upsert = db.prepare(
    `INSERT INTO caderneta_notas
       (caderneta_id, etapa, disciplina, matricula, avaliacao, valor)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (caderneta_id, etapa, disciplina, matricula, avaliacao)
     DO UPDATE SET valor = excluded.valor`,
  );
  // As calculadas ficam de fora: quem as preenche é o portal, e sobrescrevê-las
  // com o que a tela achava é apagar o cálculo dele.
  const upsertDoEstudante = db.prepare(
    `INSERT INTO caderneta_notas_do_estudante
       (caderneta_id, etapa, disciplina, matricula, personalizada, final)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (caderneta_id, etapa, disciplina, matricula)
     DO UPDATE SET
       personalizada = COALESCE(excluded.personalizada, personalizada),
       final = COALESCE(excluded.final, final)`,
  );

  let gravadas = 0;

  db.exec('BEGIN');
  try {
    for (const nota of notas) {
      if (!conhece.get(cadernetaId, nota.etapa, nota.disciplina, nota.avaliacao)) continue;

      upsert.run(
        cadernetaId,
        nota.etapa,
        nota.disciplina,
        nota.matricula,
        nota.avaliacao,
        nota.valor,
      );
      gravadas += 1;
    }

    for (const nota of notasDoEstudante) {
      upsertDoEstudante.run(
        cadernetaId,
        nota.etapa,
        nota.disciplina,
        nota.matricula,
        nota.personalizada ?? null,
        nota.final ?? null,
      );
      gravadas += 1;
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return gravadas;
}
