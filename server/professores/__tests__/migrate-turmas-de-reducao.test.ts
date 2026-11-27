import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SCHEMA, migrate } from '../db';
import { getBoletimDaEtapa, getCaderneta, listAulasDaEtapa, listEstudantes } from '../../cadernetas/store';

/** The preceding schema used caderneta-wide keys for every cached record. */
const LEGACY_SCHEMA = SCHEMA
  .replace(/ {2}CREATE TABLE IF NOT EXISTS caderneta_turmas \([\s\S]*?\n {2}\);\n/, '')
  .replace(/ {4}turma TEXT NOT NULL DEFAULT '',\n/g, '')
  .replace(/PRIMARY KEY \(caderneta_id, turma, /g, 'PRIMARY KEY (caderneta_id, ')
  .replace('    grupo_diario TEXT,\n', '');

describe('migration to turmas de redução', () => {
  it('preserves every cached part, caderneta identity, money and encrypted credenciais', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(LEGACY_SCHEMA);
      db.exec(`
        INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
          VALUES ('p1', 'Maria', '111', X'010203', 'Escola', '2026');
        INSERT INTO turmas (id, professor_id, nome, periodo_letivo, created_at)
          VALUES ('t1', 'p1', 'Turma A', '2026', '2026');
        INSERT INTO cadernetas (id, professor_id, turma, created_at, synced_at, sync_status, valor_recebido, valor_a_receber)
          VALUES ('c1', 'p1', 'Turma A', '2026', '2026-03-01', 'sincronizada', 20, 30);
        INSERT INTO caderneta_etapas VALUES ('c1', '1ª Etapa', 0, '["MARÇO"]');
        INSERT INTO caderneta_estudantes VALUES ('c1', '1', 'Ana', 'ATIVO', '01/02/2026', 0);
        INSERT INTO caderneta_aulas VALUES ('c1', '1ª Etapa', 'MARÇO', '05/03/2026', 1, 1, 'CR1', 'Development', 'Resources');
        INSERT INTO caderneta_disciplinas VALUES ('c1', 'Português', 0);
        INSERT INTO caderneta_avaliacoes VALUES ('c1', '1ª Etapa', 'Português', 'Prova', 'PROVA', '05/03/2026', 10, 5, 0);
        INSERT INTO caderneta_notas VALUES ('c1', '1ª Etapa', 'Português', '1', 'Prova', 8);
        INSERT INTO caderneta_notas_do_estudante VALUES ('c1', '1ª Etapa', 'Português', '1', 8, 9, 7, 6);
      `);
      db.exec(SCHEMA);
      migrate(db);
      migrate(db);
      expect(getCaderneta(db, 'c1')).toMatchObject({
        id: 'c1',
        turmas: ['Turma A'],
        valorRecebido: 20,
        valorAReceber: 30,
        syncedAt: '2026-03-01',
        syncStatus: 'sincronizada',
        totalDeEstudantes: 1,
        etapas: [{
          totalDeAulas: 1,
          aulasPreenchidas: 1,
          totalDeNotas: 1,
          notasLancadas: 1
        }]
      });
      expect(listAulasDaEtapa(db, 'c1', '1ª Etapa')[0]).toMatchObject({
        codigoCR: 'CR1',
        desenvolvimento: 'Development',
        ferramentas: 'Resources'
      });
      expect(listEstudantes(db, 'c1')[0]).toMatchObject({
        matricula: '1',
        nome: 'Ana',
        dataMatricula: '01/02/2026'
      });
      expect(getBoletimDaEtapa(db, 'c1', '1ª Etapa')).toMatchObject({
        disciplinas: ['Português'],
        avaliacoes: [{
          nome: 'Prova',
          valor: 10,
          media: 5
        }],
        notas: [{
          matricula: '1',
          avaliacao: 'Prova',
          valor: 8
        }],
        notasDoEstudante: [{
          matricula: '1',
          origem: 8,
          calculada: 9,
          parcial: 7,
          personalizada: 6
        }]
      });
      expect(db.prepare('SELECT hex(senha_encrypted) AS encrypted FROM professores').get()).toEqual({
        encrypted: '010203'
      });
      expect(db.prepare('SELECT grupo_diario FROM turmas').get()).toEqual({
        grupo_diario: null
      });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
