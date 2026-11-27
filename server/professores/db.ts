import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../env';

let db: DatabaseSync | undefined;

/** O schema inteiro do app, exportado para os testes montarem um banco em memória. */
export const SCHEMA = `
  -- A conta do auxiliar de ensino: uma só, porque é uma pessoa só que usa a
  -- Esmeraldinha. Nasce no primeiro acesso, com a senha temporária do
  -- ambiente; senha_hash fica NULL até ela ser trocada pela definitiva, e é
  -- esse NULL que diz que o primeiro acesso ainda não terminou.
  CREATE TABLE IF NOT EXISTS conta (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    imagem TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS professores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_encrypted BLOB NOT NULL,
    acesso_liberado INTEGER NOT NULL DEFAULT 0,
    pronouns TEXT,
    escola TEXT NOT NULL,
    imagem TEXT,
    created_at TEXT NOT NULL
  );

  -- Uma turma do professor, descoberta no portal durante o cadastro dele. É
  -- dona dos estudantes: eles são da turma, não da caderneta que a acompanha.
  CREATE TABLE IF NOT EXISTS turmas (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    -- O nome como o portal o escreve, com o turno no fim.
    nome TEXT NOT NULL,
    -- Lido do fim do nome; nulo quando o portal não o escreveu.
    turno TEXT,
    -- O período letivo em que o portal oferece a turma ("2026", "2026 EJA").
    -- É nele que a sessão precisa estar para achá-la. Nulo nas turmas lidas
    -- antes de o cadastro guardá-lo.
    periodo_letivo TEXT,
    grupo_diario TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (professor_id, nome)
  );

  CREATE TABLE IF NOT EXISTS turma_estudantes (
    turma_id TEXT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
    -- O boletim é chaveado por matrícula, não por pessoa: é ela que
    -- identifica o estudante dentro da turma.
    matricula TEXT NOT NULL,
    nome TEXT NOT NULL,
    situacao TEXT,
    data_matricula TEXT,
    ordem INTEGER NOT NULL,
    PRIMARY KEY (turma_id, matricula)
  );

  CREATE TABLE IF NOT EXISTS codigos_cr (
    codigo TEXT PRIMARY KEY,
    texto TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cadernetas (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma TEXT NOT NULL,
    turno TEXT,
    created_at TEXT NOT NULL,
    -- Nulo até a primeira raspagem terminar: uma caderneta nasce vazia e é
    -- preenchida em segundo plano.
    synced_at TEXT,
    -- pendente | sincronizando | sincronizada | falhou
    sync_status TEXT NOT NULL DEFAULT 'pendente',
    sync_error TEXT,
    valor_recebido REAL,
    valor_a_receber REAL,
    UNIQUE (professor_id, turma)
  );

  CREATE TABLE IF NOT EXISTS caderneta_turmas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    professor_id TEXT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma TEXT NOT NULL,
    posicao INTEGER NOT NULL CHECK (posicao BETWEEN 0 AND 3),
    PRIMARY KEY (caderneta_id, turma),
    UNIQUE (professor_id, turma),
    UNIQUE (caderneta_id, posicao)
  );

  CREATE TABLE IF NOT EXISTS caderneta_etapas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    meses TEXT NOT NULL,
    PRIMARY KEY (caderneta_id, turma, nome)
  );

  CREATE TABLE IF NOT EXISTS caderneta_estudantes (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    -- O boletim é chaveado por matrícula, não por pessoa: é ela que
    -- identifica o estudante dentro da turma.
    matricula TEXT NOT NULL,
    nome TEXT NOT NULL,
    situacao TEXT,
    data_matricula TEXT,
    ordem INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, turma, matricula)
  );

  CREATE TABLE IF NOT EXISTS caderneta_aulas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL,
    mes TEXT NOT NULL,
    data TEXT NOT NULL,
    -- -1 quando o portal não informa a ordem: num NULL o SQLite deixaria a
    -- chave primária duplicar, e a mesma aula entraria duas vezes.
    ordem INTEGER NOT NULL,
    conteudo_preenchido INTEGER NOT NULL DEFAULT 0,
    -- O conteúdo que o portal mostra na linha da aula, para a tela de lançar
    -- conteúdo exibi-lo sem uma volta ao portal. NULL = campo vazio lá.
    codigo_cr TEXT,
    desenvolvimento TEXT,
    ferramentas TEXT,
    PRIMARY KEY (caderneta_id, turma, etapa, data, ordem)
  );

  -- As colunas do boletim de uma etapa. O portal exige que a avaliação exista
  -- antes de qualquer nota: sem ela não há onde lançar.
  -- Uma caderneta tem uma ou mais disciplinas na sua turma, e cada uma tem o
  -- próprio boletim. Descobertas no portal junto com as avaliações.
  CREATE TABLE IF NOT EXISTS caderneta_disciplinas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, turma, nome)
  );

  -- As colunas do boletim de uma etapa numa disciplina. A mesma etapa tem
  -- avaliações diferentes em cada disciplina, então ela entra na chave.
  CREATE TABLE IF NOT EXISTS caderneta_avaliacoes (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    data TEXT,
    -- O valor máximo da avaliação; NULL quando o portal não o informa.
    valor REAL,
    media REAL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, turma, etapa, disciplina, nome)
  );

  -- Uma nota é sempre estudante × avaliação, chaveada por matrícula como o
  -- portal a chaveia.
  CREATE TABLE IF NOT EXISTS caderneta_notas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    avaliacao TEXT NOT NULL,
    valor REAL NOT NULL,
    PRIMARY KEY (caderneta_id, turma, etapa, disciplina, matricula, avaliacao)
  );

  -- As notas da linha do estudante que não são de nenhuma avaliação, com os
  -- nomes das colunas do portal. A origem e a calculada o portal preenche
  -- sozinho e aqui só são guardadas para exibir.
  CREATE TABLE IF NOT EXISTS caderneta_notas_do_estudante (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    turma TEXT NOT NULL DEFAULT '',
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    origem REAL,
    calculada REAL,
    parcial REAL,
    personalizada REAL,
    PRIMARY KEY (caderneta_id, turma, etapa, disciplina, matricula)
  );

  -- Classificações are typed by the auxiliar, not scraped. They are keyed by
  -- professor and turma rather than caderneta, so they survive turmas de
  -- redução being regrouped into another caderneta.
  CREATE TABLE IF NOT EXISTS classificacoes_padrao (
    professor_id TEXT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma TEXT NOT NULL,
    classificacao TEXT NOT NULL,
    PRIMARY KEY (professor_id, turma)
  );

  CREATE TABLE IF NOT EXISTS classificacoes_dos_estudantes (
    professor_id TEXT NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma TEXT NOT NULL,
    matricula TEXT NOT NULL,
    classificacao TEXT NOT NULL,
    PRIMARY KEY (professor_id, turma, matricula)
  );
`;

