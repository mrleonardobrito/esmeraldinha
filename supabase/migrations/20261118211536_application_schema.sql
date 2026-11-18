-- Controlled backend only. This schema is not part of the Data API.
CREATE SCHEMA IF NOT EXISTS esmeraldinha;
REVOKE ALL ON SCHEMA esmeraldinha FROM PUBLIC, anon, authenticated, service_role;
SET search_path = esmeraldinha, pg_catalog;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'esmeraldinha_runtime') THEN
    CREATE ROLE esmeraldinha_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA esmeraldinha TO esmeraldinha_runtime;




  CREATE TABLE IF NOT EXISTS conta (
    id UUID PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    senha_hash TEXT,
    supabase_auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    supabase_auth_email TEXT,
    auth_setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
    nome TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    imagem TEXT,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS professores (
    id UUID PRIMARY KEY,
    nome TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    senha_encrypted BYTEA NOT NULL,
    acesso_liberado BOOLEAN NOT NULL DEFAULT FALSE,
    supabase_auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    auth_email TEXT NOT NULL DEFAULT '',
    auth_sync_status TEXT NOT NULL DEFAULT 'unlinked',
    auth_revision INTEGER NOT NULL DEFAULT 0,
    pronouns TEXT,
    escola TEXT NOT NULL,
    imagem TEXT,
    created_at TIMESTAMPTZ NOT NULL
  );


  CREATE TABLE IF NOT EXISTS turmas (
    id UUID PRIMARY KEY,
    professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,

    nome TEXT NOT NULL,

    turno TEXT,



    periodo_letivo TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (professor_id, nome)
  );

  CREATE TABLE IF NOT EXISTS turma_estudantes (
    turma_id UUID NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,


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
    id UUID PRIMARY KEY,
    professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
    turma TEXT NOT NULL,
    turno TEXT,
    created_at TIMESTAMPTZ NOT NULL,


    synced_at TIMESTAMPTZ,

    sync_status TEXT NOT NULL DEFAULT 'pendente',
    sync_error TEXT,
    valor_recebido NUMERIC,
    valor_a_receber NUMERIC,
    UNIQUE (professor_id, turma)
  );

  CREATE TABLE IF NOT EXISTS caderneta_etapas (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    meses JSONB NOT NULL,
    PRIMARY KEY (caderneta_id, nome)
  );

  CREATE TABLE IF NOT EXISTS caderneta_estudantes (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,


    matricula TEXT NOT NULL,
    nome TEXT NOT NULL,
    situacao TEXT,
    data_matricula TEXT,
    ordem INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, matricula)
  );

  CREATE TABLE IF NOT EXISTS caderneta_aulas (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    mes TEXT NOT NULL,
    data TEXT NOT NULL,


    ordem INTEGER NOT NULL,
    conteudo_preenchido BOOLEAN NOT NULL DEFAULT FALSE,


    codigo_cr TEXT,
    desenvolvimento TEXT,
    ferramentas TEXT,
    PRIMARY KEY (caderneta_id, etapa, data, ordem)
  );




  CREATE TABLE IF NOT EXISTS caderneta_disciplinas (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, nome)
  );


  CREATE TABLE IF NOT EXISTS caderneta_avaliacoes (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    data TEXT,

    valor NUMERIC,
    media NUMERIC,
    posicao INTEGER NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, disciplina, nome)
  );


  CREATE TABLE IF NOT EXISTS caderneta_notas (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    avaliacao TEXT NOT NULL,
    valor NUMERIC NOT NULL,
    PRIMARY KEY (caderneta_id, etapa, disciplina, matricula, avaliacao)
  );



  CREATE TABLE IF NOT EXISTS caderneta_notas_do_estudante (
    caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL,
    disciplina TEXT NOT NULL,
    matricula TEXT NOT NULL,
    origem NUMERIC,
    calculada NUMERIC,
    parcial NUMERIC,
    personalizada NUMERIC,
    PRIMARY KEY (caderneta_id, etapa, disciplina, matricula)
  );

CREATE UNIQUE INDEX conta_single_record ON conta ((TRUE));
CREATE TABLE professor_auth_operations (
 professor_id UUID PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
 operation_id UUID NOT NULL UNIQUE,
 payload BYTEA NOT NULL
);
CREATE TABLE migration_imports (
 checksum TEXT PRIMARY KEY,
 fingerprint TEXT NOT NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 counts JSONB NOT NULL
);

ALTER TABLE conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE conta FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON conta TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON conta FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON conta TO esmeraldinha_runtime;
ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE professores FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON professores TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON professores FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON professores TO esmeraldinha_runtime;
ALTER TABLE turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE turmas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON turmas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON turmas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON turmas TO esmeraldinha_runtime;
ALTER TABLE turma_estudantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE turma_estudantes FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON turma_estudantes TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON turma_estudantes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON turma_estudantes TO esmeraldinha_runtime;
ALTER TABLE codigos_cr ENABLE ROW LEVEL SECURITY;
ALTER TABLE codigos_cr FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON codigos_cr TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON codigos_cr FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON codigos_cr TO esmeraldinha_runtime;
ALTER TABLE cadernetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadernetas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON cadernetas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON cadernetas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON cadernetas TO esmeraldinha_runtime;
ALTER TABLE caderneta_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_etapas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_etapas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_etapas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_etapas TO esmeraldinha_runtime;
ALTER TABLE caderneta_estudantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_estudantes FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_estudantes TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_estudantes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_estudantes TO esmeraldinha_runtime;
ALTER TABLE caderneta_aulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_aulas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_aulas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_aulas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_aulas TO esmeraldinha_runtime;
ALTER TABLE caderneta_disciplinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_disciplinas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_disciplinas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_disciplinas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_disciplinas TO esmeraldinha_runtime;
ALTER TABLE caderneta_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_avaliacoes FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_avaliacoes TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_avaliacoes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_avaliacoes TO esmeraldinha_runtime;
ALTER TABLE caderneta_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_notas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_notas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_notas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_notas TO esmeraldinha_runtime;
ALTER TABLE caderneta_notas_do_estudante ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_notas_do_estudante FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_notas_do_estudante TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_notas_do_estudante FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_notas_do_estudante TO esmeraldinha_runtime;
ALTER TABLE professor_auth_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_auth_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON professor_auth_operations TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON professor_auth_operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON professor_auth_operations TO esmeraldinha_runtime;
ALTER TABLE migration_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON migration_imports TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON migration_imports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON migration_imports TO esmeraldinha_runtime;

CREATE INDEX turmas_professor_id ON turmas(professor_id);
CREATE INDEX cadernetas_professor_id ON cadernetas(professor_id);
ALTER DEFAULT PRIVILEGES IN SCHEMA esmeraldinha REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA esmeraldinha REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
RESET search_path;
