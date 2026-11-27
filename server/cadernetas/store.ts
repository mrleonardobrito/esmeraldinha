import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AulaDoPortal, AvaliacaoDoPortal, NotaDoEstudante, NotaDoPortal } from '../scrape/types';
import { turnoDaTurma } from '../turmas/turno';
import { isReducao } from '../../shared/turma';
import { limparNomeDoEstudante } from '../scrape/nome-do-estudante';

/** As cinco partes da caderneta, como definidas no CONTEXT.md. */
export const PARTES = ['conteudo', 'frequencia', 'ficha-desempenho', 'ficha-descritiva', 'boletim'] as const;
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
 * As notas da linha do estudante que não são de nenhuma avaliação, com os
 * nomes que o portal lhes dá. `origem` e `calculada` chegam desabilitadas e só
 * são exibidas; `parcial` e `personalizada` é que se preenche.
 */
export interface NotaDoEstudanteDaCaderneta {
  matricula: string;
  origem: number | null;
  calculada: number | null;
  parcial: number | null;
  personalizada: number | null;
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
  /** As de `disciplinas` que já têm alguma nota lançada nesta etapa. */
  disciplinasLancadas: string[];
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
  turmas: string[];
  turno: string | null;
  etapas: EtapaDaCaderneta[];
  totalDeEstudantes: number;
  createdAt: string;
  /** Nulo enquanto a primeira raspagem não terminou. */
  syncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  valorRecebido: number | null;
  valorAReceber: number | null;
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
  aulas: (AulaDoPortal & {
    mes: string;
  })[];
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

/** Invalid membership or composition of a caderneta. */
export class CadernetaInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CadernetaInvalidaError';
  }
}
const SEM_ORDEM = -1;
const TABLES = ['caderneta_etapas', 'caderneta_aulas', 'caderneta_estudantes', 'caderneta_avaliacoes', 'caderneta_notas', 'caderneta_notas_do_estudante', 'caderneta_disciplinas'] as const;
interface CadernetaRow {
  id: string;
  professor_id: string;
  turma: string;
  turno: string | null;
  created_at: string;
  synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  valor_recebido: number | null;
  valor_a_receber: number | null;
}

function transaction<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function turmasDaCaderneta(db: DatabaseSync, id: string): string[] {
  const rows = db.prepare(
    'SELECT turma FROM caderneta_turmas WHERE caderneta_id = ? ORDER BY posicao',
  )
    .all(id) as unknown as {
      turma: string;
    }[];
  if (rows.length) return rows.map(row => row.turma);
  const row = db.prepare('SELECT turma FROM cadernetas WHERE id = ?').get(id) as unknown as {
    turma: string;
  } | undefined;
  return row ? [row.turma] : [];
}

function selectedTurma(
  db: DatabaseSync,
  id: string,
  turma?: string,
): string {
  const turmas = turmasDaCaderneta(db, id);
  if (turma !== undefined && !turmas.includes(turma)) {
    throw new CadernetaInvalidaError('The turma does not belong to this caderneta.');
  }
  return turma ?? turmas[0] ?? '';
}

function statusDoConteudo(total: number, preenchidas: number): StatusDaParte {
  if (total === 0 || preenchidas === 0) return 'pendente';
  return preenchidas >= total ? 'concluido' : 'parcial';
}