/**
 * Colunas que nasceram depois da primeira versão do schema. `CREATE TABLE IF
 * NOT EXISTS` não as acrescenta a um banco que já existe, então cada uma é
 * aplicada aqui — nulável, para as linhas antigas continuarem válidas.
 */
const COLUNAS_NOVAS: readonly { tabela: string; coluna: string; tipo: string }[] = [
  { tabela: 'professores', coluna: 'acesso_liberado', tipo: 'INTEGER NOT NULL DEFAULT 0' },
  { tabela: 'professores', coluna: 'pronouns', tipo: 'TEXT' },
  { tabela: 'caderneta_aulas', coluna: 'codigo_cr', tipo: 'TEXT' },
  { tabela: 'caderneta_aulas', coluna: 'desenvolvimento', tipo: 'TEXT' },
  { tabela: 'caderneta_aulas', coluna: 'ferramentas', tipo: 'TEXT' },
  { tabela: 'caderneta_estudantes', coluna: 'data_matricula', tipo: 'TEXT' },
  { tabela: 'turma_estudantes', coluna: 'data_matricula', tipo: 'TEXT' },
  { tabela: 'turmas', coluna: 'periodo_letivo', tipo: 'TEXT' },
  { tabela: 'turmas', coluna: 'grupo_diario', tipo: 'TEXT' },
  { tabela: 'cadernetas', coluna: 'valor_recebido', tipo: 'REAL' },
  { tabela: 'cadernetas', coluna: 'valor_a_receber', tipo: 'REAL' },
];

/**
 * Tabelas cujo formato mudou depois de já existirem em algum banco. Elas
 * guardam só o que a raspagem relê do portal — nenhuma delas tem dado que o
 * usuário tenha digitado —, então recriá-las é mais simples e mais seguro do
 * que remendar coluna por coluna. Uma chave primária nova, aliás, o
 * `ALTER TABLE` nem consegue aplicar.
 *
 * A recriação só acontece quando faltam colunas: um banco em dia não é tocado.
 */
const TABELAS_DO_BOLETIM: readonly { nome: string; colunas: readonly string[] }[] = [
  {
    nome: 'caderneta_avaliacoes',
    colunas: ['caderneta_id', 'etapa', 'disciplina', 'nome', 'tipo', 'data', 'valor', 'media', 'posicao'],
  },
  {
    nome: 'caderneta_notas',
    colunas: ['caderneta_id', 'etapa', 'disciplina', 'matricula', 'avaliacao', 'valor'],
  },
  {
    nome: 'caderneta_notas_do_estudante',
    colunas: [
      'caderneta_id',
      'etapa',
      'disciplina',
      'matricula',
      'origem',
      'calculada',
      'parcial',
      'personalizada',
    ],
  },
  { nome: 'caderneta_disciplinas', colunas: ['caderneta_id', 'nome', 'posicao'] },
];

