-- Turmas de redução grouped into one caderneta, the ficha de desempenho and
-- the classificações de notas. Mirrors the SQLite schema in server/professores/db.ts.
SET search_path = esmeraldinha, pg_catalog;

ALTER TABLE turmas ADD COLUMN IF NOT EXISTS grupo_diario TEXT;

CREATE TABLE caderneta_turmas (
  caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
  professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  posicao INTEGER NOT NULL CHECK (posicao BETWEEN 0 AND 3),
  PRIMARY KEY (caderneta_id, turma),
  UNIQUE (professor_id, turma),
  UNIQUE (caderneta_id, posicao)
);
INSERT INTO caderneta_turmas (caderneta_id, professor_id, turma, posicao)
  SELECT id, professor_id, turma, 0 FROM cadernetas
  ON CONFLICT DO NOTHING;

-- Every cached record keeps the turma it was read from, so a grouped
-- caderneta never mixes the estudantes or aulas of two turmas.
ALTER TABLE caderneta_etapas ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_estudantes ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_aulas ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_disciplinas ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_avaliacoes ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_notas ADD COLUMN turma TEXT NOT NULL DEFAULT '';
ALTER TABLE caderneta_notas_do_estudante ADD COLUMN turma TEXT NOT NULL DEFAULT '';

UPDATE caderneta_etapas t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_estudantes t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_aulas t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_disciplinas t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_avaliacoes t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_notas t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;
UPDATE caderneta_notas_do_estudante t SET turma = c.turma FROM cadernetas c WHERE c.id = t.caderneta_id;

ALTER TABLE caderneta_etapas DROP CONSTRAINT caderneta_etapas_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, nome);
ALTER TABLE caderneta_estudantes DROP CONSTRAINT caderneta_estudantes_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, matricula);
ALTER TABLE caderneta_aulas DROP CONSTRAINT caderneta_aulas_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, etapa, data, ordem);
ALTER TABLE caderneta_disciplinas DROP CONSTRAINT caderneta_disciplinas_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, nome);
ALTER TABLE caderneta_avaliacoes DROP CONSTRAINT caderneta_avaliacoes_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, etapa, disciplina, nome);
ALTER TABLE caderneta_notas DROP CONSTRAINT caderneta_notas_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, etapa, disciplina, matricula, avaliacao);
ALTER TABLE caderneta_notas_do_estudante DROP CONSTRAINT caderneta_notas_do_estudante_pkey,
  ADD PRIMARY KEY (caderneta_id, turma, etapa, disciplina, matricula);

CREATE TABLE ficha_estruturas (
  professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  ficha TEXT NOT NULL,
  areas_json TEXT NOT NULL,
  lida_em TEXT NOT NULL,
  PRIMARY KEY (professor_id, turma)
);

CREATE TABLE ficha_previas (
  caderneta_id UUID NOT NULL REFERENCES cadernetas(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  previa_json TEXT NOT NULL,
  atualizada_em TEXT NOT NULL,
  PRIMARY KEY (caderneta_id, turma)
);

CREATE TABLE classificacoes_padrao (
  professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  classificacao TEXT NOT NULL,
  PRIMARY KEY (professor_id, turma)
);

CREATE TABLE classificacoes_dos_estudantes (
  professor_id UUID NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  turma TEXT NOT NULL,
  matricula TEXT NOT NULL,
  classificacao TEXT NOT NULL,
  PRIMARY KEY (professor_id, turma, matricula)
);

ALTER TABLE caderneta_turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE caderneta_turmas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON caderneta_turmas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON caderneta_turmas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON caderneta_turmas TO esmeraldinha_runtime;
ALTER TABLE ficha_estruturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_estruturas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON ficha_estruturas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON ficha_estruturas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ficha_estruturas TO esmeraldinha_runtime;
ALTER TABLE ficha_previas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_previas FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON ficha_previas TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON ficha_previas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ficha_previas TO esmeraldinha_runtime;
ALTER TABLE classificacoes_padrao ENABLE ROW LEVEL SECURITY;
ALTER TABLE classificacoes_padrao FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON classificacoes_padrao TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON classificacoes_padrao FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON classificacoes_padrao TO esmeraldinha_runtime;
ALTER TABLE classificacoes_dos_estudantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classificacoes_dos_estudantes FORCE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON classificacoes_dos_estudantes TO esmeraldinha_runtime USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON classificacoes_dos_estudantes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON classificacoes_dos_estudantes TO esmeraldinha_runtime;

CREATE INDEX caderneta_turmas_professor_id ON caderneta_turmas(professor_id);
RESET search_path;