/** Compute each turma separately so estudantes and avaliações never cross-multiply. */
function readEtapas(
  db: DatabaseSync,
  id: string,
  turmas: readonly string[],
): EtapaDaCaderneta[] {
  const etapas = new Map<string, EtapaDaCaderneta>();
  const statuses = new Map<string, { conteudo: StatusDaParte[]; boletim: StatusDaParte[]; }>();
  for (const turma of turmas) {
    const rows = db.prepare(
      `SELECT e.nome, e.meses, COUNT(a.data) AS total,
       COALESCE(SUM(a.conteudo_preenchido), 0) AS preenchidas
       FROM caderneta_etapas e LEFT JOIN caderneta_aulas a
       ON a.caderneta_id = e.caderneta_id AND a.turma = e.turma AND a.etapa = e.nome
       WHERE e.caderneta_id = ? AND e.turma = ? GROUP BY e.nome, e.meses, e.posicao ORDER BY e.posicao`,
    )
      .all(id, turma) as unknown as {
        nome: string;
        meses: string;
        total: number;
        preenchidas: number;
      }[];
    const estudantes = db.prepare(
      `SELECT COUNT(*) AS total FROM caderneta_estudantes
       WHERE caderneta_id = ? AND turma = ?
       AND UPPER(TRIM(COALESCE(situacao, ''))) NOT IN ('TRANSFERIDO', 'TRANSFERIDA')`,
    )
      .get(id, turma) as unknown as {
        total: number;
      };
    const avaliacoes = new Map((db.prepare(
      `SELECT etapa, COUNT(*) AS total FROM caderneta_avaliacoes
       WHERE caderneta_id = ? AND turma = ? GROUP BY etapa`,
    )
      .all(id, turma) as unknown as {
        etapa: string;
        total: number;
      }[]).map(row => [row.etapa, Number(row.total)]));
    const notas = new Map((db.prepare(
      `SELECT n.etapa, COUNT(*) AS total FROM caderneta_notas n
       JOIN caderneta_estudantes e ON e.caderneta_id = n.caderneta_id AND e.turma = n.turma AND e.matricula = n.matricula
       WHERE n.caderneta_id = ? AND n.turma = ?
       AND UPPER(TRIM(COALESCE(e.situacao, ''))) NOT IN ('TRANSFERIDO', 'TRANSFERIDA') GROUP BY n.etapa`,
    )
      .all(id, turma) as unknown as {
        etapa: string;
        total: number;
      }[]).map(row => [row.etapa, Number(row.total)]));
    for (const row of rows) {
      const entry = etapas.get(row.nome) ?? {
        nome: row.nome,
        meses: [],
        totalDeAulas: 0,
        aulasPreenchidas: 0,
        conteudo: 'pendente',
        totalDeNotas: 0,
        notasLancadas: 0,
        boletim: 'pendente'
      };
      entry.meses = [...new Set([...entry.meses, ...(JSON.parse(row.meses) as string[])])];
      entry.totalDeAulas += Number(row.total);
      entry.aulasPreenchidas += Number(row.preenchidas);
      const totalDeNotas = Number(estudantes.total) * (avaliacoes.get(row.nome) ?? 0);
      const notasLancadas = notas.get(row.nome) ?? 0;
      entry.totalDeNotas += totalDeNotas;
      entry.notasLancadas += notasLancadas;
      const localStatuses = statuses.get(row.nome) ?? { conteudo: [], boletim: [] };
      localStatuses.conteudo.push(statusDoConteudo(Number(row.total), Number(row.preenchidas)));
      localStatuses.boletim.push(statusDoConteudo(totalDeNotas, notasLancadas));
      statuses.set(row.nome, localStatuses);
      etapas.set(row.nome, entry);
    }
  }
  const combine = (parts: readonly StatusDaParte[]): StatusDaParte => {
    if (parts.length === turmas.length && parts.every((part) => part === 'concluido')) {
      return 'concluido';
    }
    return parts.some((part) => part !== 'pendente') ? 'parcial' : 'pendente';
  };
  for (const etapa of etapas.values()) {
    const parts = statuses.get(etapa.nome)!;
    etapa.conteudo = combine(parts.conteudo);
    etapa.boletim = combine(parts.boletim);
  }
  return [...etapas.values()];
}