/**
 * Recria as tabelas do boletim que ficaram com o formato antigo. O conteúdo
 * delas é cache da raspagem: o que se perde aqui volta na próxima
 * sincronização, e é por isso que não há cópia de linhas.
 */
function migrarTabelasDoBoletim(database: DatabaseSync): void {
  const desatualizadas = TABELAS_DO_BOLETIM.filter(({ nome, colunas }) => {
    const existentes = (
      database.prepare(`PRAGMA table_info(${nome})`).all() as unknown as { name: string }[]
    ).map((coluna) => coluna.name);

    // Tabela que ainda não existe será criada pelo SCHEMA, não aqui.
    if (existentes.length === 0) return false;

    return colunas.some((coluna) => !existentes.includes(coluna));
  });

  if (desatualizadas.length === 0) return;

  database.exec('BEGIN');
  try {
    for (const { nome } of desatualizadas) {
      database.exec(`DROP TABLE ${nome}`);
    }
    // O SCHEMA roda antes desta função, então as tabelas recriadas precisam
    // ser refeitas aqui mesmo, com o formato novo.
    database.exec(SCHEMA);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  console.warn(
    `Tabelas do boletim recriadas (${desatualizadas
      .map((tabela) => tabela.nome)
      .join(', ')}). Sincronize as cadernetas para lê-las do portal de novo.`,
  );
}

/** Preserve cached records while adding their originating turma to every key. */
function migrateCadernetaTurmas(database: DatabaseSync): void {
  if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'cadernetas'").get()) return;
  const createTable = (name: string) => {
    const start = SCHEMA.indexOf(`  CREATE TABLE IF NOT EXISTS ${name} (`);
    const end = SCHEMA.indexOf('\n  );', start) + '\n  );'.length;
    return SCHEMA.slice(start, end);
  };
  const tables = ['caderneta_etapas', 'caderneta_estudantes', 'caderneta_aulas',
    'caderneta_disciplinas', 'caderneta_avaliacoes', 'caderneta_notas', 'caderneta_notas_do_estudante'];
  database.exec('BEGIN');
  try {
    database.exec(createTable('caderneta_turmas'));
    database.exec(`INSERT OR IGNORE INTO caderneta_turmas (caderneta_id, professor_id, turma, posicao)
      SELECT id, professor_id, turma, 0 FROM cadernetas`);
    for (const name of tables) {
      const columns = database.prepare(`PRAGMA table_info(${name})`).all() as unknown as { name: string }[];
      if (columns.length === 0 || columns.some((column) => column.name === 'turma')) continue;
      const names = columns.map((column) => column.name);
      database.exec(`ALTER TABLE ${name} RENAME TO ${name}_before_turmas`);
      database.exec(createTable(name));
      database.exec(`INSERT INTO ${name} (${names.join(', ')}, turma)
        SELECT ${names.map((column) => `old.${column}`).join(', ')}, c.turma
        FROM ${name}_before_turmas old JOIN cadernetas c ON c.id = old.caderneta_id`);
      database.exec(`DROP TABLE ${name}_before_turmas`);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

/** Acrescenta ao banco existente as colunas que o schema ganhou depois. */
export function migrate(database: DatabaseSync): void {
  for (const { tabela, coluna, tipo } of COLUNAS_NOVAS) {
    const existentes = database
      .prepare(`PRAGMA table_info(${tabela})`)
      .all() as unknown as { name: string }[];

    // Tabela que não existe não tem coluna a acrescentar: o SCHEMA a cria já
    // no formato novo. `PRAGMA table_info` devolve vazio nesse caso, e um
    // `ALTER TABLE` ali estouraria.
    if (existentes.length === 0) continue;

    if (existentes.some((atual) => atual.name === coluna)) continue;

    database.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }

  migrarTabelasDoBoletim(database);
  migrateCadernetaTurmas(database);
}

/**
 * Opens (or reuses) the SQLite connection backing the professores store, the
 * cadernetas and the catálogo de códigos CR, at the path configured by
 * `env.dbPath`. The schema is created on first run, so a fresh install needs
 * no migration step; `migrate` cobre os bancos que já existiam antes de uma
 * coluna nova.
 */
export function getDb(): DatabaseSync {
  if (db) return db;

  if (env.dbPath !== ':memory:') {
    mkdirSync(dirname(env.dbPath), { recursive: true });
  }

  db = new DatabaseSync(env.dbPath);
  db.exec(SCHEMA);
  migrate(db);
  // Browser jobs do not survive a process restart; their cached data does.
  db.prepare(`UPDATE cadernetas SET sync_status = 'falhou',
    sync_error = 'Synchronization was interrupted. Synchronize the caderneta again.'
    WHERE sync_status = 'sincronizando'`).run();

  return db;
}

/** Closes the current connection so a later `getDb()` call reopens fresh. */
export function closeDb(): void {
  db?.close();
  db = undefined;
}
