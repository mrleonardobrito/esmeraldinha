import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { env } from '../env';

let db: DatabaseSync | undefined;

/** O schema inteiro do app, exportado para os testes montarem um banco em memória. */
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS professores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_encrypted BLOB NOT NULL,
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
    UNIQUE (professor_id, turma)
  );

  CREATE TABLE IF NOT EXISTS caderneta_etapas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    meses TEXT NOT NULL,
    PRIMARY KEY (caderneta_id, nome)
  );

  CREATE TABLE IF NOT EXISTS caderneta_estudantes (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    -- O boletim é chaveado por matrícula, não por pessoa: é ela que
    -- identifica o estudante dentro da turma.
    matricula TEXT NOT NULL,
    nome TEXT NOT NULL,
    situacao TEXT,
    data_matricula TEXT,
    ordem INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, matricula)
  );

  CREATE TABLE IF NOT EXISTS caderneta_aulas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
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
    PRIMARY KEY (caderneta_id, etapa, data, ordem)
  );

  -- As colunas do boletim de uma etapa. O portal exige que a avaliação exista
  -- antes de qualquer nota: sem ela não há onde lançar.
  -- Uma caderneta tem uma ou mais disciplinas na sua turma, e cada uma tem o
  -- próprio boletim. Descobertas no portal junto com as avaliações.
  CREATE TABLE IF NOT EXISTS caderneta_disciplinas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, nome)
  );

  -- As colunas do boletim de uma etapa numa disciplina. A mesma etapa tem
  -- avaliações diferentes em cada disciplina, então ela entra na chave.
  CREATE TABLE IF NOT EXISTS caderneta_avaliacoes (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    data TEXT,
    -- O valor máximo da avaliação; NULL quando o portal não o informa.
    valor REAL,
    media REAL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, disciplina, nome)
  );

  -- Uma nota é sempre estudante × avaliação, chaveada por matrícula como o
  -- portal a chaveia.
  CREATE TABLE IF NOT EXISTS caderneta_notas (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    avaliacao TEXT NOT NULL,
    valor REAL NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, disciplina, matricula, avaliacao)
  );

  -- As notas da linha do estudante que não são de nenhuma avaliação. As
  -- calculadas o portal preenche sozinho e aqui só são guardadas para exibir.
  CREATE TABLE IF NOT EXISTS caderneta_notas_do_estudante (
    caderneta_id TEXT NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    personalizada REAL,
    final REAL,
    calculada REAL,
    parcial REAL,
    PRIMARY KEY (caderneta_id, etapa, disciplina, matricula)
  );
`;

/**
 * Colunas que nasceram depois da primeira versão do schema. `CREATE TABLE IF
 * NOT EXISTS` não as acrescenta a um banco que já existe, então cada uma é
 * aplicada aqui — nulável, para as linhas antigas continuarem válidas.
 */
const COLUNAS_NOVAS: readonly { tabela: string; coluna: string; tipo: string }[] = [
  { tabela: 'caderneta_aulas', coluna: 'codigo_cr', tipo: 'TEXT' },
  { tabela: 'caderneta_aulas', coluna: 'desenvolvimento', tipo: 'TEXT' },
  { tabela: 'caderneta_aulas', coluna: 'ferramentas', tipo: 'TEXT' },
  { tabela: 'caderneta_estudantes', coluna: 'data_matricula', tipo: 'TEXT' },
  { tabela: 'turma_estudantes', coluna: 'data_matricula', tipo: 'TEXT' },
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
      'personalizada',
      'final',
      'calculada',
      'parcial',
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

  return db;
}

/** Closes the current connection so a later `getDb()` call reopens fresh. */
export function closeDb(): void {
  db?.close();
  db = undefined;
}