function toCaderneta(
  db: DatabaseSync,
  row: CadernetaRow,
  turma?: string,
): Caderneta {
  const turmas = turmasDaCaderneta(db, row.id);
  const selected = selectedTurma(db, row.id, turma);
  const scope = turma === undefined ? turmas : [selected];
  const count = db.prepare(
    'SELECT COUNT(*) AS total FROM caderneta_estudantes WHERE caderneta_id = ? AND turma = ?',
  );
  const turnos = new Set(scope.map(turnoDaTurma));
  return {
    id: row.id,
    professorId: row.professor_id,
    turma: selected,
    turmas,
    turno: turnos.size === 1 ? turnoDaTurma(scope[0] ?? row.turma) : null,
    etapas: readEtapas(db, row.id, scope),
    totalDeEstudantes: scope.reduce((sum, nome) => sum + Number((count.get(row.id, nome) as unknown as {
      total: number;
    }).total), 0),
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    valorRecebido: row.valor_recebido,
    valorAReceber: row.valor_a_receber
  };
}

export interface CadernetaInput {
  professorId: string;
  turma?: string;
  turmas?: readonly string[];
}

/** Create one caderneta, grouping turmas only when explicitly requested. */
export function createCaderneta(db: DatabaseSync, input: CadernetaInput): Caderneta {
  const turmas = input.turmas ? [...input.turmas] : input.turma ? [input.turma] : [];
  if (!turmas.length || turmas.length > 4 || new Set(turmas).size !== turmas.length || turmas.some(turma => !turma.trim())) {
    throw new CadernetaInvalidaError('A caderneta must contain one to four distinct turmas.');
  }
  if (turmas.length > 1) {
    const lookup = db.prepare('SELECT grupo_diario FROM turmas WHERE professor_id = ? AND nome = ?');
    for (const turma of turmas) {
      const row = lookup.get(input.professorId, turma) as unknown as {
        grupo_diario: string | null;
      } | undefined;
      if (!row || !isReducao(row.grupo_diario)) {
        throw new CadernetaInvalidaError('Only turmas de redução of the same professor may share a caderneta.');
      }
    }
  }
  const id = randomUUID();
  transaction(db, () => {
    for (const turma of turmas) {
      if (db.prepare(
        `SELECT 1 FROM caderneta_turmas WHERE professor_id = ? AND turma = ?
         UNION ALL SELECT 1 FROM cadernetas WHERE professor_id = ? AND turma = ?`,
      )
        .get(input.professorId, turma, input.professorId, turma)) {
        throw new TurmaJaCadastradaError(turma);
      }
    }
    db.prepare(
      `INSERT INTO cadernetas (id, professor_id, turma, turno, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'pendente')`,
    )
      .run(id, input.professorId, turmas[0], turnoDaTurma(turmas[0]), new Date().toISOString());
    const insert = db.prepare(
      'INSERT INTO caderneta_turmas (caderneta_id, professor_id, turma, posicao) VALUES (?, ?, ?, ?)',
    );
    turmas.forEach((turma, posicao) => insert.run(id, input.professorId, turma, posicao));
  });
  return getCaderneta(db, id);
}

export function listCadernetas(db: DatabaseSync, professorId: string): Caderneta[] {
  return (db.prepare('SELECT * FROM cadernetas WHERE professor_id = ? ORDER BY created_at').all(professorId) as unknown as CadernetaRow[]).map(row => toCaderneta(db, row));
}

export function getCaderneta(
  db: DatabaseSync,
  id: string,
  turma?: string,
): Caderneta {
  const row = db.prepare('SELECT * FROM cadernetas WHERE id = ?').get(id) as unknown as CadernetaRow | undefined;
  if (!row) throw new CadernetaNotFoundError(id);
  return toCaderneta(db, row, turma);
}

