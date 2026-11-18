import { randomUUID } from 'node:crypto';
import { callData } from '../database/remote';
import { transaction, type Database } from '../database/types';
import { env } from '../env';
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

async function turmasDaCaderneta(db: Database, id: string): Promise<string[]> {
  const rows = (await db.prepare(
    'SELECT turma FROM caderneta_turmas WHERE caderneta_id = ? ORDER BY posicao',
  )
    .all(id)) as unknown as {
      turma: string;
    }[];
  if (rows.length) return rows.map(row => row.turma);
  const row = (await db.prepare('SELECT turma FROM cadernetas WHERE id = ?').get(id)) as unknown as {
    turma: string;
  } | undefined;
  return row ? [row.turma] : [];
}

async function selectedTurma(
  db: Database,
  id: string,
  turma?: string,
): Promise<string> {
  const turmas = await turmasDaCaderneta(db, id);
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
async function readEtapas(
  db: Database,
  id: string,
  turmas: readonly string[],
): Promise<EtapaDaCaderneta[]> {
  const etapas = new Map<string, EtapaDaCaderneta>();
  const statuses = new Map<string, { conteudo: StatusDaParte[]; boletim: StatusDaParte[]; }>();
  for (const turma of turmas) {
    const rows = (await db.prepare(
      `SELECT e.nome, e.meses, COUNT(a.data) AS total,
       COALESCE(SUM(CAST(a.conteudo_preenchido AS INTEGER)), 0) AS preenchidas
       FROM caderneta_etapas e LEFT JOIN caderneta_aulas a
       ON a.caderneta_id = e.caderneta_id AND a.turma = e.turma AND a.etapa = e.nome
       WHERE e.caderneta_id = ? AND e.turma = ? GROUP BY e.nome, e.meses, e.posicao ORDER BY e.posicao`,
    )
      .all(id, turma)) as unknown as {
        nome: string;
        meses: string;
        total: number;
        preenchidas: number;
      }[];
    const estudantes = (await db.prepare(
      `SELECT COUNT(*) AS total FROM caderneta_estudantes
       WHERE caderneta_id = ? AND turma = ?
       AND UPPER(TRIM(COALESCE(situacao, ''))) NOT IN ('TRANSFERIDO', 'TRANSFERIDA')`,
    )
      .get(id, turma)) as unknown as {
        total: number;
      };
    const avaliacoes = new Map(((await db.prepare(
      `SELECT etapa, COUNT(*) AS total FROM caderneta_avaliacoes
       WHERE caderneta_id = ? AND turma = ? GROUP BY etapa`,
    )
      .all(id, turma)) as unknown as {
        etapa: string;
        total: number;
      }[]).map(row => [row.etapa, Number(row.total)]));
    const notas = new Map(((await db.prepare(
      `SELECT n.etapa, COUNT(*) AS total FROM caderneta_notas n
       JOIN caderneta_estudantes e ON e.caderneta_id = n.caderneta_id AND e.turma = n.turma AND e.matricula = n.matricula
       WHERE n.caderneta_id = ? AND n.turma = ?
       AND UPPER(TRIM(COALESCE(e.situacao, ''))) NOT IN ('TRANSFERIDO', 'TRANSFERIDA') GROUP BY n.etapa`,
    )
      .all(id, turma)) as unknown as {
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

async function toCaderneta(
  db: Database,
  row: CadernetaRow,
  turma?: string,
): Promise<Caderneta> {
  const turmas = await turmasDaCaderneta(db, row.id);
  const selected = await selectedTurma(db, row.id, turma);
  const scope = turma === undefined ? turmas : [selected];
  const count = db.prepare(
    'SELECT COUNT(*) AS total FROM caderneta_estudantes WHERE caderneta_id = ? AND turma = ?',
  );
  const turnos = new Set(scope.map(turnoDaTurma));
  let totalDeEstudantes = 0;
  for (const nome of scope) {
    totalDeEstudantes += Number(((await count.get(row.id, nome)) as unknown as {
      total: number;
    }).total);
  }
  return {
    id: row.id,
    professorId: row.professor_id,
    turma: selected,
    turmas,
    turno: turnos.size === 1 ? turnoDaTurma(scope[0] ?? row.turma) : null,
    etapas: await readEtapas(db, row.id, scope),
    totalDeEstudantes,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    valorRecebido: row.valor_recebido === null ? null : Number(row.valor_recebido),
    valorAReceber: row.valor_a_receber === null ? null : Number(row.valor_a_receber)
  };
}

export interface CadernetaInput {
  professorId: string;
  turma?: string;
  turmas?: readonly string[];
}

/** Create one caderneta, grouping turmas only when explicitly requested. */
export async function createCaderneta(db: Database, input: CadernetaInput): Promise<Caderneta> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof createCaderneta>>>('cadernetas.createCaderneta', [input]);
  const turmas = input.turmas ? [...input.turmas] : input.turma ? [input.turma] : [];
  if (!turmas.length || turmas.length > 4 || new Set(turmas).size !== turmas.length || turmas.some(turma => !turma.trim())) {
    throw new CadernetaInvalidaError('A caderneta must contain one to four distinct turmas.');
  }
  if (turmas.length > 1) {
    const lookup = db.prepare('SELECT grupo_diario FROM turmas WHERE professor_id = ? AND nome = ?');
    for (const turma of turmas) {
      const row = (await lookup.get(input.professorId, turma)) as unknown as {
        grupo_diario: string | null;
      } | undefined;
      if (!row || !isReducao(row.grupo_diario)) {
        throw new CadernetaInvalidaError('Only turmas de redução of the same professor may share a caderneta.');
      }
    }
  }
  const id = randomUUID();
  await transaction(db, async () => {
    for (const turma of turmas) {
      if (await db.prepare(
        `SELECT 1 FROM caderneta_turmas WHERE professor_id = ? AND turma = ?
         UNION ALL SELECT 1 FROM cadernetas WHERE professor_id = ? AND turma = ?`,
      )
        .get(input.professorId, turma, input.professorId, turma)) {
        throw new TurmaJaCadastradaError(turma);
      }
    }
    await db.prepare(
      `INSERT INTO cadernetas (id, professor_id, turma, turno, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'pendente')`,
    )
      .run(id, input.professorId, turmas[0], turnoDaTurma(turmas[0]), new Date().toISOString());
    const insert = db.prepare(
      'INSERT INTO caderneta_turmas (caderneta_id, professor_id, turma, posicao) VALUES (?, ?, ?, ?)',
    );
    for (const [posicao, turma] of turmas.entries()) await insert.run(id, input.professorId, turma, posicao);
  });
  return await getCaderneta(db, id);
}

export async function listCadernetas(db: Database, professorId: string): Promise<Caderneta[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listCadernetas>>>('cadernetas.listCadernetas', [professorId]);
  const rows = (await db.prepare('SELECT * FROM cadernetas WHERE professor_id = ? ORDER BY created_at').all(professorId)) as unknown as CadernetaRow[];
  const cadernetas: Caderneta[] = [];
  for (const row of rows) cadernetas.push(await toCaderneta(db, row));
  return cadernetas;
}

/** The caderneta holding the professor's turma, if one has been registered. */
export async function findCadernetaDaTurma(
  db: Database,
  professorId: string,
  turma: string,
): Promise<string | undefined> {
  if (env.dataApiUrl)
    return (await callData<string | null>('cadernetas.findCadernetaDaTurma', [professorId, turma])) ?? undefined;
  const row = (await db
    .prepare('SELECT caderneta_id AS id FROM caderneta_turmas WHERE professor_id = ? AND turma = ?')
    .get(professorId, turma)) as unknown as { id: string } | undefined;
  return row?.id;
}

export async function getCaderneta(
  db: Database,
  id: string,
  turma?: string,
): Promise<Caderneta> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof getCaderneta>>>('cadernetas.getCaderneta', [id, turma]);
  const row = (await db.prepare('SELECT * FROM cadernetas WHERE id = ?').get(id)) as unknown as CadernetaRow | undefined;
  if (!row) throw new CadernetaNotFoundError(id);
  return await toCaderneta(db, row, turma);
}

export async function listAulasDaEtapa(
  db: Database,
  id: string,
  etapa: string,
  turma?: string,
): Promise<AulaDaCaderneta[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listAulasDaEtapa>>>('cadernetas.listAulasDaEtapa', [id, etapa, turma]);
  const rows = (await db.prepare(
    `SELECT etapa, mes, data, ordem, conteudo_preenchido, codigo_cr, desenvolvimento, ferramentas
     FROM caderneta_aulas WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     ORDER BY substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2), ordem`,
  )
    .all(id, await selectedTurma(db, id, turma), etapa)) as unknown as {
      etapa: string;
      mes: string;
      data: string;
      ordem: number;
      conteudo_preenchido: number | boolean;
      codigo_cr: string | null;
      desenvolvimento: string | null;
      ferramentas: string | null;
    }[];
  return rows.map(row => ({
    etapa: row.etapa,
    mes: row.mes,
    data: row.data,
    ordem: Number(row.ordem) === SEM_ORDEM ? null : Number(row.ordem),
    conteudoPreenchido: Number(row.conteudo_preenchido) === 1,
    codigoCR: row.codigo_cr,
    desenvolvimento: row.desenvolvimento,
    ferramentas: row.ferramentas
  }));
}

export interface RaspagemDaTurma {
  etapas: readonly EtapaRaspada[];
  estudantes: readonly EstudanteDaCaderneta[];
}

async function replaceRaspagem(
  db: Database,
  id: string,
  turma: string,
  raspagem: RaspagemDaTurma,
): Promise<void> {
  for (const table of TABLES) await db.prepare(`DELETE FROM ${table} WHERE caderneta_id = ? AND turma = ?`).run(id, turma);
  const insertEtapa = db.prepare(
    'INSERT INTO caderneta_etapas (caderneta_id, turma, nome, posicao, meses) VALUES (?, ?, ?, ?, ?)',
  );
  const insertAula = db.prepare(
    `INSERT INTO caderneta_aulas
     (caderneta_id, turma, etapa, mes, data, ordem, conteudo_preenchido, codigo_cr, desenvolvimento, ferramentas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDisciplina = db.prepare(
    'INSERT INTO caderneta_disciplinas (caderneta_id, turma, nome, posicao) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
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
  for (const [posicao, etapa] of raspagem.etapas.entries()) {
    await insertEtapa.run(id, turma, etapa.nome, posicao, JSON.stringify(etapa.meses));
    for (const aula of etapa.aulas) await insertAula.run(
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
        await insertDisciplina.run(id, turma, boletim.disciplina, disciplinas.length);
        disciplinas.push(boletim.disciplina);
      }
      for (const [ordem, avaliacao] of boletim.avaliacoes.entries()) await insertAvaliacao.run(
        id,
        turma,
        etapa.nome,
        boletim.disciplina,
        avaliacao.nome,
        avaliacao.tipo ?? null,
        avaliacao.data ?? null,
        avaliacao.valor ?? null,
        avaliacao.media ?? null,
        ordem,
      );
      for (const nota of boletim.notas) await insertNota.run(
        id,
        turma,
        etapa.nome,
        boletim.disciplina,
        nota.matricula,
        nota.avaliacao,
        nota.valor,
      );
      for (const nota of boletim.notasDoEstudante) await insertNotaDoEstudante.run(
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
  }
  const insertEstudante = db.prepare(
    `INSERT INTO caderneta_estudantes
     (caderneta_id, turma, matricula, nome, situacao, data_matricula, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const [ordem, estudante] of raspagem.estudantes.entries()) await insertEstudante.run(
    id,
    turma,
    estudante.matricula,
    estudante.nome,
    estudante.situacao ?? null,
    estudante.dataMatricula ?? null,
    ordem,
  );
}

/** Commit all turmas together after every portal read succeeds. */
export async function syncCadernetaTurmas(
  db: Database,
  id: string,
  raspagens: readonly {
    turma: string;
    raspagem: RaspagemDaTurma;
  }[],
): Promise<Caderneta> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof syncCadernetaTurmas>>>('cadernetas.syncCadernetaTurmas', [id, raspagens]);
  const caderneta = await getCaderneta(db, id);
  if (raspagens.length !== caderneta.turmas.length || new Set(raspagens.map(entry => entry.turma)).size !== raspagens.length || raspagens.some(entry => !caderneta.turmas.includes(entry.turma))) {
    throw new CadernetaInvalidaError('Synchronization must include every turma of the caderneta.');
  }
  await transaction(db, async () => {
    for (const {
      turma,
      raspagem
    } of raspagens) await replaceRaspagem(db, id, turma, raspagem);
    await db.prepare(
      "UPDATE cadernetas SET synced_at = ?, sync_status = 'sincronizada', sync_error = NULL WHERE id = ?",
    )
      .run(new Date().toISOString(), id);
  });
  return await getCaderneta(db, id);
}

export async function syncCaderneta(
  db: Database,
  id: string,
  raspagem: RaspagemDaTurma,
  turma?: string,
): Promise<Caderneta> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof syncCaderneta>>>('cadernetas.syncCaderneta', [id, raspagem, turma]);
  const caderneta = await getCaderneta(db, id);
  const selected = await selectedTurma(db, id, turma);
  await transaction(db, async () => {
    await replaceRaspagem(db, id, selected, raspagem);
    // A single-turma refresh cannot establish success for the entire group.
    if (caderneta.turmas.length === 1) {
      await db.prepare(
        "UPDATE cadernetas SET synced_at = ?, sync_status = 'sincronizada', sync_error = NULL WHERE id = ?",
      )
        .run(new Date().toISOString(), id);
    }
  });
  return await getCaderneta(db, id);
}

export async function atualizarConteudosDoMes(
  db: Database,
  id: string,
  etapa: string,
  mes: string,
  aulas: readonly AulaDoPortal[],
  turma?: string,
): Promise<void> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof atualizarConteudosDoMes>>>('cadernetas.atualizarConteudosDoMes', [id, etapa, mes, aulas, turma]);
  const selected = await selectedTurma(db, id, turma);
  const existentes = (await listAulasDaEtapa(db, id, etapa, selected)).filter(aula => aula.mes === mes);
  const update = db.prepare(
    `UPDATE caderneta_aulas SET conteudo_preenchido = ?, codigo_cr = ?, desenvolvimento = ?, ferramentas = ?
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND mes = ? AND data = ? AND ordem = ?`,
  );
  await transaction(db, async () => {
    for (const existente of existentes) {
      const aula = aulas.find(candidate => candidate.data === existente.data && (candidate.ordem ?? null) === existente.ordem);
      await update.run(
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

export async function marcarSincronizando(db: Database, id: string): Promise<void> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof marcarSincronizando>>>('cadernetas.marcarSincronizando', [id]);
  await db.prepare(
    "UPDATE cadernetas SET sync_status = 'sincronizando', sync_error = NULL WHERE id = ?",
  )
    .run(id);
}

export async function marcarFalhaNaSincronizacao(
  db: Database,
  id: string,
  motivo: string,
): Promise<void> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof marcarFalhaNaSincronizacao>>>('cadernetas.marcarFalhaNaSincronizacao', [id, motivo]);
  await db.prepare(
    "UPDATE cadernetas SET sync_status = 'falhou', sync_error = ? WHERE id = ?",
  )
    .run(motivo, id);
}

export async function listEstudantes(
  db: Database,
  id: string,
  turma?: string,
): Promise<EstudanteDaCaderneta[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listEstudantes>>>('cadernetas.listEstudantes', [id, turma]);
  const rows = (await db.prepare(
    `SELECT matricula, nome, situacao, data_matricula FROM caderneta_estudantes
     WHERE caderneta_id = ? AND turma = ? ORDER BY ordem`,
  )
    .all(id, await selectedTurma(db, id, turma))) as unknown as {
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

export async function marcarConteudoPreenchido(
  db: Database,
  id: string,
  aulas: readonly AulaGravada[],
  turma?: string,
): Promise<number> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof marcarConteudoPreenchido>>>('cadernetas.marcarConteudoPreenchido', [id, aulas, turma]);
  const selected = await selectedTurma(db, id, turma);
  const comOrdem = db.prepare(
    'UPDATE caderneta_aulas SET conteudo_preenchido = TRUE WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND data = ? AND ordem = ?',
  );
  const semOrdem = db.prepare(
    'UPDATE caderneta_aulas SET conteudo_preenchido = TRUE WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND data = ?',
  );
  return await transaction(db, async () => {
    let total = 0;
    for (const aula of aulas) {
      const result = aula.ordem === undefined || aula.ordem === null
        ? await semOrdem.run(id, selected, aula.etapa, aula.data)
        : await comOrdem.run(id, selected, aula.etapa, aula.data, aula.ordem);
      total += Number(result.changes);
    }
    return total;
  });
}

export async function deleteCaderneta(db: Database, id: string): Promise<void> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof deleteCaderneta>>>('cadernetas.deleteCaderneta', [id]);
  await getCaderneta(db, id);
  await transaction(db, async () => {
    for (const table of TABLES) await db.prepare(`DELETE FROM ${table} WHERE caderneta_id = ?`).run(id);
    await db.prepare('DELETE FROM caderneta_turmas WHERE caderneta_id = ?').run(id);
    await db.prepare('DELETE FROM cadernetas WHERE id = ?').run(id);
  });
}

export async function updateValores(
  db: Database,
  id: string,
  values: { valorRecebido: number | null; valorAReceber: number | null },
): Promise<Caderneta> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof updateValores>>>('cadernetas.updateValores', [id, values]);
  const result = await db
    .prepare('UPDATE cadernetas SET valor_recebido = ?, valor_a_receber = ? WHERE id = ?')
    .run(values.valorRecebido, values.valorAReceber, id);
  if (!Number(result.changes)) throw new CadernetaNotFoundError(id);
  return await getCaderneta(db, id);
}

export async function listTodas(
  db: Database,
): Promise<{ id: string; professor_id: string; turma: string }[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listTodas>>>('cadernetas.listTodas', []);
  return (await db
    .prepare('SELECT id, professor_id, turma FROM cadernetas ORDER BY professor_id, turma')
    .all()) as { id: string; professor_id: string; turma: string }[];
}

export async function listDisciplinasDaCaderneta(
  db: Database,
  id: string,
  turma?: string,
): Promise<string[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listDisciplinasDaCaderneta>>>('cadernetas.listDisciplinasDaCaderneta', [id, turma]);
  return ((await db.prepare(
    'SELECT nome FROM caderneta_disciplinas WHERE caderneta_id = ? AND turma = ? ORDER BY posicao',
  )
    .all(id, await selectedTurma(db, id, turma))) as unknown as {
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

export async function listAvaliacoesDoProfessor(db: Database, professorId: string): Promise<AvaliacaoDaTurma[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listAvaliacoesDoProfessor>>>('cadernetas.listAvaliacoesDoProfessor', [professorId]);
  const rows = (await db.prepare(
    `SELECT a.turma, a.etapa, a.disciplina, a.nome, a.tipo, a.valor, a.media
     FROM caderneta_avaliacoes a JOIN cadernetas c ON c.id = a.caderneta_id
     LEFT JOIN caderneta_disciplinas d ON d.caderneta_id = a.caderneta_id AND d.turma = a.turma AND d.nome = a.disciplina
     WHERE c.professor_id = ? ORDER BY a.turma, a.etapa, d.posicao, a.posicao`,
  )
    .all(professorId)) as unknown as {
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

const numero = (valor: number | null) => (valor === null ? null : Number(valor));

export async function getBoletimDaEtapa(
  db: Database,
  id: string,
  etapa: string,
  disciplina?: string,
  turma?: string,
): Promise<BoletimDaEtapa> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof getBoletimDaEtapa>>>('cadernetas.getBoletimDaEtapa', [id, etapa, disciplina, turma]);
  const selected = await selectedTurma(db, id, turma);
  const disciplinas = await listDisciplinasDaCaderneta(db, id, selected);
  const escolhida = disciplina ?? disciplinas[0];
  const disciplinasLancadas = ((await db.prepare(
    `SELECT DISTINCT disciplina FROM (
     SELECT disciplina FROM caderneta_notas WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     UNION SELECT disciplina FROM caderneta_notas_do_estudante WHERE caderneta_id = ? AND turma = ? AND etapa = ?
     AND (parcial IS NOT NULL OR personalizada IS NOT NULL)) AS lancadas`,
  )
    .all(id, selected, etapa, id, selected, etapa)) as unknown as {
      disciplina: string;
    }[]).map(row => row.disciplina);
  const base = {
    etapa,
    disciplina: escolhida ?? null,
    disciplinas,
    disciplinasLancadas,
    estudantes: await listEstudantes(db, id, selected)
  };
  if (escolhida === undefined) {
    return {
      ...base,
      avaliacoes: [],
      notas: [],
      notasDoEstudante: [],
    };
  }
  const avaliacoes = (await db.prepare(
    `SELECT nome, tipo, data, valor, media FROM caderneta_avaliacoes
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ? ORDER BY posicao`,
  )
    .all(id, selected, etapa, escolhida)) as unknown as AvaliacaoDaCaderneta[];
  const notas = (await db.prepare(
    `SELECT matricula, avaliacao, valor FROM caderneta_notas
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ?`,
  )
    .all(id, selected, etapa, escolhida)) as unknown as NotaDaCaderneta[];
  const notasDoEstudante = (await db.prepare(
    `SELECT matricula, origem, calculada, parcial, personalizada FROM caderneta_notas_do_estudante
     WHERE caderneta_id = ? AND turma = ? AND etapa = ? AND disciplina = ?`,
  )
    .all(id, selected, etapa, escolhida)) as unknown as NotaDoEstudanteDaCaderneta[];
  return {
    ...base,
    avaliacoes: avaliacoes.map(avaliacao => ({
      ...avaliacao,
      valor: numero(avaliacao.valor),
      media: numero(avaliacao.media),
    })),
    notas: notas.map(nota => ({ ...nota, valor: Number(nota.valor) })),
    notasDoEstudante: notasDoEstudante.map(nota => ({
      matricula: nota.matricula,
      origem: numero(nota.origem),
      calculada: numero(nota.calculada),
      parcial: numero(nota.parcial),
      personalizada: numero(nota.personalizada),
    })),
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

export async function marcarNotasLancadas(
  db: Database,
  id: string,
  notas: readonly NotaGravada[],
  notasDoEstudante: readonly NotaDoEstudanteGravada[] = [],
  turma?: string,
): Promise<number> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof marcarNotasLancadas>>>('cadernetas.marcarNotasLancadas', [id, notas, notasDoEstudante, turma]);
  const selected = await selectedTurma(db, id, turma);
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
     DO UPDATE SET
       parcial = COALESCE(excluded.parcial, caderneta_notas_do_estudante.parcial),
       personalizada = COALESCE(excluded.personalizada, caderneta_notas_do_estudante.personalizada)`,
  );
  return await transaction(db, async () => {
    let gravadas = 0;
    for (const nota of notas) {
      if (!(await conhece.get(id, selected, nota.etapa, nota.disciplina, nota.avaliacao))) continue;
      await upsert.run(id, selected, nota.etapa, nota.disciplina, nota.matricula, nota.avaliacao, nota.valor);
      gravadas += 1;
    }
    for (const nota of notasDoEstudante) {
      await upsertDoEstudante.run(
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
