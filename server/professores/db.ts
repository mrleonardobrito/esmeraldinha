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
];

/** Acrescenta ao banco existente as colunas que o schema ganhou depois. */
export function migrate(database: DatabaseSync): void {
  for (const { tabela, coluna, tipo } of COLUNAS_NOVAS) {
    const existentes = database
      .prepare(`PRAGMA table_info(${tabela})`)
      .all() as unknown as { name: string }[];

    if (existentes.some((atual) => atual.name === coluna)) continue;

    database.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
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