export function listAulasDaEtapa(
  db: DatabaseSync,
  id: string,
  etapa: string,
  turma?: string,
): AulaDaCaderneta[] {
  const rows = db.prepare(
    `SELECT etapa, mes, data, ordem, conteudo_preenchido, codigo_cr, desenvolvimento, ferramentas
     FROM caderneta_aulas WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     ORDER BY substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2), ordem`,
  )
    .all(id, selectedTurma(db, id, turma), etapa) as unknown as {
      etapa: string;
      mes: string;
      data: string;
      ordem: number;
      conteudo_preenchido: number;
      codigo_cr: string | null;
      desenvolvimento: string | null;
      ferramentas: string | null;
    }[];
  return rows.map(row => ({
    etapa: row.etapa,
    mes: row.mes,
    data: row.data,
    ordem: row.ordem === SEM_ORDEM ? null : row.ordem,
    conteudoPreenchido: row.conteudo_preenchido === 1,
    codigoCR: row.codigo_cr,
    desenvolvimento: row.desenvolvimento,
    ferramentas: row.ferramentas
  }));
}

export interface RaspagemDaTurma {
  etapas: readonly EtapaRaspada[];
  estudantes: readonly EstudanteDaCaderneta[];
}

function replaceRaspagem(
  db: DatabaseSync,
  id: string,
  turma: string,
  raspagem: RaspagemDaTurma,
): void {
  for (const table of TABLES) db.prepare(`DELETE FROM ${table} WHERE caderneta_id = ? AND turma = ?`).run(id, turma);
  const insertEtapa = db.prepare(
    'INSERT INTO caderneta_etapas (caderneta_id, turma, nome, posicao, meses) VALUES (?, ?, ?, ?, ?)',
  );
  const insertAula = db.prepare(
    `INSERT INTO caderneta_aulas
     (caderneta_id, turma, etapa, mes, data, ordem, conteudo_preenchido, codigo_cr, desenvolvimento, ferramentas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDisciplina = db.prepare(
    'INSERT OR IGNORE INTO caderneta_disciplinas (caderneta_id, turma, nome, posicao) VALUES (?, ?, ?, ?)',
  );
  const insertAvaliacao = db.prepare(
    `INSERT INTO caderneta_avaliacoes
     (caderneta_id, turma, etapa, disciplina, nome, tipo, data, valor, media, posicao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertNota = db.prepare(
    `INSERT INTO caderneta_notas
     (caderneta_id, turma, etapa, disciplina, matricula, avaliacao, valor) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertNotaDoEstudante = db.prepare(
    `INSERT INTO caderneta_notas_do_estudante
     (caderneta_id, turma, etapa, disciplina, matricula, origem, calculada, parcial, personalizada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const disciplinas: string[] = [];
  raspagem.etapas.forEach((etapa, posicao) => {
    insertEtapa.run(id, turma, etapa.nome, posicao, JSON.stringify(etapa.meses));
    for (const aula of etapa.aulas) insertAula.run(
      id,
      turma,
      etapa.nome,
      aula.mes,
      aula.data,
      aula.ordem ?? SEM_ORDEM,
      aula.preenchida ? 1 : 0,
      aula.codigoCR ?? null,
      aula.desenvolvimento ?? null,
      aula.ferramentas ?? null,
    );
    for (const boletim of etapa.boletins ?? []) {
      if (!disciplinas.includes(boletim.disciplina)) {
        insertDisciplina.run(id, turma, boletim.disciplina, disciplinas.length);
        disciplinas.push(boletim.disciplina);
      }
      boletim.avaliacoes.forEach((avaliacao, posicao) => insertAvaliacao.run(
        id,
        turma,
        etapa.nome,
        boletim.disciplina,
        avaliacao.nome,
        avaliacao.tipo ?? null,
        avaliacao.data ?? null,
        avaliacao.valor ?? null,
        avaliacao.media ?? null,
        posicao,
      ));
      for (const nota of boletim.notas) insertNota.run(
        id,
        turma,
        etapa.nome,
        boletim.disciplina,
        nota.matricula,
        nota.avaliacao,
        nota.valor,
      );
      for (const nota of boletim.notasDoEstudante) insertNotaDoEstudante.run(
        id,
        turma,
        etapa.nome,
        boletim.disciplina,
        nota.matricula,
        nota.origem ?? null,
        nota.calculada ?? null,
        nota.parcial ?? null,
        nota.personalizada ?? null,
      );
    }
  });
  const insertEstudante = db.prepare(
    `INSERT INTO caderneta_estudantes
     (caderneta_id, turma, matricula, nome, situacao, data_matricula, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  raspagem.estudantes.forEach((estudante, ordem) => insertEstudante.run(
    id,
    turma,
    estudante.matricula,
    estudante.nome,
    estudante.situacao ?? null,
    estudante.dataMatricula ?? null,
    ordem,
  ));
}

/** Commit all turmas together after every portal read succeeds. */
export function syncCadernetaTurmas(
  db: DatabaseSync,
  id: string,
  raspagens: readonly {
    turma: string;
    raspagem: RaspagemDaTurma;
  }[],
): Caderneta {
  const caderneta = getCaderneta(db, id);
  if (raspagens.length !== caderneta.turmas.length || new Set(raspagens.map(entry => entry.turma)).size !== raspagens.length || raspagens.some(entry => !caderneta.turmas.includes(entry.turma))) {
    throw new CadernetaInvalidaError('Synchronization must include every turma of the caderneta.');
  }
  transaction(db, () => {
    for (const {
      turma,
      raspagem
    } of raspagens) replaceRaspagem(db, id, turma, raspagem);
    db.prepare(
      "UPDATE cadernetas SET synced_at = ?, sync_status = 'sincronizada', sync_error = NULL WHERE id = ?",
    )
      .run(new Date().toISOString(), id);
  });
  return getCaderneta(db, id);
}

export function syncCaderneta(
  db: DatabaseSync,
  id: string,
  raspagem: RaspagemDaTurma,
  turma?: string,
): Caderneta {
  const caderneta = getCaderneta(db, id);
  const selected = selectedTurma(db, id, turma);
  transaction(db, () => {
    replaceRaspagem(db, id, selected, raspagem);
    // A single-turma refresh cannot establish success for the entire group.
    if (caderneta.turmas.length === 1) {
      db.prepare(
        "UPDATE cadernetas SET synced_at = ?, sync_status = 'sincronizada', sync_error = NULL WHERE id = ?",
      )
        .run(new Date().toISOString(), id);
    }
  });
  return getCaderneta(db, id);
}

export function atualizarConteudosDoMes(
  db: DatabaseSync,
  id: string,
  etapa: string,
  mes: string,
  aulas: readonly AulaDoPortal[],
  turma?: string,
): void {
  const selected = selectedTurma(db, id, turma);
  const existentes = listAulasDaEtapa(db, id, etapa, selected).filter(aula => aula.mes === mes);
  const update = db.prepare(
    `UPDATE caderneta_aulas SET conteudo_preenchido = ?, codigo_cr = ?, desenvolvimento = ?, ferramentas = ?
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND mes = ? AND data = ? AND ordem = ?`,
  );
  transaction(db, () => {
    for (const existente of existentes) {
      const aula = aulas.find(candidate => candidate.data === existente.data && (candidate.ordem ?? null) === existente.ordem);
      update.run(
        aula?.preenchida ? 1 : 0,
        aula?.codigoCR ?? null,
        aula?.desenvolvimento ?? null,
        aula?.ferramentas ?? null,
        id,
        selected,
        etapa,
        mes,
        existente.data,
        existente.ordem ?? SEM_ORDEM,
      );
    }
  });
}

export function marcarSincronizando(db: DatabaseSync, id: string): void {
  db.prepare(
    "UPDATE cadernetas SET sync_status = 'sincronizando', sync_error = NULL WHERE id = ?",
  )
    .run(id);
}

export function marcarFalhaNaSincronizacao(
  db: DatabaseSync,
  id: string,
  motivo: string,
): void {
  db.prepare(
    "UPDATE cadernetas SET sync_status = 'falhou', sync_error = ? WHERE id = ?",
  )
    .run(motivo, id);
}

export function listEstudantes(
  db: DatabaseSync,
  id: string,
  turma?: string,
): EstudanteDaCaderneta[] {
  const rows = db.prepare(
    `SELECT matricula, nome, situacao, data_matricula FROM caderneta_estudantes
     WHERE caderneta_id = ? AND turma = ? ORDER BY ordem`,
  )
    .all(id, selectedTurma(db, id, turma)) as unknown as {
      matricula: string;
      nome: string;
      situacao: string | null;
      data_matricula: string | null;
    }[];
  return rows.map(row => ({
    matricula: row.matricula,
    nome: limparNomeDoEstudante(row.nome),
    situacao: row.situacao,
    dataMatricula: row.data_matricula
  }));
}

export interface AulaGravada {
  etapa: string;
  data: string;
  ordem?: number | null;
}

export function marcarConteudoPreenchido(
  db: DatabaseSync,
  id: string,
  aulas: readonly AulaGravada[],
  turma?: string,
): number {
  const selected = selectedTurma(db, id, turma);
  const comOrdem = db.prepare(
    'UPDATE caderneta_aulas SET conteudo_preenchido = 1 WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND data = ? AND ordem = ?',
  );
  const semOrdem = db.prepare(
    'UPDATE caderneta_aulas SET conteudo_preenchido = 1 WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND data = ?',
  );
  return transaction(db, () => aulas.reduce((total, aula) => total + Number((aula.ordem === undefined || aula.ordem === null ? semOrdem.run(id, selected, aula.etapa, aula.data) : comOrdem.run(id, selected, aula.etapa, aula.data, aula.ordem)).changes), 0));
}

export function deleteCaderneta(db: DatabaseSync, id: string): void {
  getCaderneta(db, id);
  transaction(db, () => {
    for (const table of TABLES) db.prepare(`DELETE FROM ${table} WHERE caderneta_id = ?`).run(id);
    db.prepare('DELETE FROM caderneta_turmas WHERE caderneta_id = ?').run(id);
    db.prepare('DELETE FROM cadernetas WHERE id = ?').run(id);
  });
}

export function listDisciplinasDaCaderneta(
  db: DatabaseSync,
  id: string,
  turma?: string,
): string[] {
  return (db.prepare(
    'SELECT nome FROM caderneta_disciplinas WHERE caderneta_id = ? AND turma = ? ORDER BY posicao',
  )
    .all(id, selectedTurma(db, id, turma)) as unknown as {
      nome: string;
    }[]).map(row => row.nome);
}

export interface AvaliacaoDaTurma {
  readonly turma: string;
  readonly etapa: string;
  readonly disciplina: string;
  readonly nome: string;
  readonly tipo?: string;
  readonly valor?: number;
  readonly media?: number;
}

export function listAvaliacoesDoProfessor(db: DatabaseSync, professorId: string): AvaliacaoDaTurma[] {
  const rows = db.prepare(
    `SELECT a.turma, a.etapa, a.disciplina, a.nome, a.tipo, a.valor, a.media
     FROM caderneta_avaliacoes a JOIN cadernetas c ON c.id = a.caderneta_id
     LEFT JOIN caderneta_disciplinas d ON d.caderneta_id = a.caderneta_id AND d.turma = a.turma AND d.nome = a.disciplina
     WHERE c.professor_id = ? ORDER BY a.turma, a.etapa, d.posicao, a.posicao`,
  )
    .all(professorId) as unknown as {
      turma: string;
      etapa: string;
      disciplina: string;
      nome: string;
      tipo: string | null;
      valor: number | null;
      media: number | null;
    }[];
  return rows.map(row => ({
    turma: row.turma,
    etapa: row.etapa,
    disciplina: row.disciplina,
    nome: row.nome,
    ...(row.tipo === null ? {} : {
      tipo: row.tipo
    }),
    ...(row.valor === null ? {} : {
      valor: Number(row.valor)
    }),
    ...(row.media === null ? {} : {
      media: Number(row.media)
    })
  }));
}

export function getBoletimDaEtapa(
  db: DatabaseSync,
  id: string,
  etapa: string,
  disciplina?: string,
  turma?: string,
): BoletimDaEtapa {
  const selected = selectedTurma(db, id, turma);
  const disciplinas = listDisciplinasDaCaderneta(db, id, selected);
  const escolhida = disciplina ?? disciplinas[0];
  const disciplinasLancadas = (db.prepare(
    `SELECT DISTINCT disciplina FROM (
     SELECT disciplina FROM caderneta_notas WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     UNION SELECT disciplina FROM caderneta_notas_do_estudante WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     AND (parcial IS NOT NULL OR personalizada IS NOT NULL))`,
  )
    .all(id, selected, etapa, id, selected, etapa) as unknown as {
      disciplina: string;
    }[]).map(row => row.disciplina);
  const base = {
    etapa,
    disciplina: escolhida ?? null,
    disciplinas,
    disciplinasLancadas,
    estudantes: listEstudantes(db, id, selected)
  };
  if (escolhida === undefined) {
    return {
      ...base,
      avaliacoes: [],
      notas: [],
      notasDoEstudante: [],
    };
  }
  const avaliacoes = db.prepare(
    `SELECT nome, tipo, data, valor, media FROM caderneta_avaliacoes
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ? ORDER BY posicao`,
  )
    .all(id, selected, etapa, escolhida) as unknown as AvaliacaoDaCaderneta[];
  const notas = db.prepare(
    `SELECT matricula, avaliacao, valor FROM caderneta_notas
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ?`,
  )
    .all(id, selected, etapa, escolhida) as unknown as NotaDaCaderneta[];
  const notasDoEstudante = db.prepare(
    `SELECT matricula, origem, calculada, parcial, personalizada FROM caderneta_notas_do_estudante
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ?`,
  )
    .all(id, selected, etapa, escolhida) as unknown as NotaDoEstudanteDaCaderneta[];
  return {
    ...base,
    avaliacoes,
    notas,
    notasDoEstudante
  };
}

export interface NotaGravada {
  etapa: string;
  disciplina: string;
  matricula: string;
  avaliacao: string;
  valor: number;
}

export interface NotaDoEstudanteGravada {
  etapa: string;
  disciplina: string;
  matricula: string;
  parcial?: number | null;
  personalizada?: number | null;
}

export function marcarNotasLancadas(
  db: DatabaseSync,
  id: string,
  notas: readonly NotaGravada[],
  notasDoEstudante: readonly NotaDoEstudanteGravada[] = [],
  turma?: string,
): number {
  const selected = selectedTurma(db, id, turma);
  const conhece = db.prepare(
    'SELECT 1 FROM caderneta_avaliacoes WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ? AND nome = ?',
  );
  const upsert = db.prepare(
    `INSERT INTO caderneta_notas (caderneta_id, turma, etapa, disciplina, matricula, avaliacao, valor)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (caderneta_id, turma, etapa, disciplina, matricula, avaliacao) DO UPDATE SET valor = excluded.valor`,
  );
  const upsertDoEstudante = db.prepare(
    `INSERT INTO caderneta_notas_do_estudante (caderneta_id, turma, etapa, disciplina, matricula, parcial, personalizada)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (caderneta_id, turma, etapa, disciplina, matricula)
     DO UPDATE SET parcial = COALESCE(excluded.parcial, parcial), personalizada = COALESCE(excluded.personalizada, personalizada)`,
  );
  return transaction(db, () => {
    let gravadas = 0;
    for (const nota of notas) {
      if (!conhece.get(id, selected, nota.etapa, nota.disciplina, nota.avaliacao)) continue;
      upsert.run(id, selected, nota.etapa, nota.disciplina, nota.matricula, nota.avaliacao, nota.valor);
      gravadas += 1;
    }
    for (const nota of notasDoEstudante) {
      upsertDoEstudante.run(
        id,
        selected,
        nota.etapa,
        nota.disciplina,
        nota.matricula,
        nota.parcial ?? null,
        nota.personalizada ?? null,
      );
      gravadas += 1;
    }
    return gravadas;
  });
}
