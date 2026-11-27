import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA } from '../../professores/db';
import { getPrevia, salvarPrevia } from '../../fichas/store';
import { reconcileCadernetasDeReducao } from '../reducao';
import {
  createCaderneta,
  getBoletimDaEtapa,
  getCaderneta,
  listAulasDaEtapa,
  listCadernetas,
  listEstudantes,
  syncCaderneta,
  syncCadernetaTurmas,
} from '../store';

let db: DatabaseSync;
const reducao = ['1º ANO D', '2º ANO C (ANEXO)', '3º ANO D', '4º ANO C (ANEXO)'];
const regente = '3º ANO A';
const cachedTables = [
  'caderneta_etapas', 'caderneta_aulas', 'caderneta_estudantes',
  'caderneta_disciplinas', 'caderneta_avaliacoes', 'caderneta_notas', 'caderneta_notas_do_estudante',
] as const;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(`INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
    VALUES ('p1', 'Maria', '111', X'00', 'Escola', '2026'),
      ('p2', 'Rita', '222', X'0102', 'Escola', '2026')`);
});
afterEach(() => db.close());

function addTurma(nome: string, grupoDiario: string | null, professorId = 'p1') {
  db.prepare(`INSERT INTO turmas (id, professor_id, nome, grupo_diario, created_at)
    VALUES (?, ?, ?, ?, '2026')`).run(`${professorId}-${nome}`, professorId, nome, grupoDiario);
}

function raspagem(turma: string, valor = 8) {
  return {
    etapas: [{
      nome: '1ª Etapa',
      meses: ['MARÇO'],
      aulas: [{ data: '05/03/2026', ordem: 1, mes: 'MARÇO', preenchida: true, desenvolvimento: turma }],
      boletins: [{
        disciplina: 'Português',
        avaliacoes: [{ nome: 'Prova', valor: 10 }],
        notas: [{ matricula: '1', avaliacao: 'Prova', valor }],
        notasDoEstudante: [{ matricula: '1', origem: 8, personalizada: valor }],
      }],
    }],
    estudantes: [{ matricula: '1', nome: turma, situacao: 'ATIVO', dataMatricula: '01/02/2026' }],
  };
}

function fiveCadernetas() {
  return [...reducao, regente].map((turma, index) => {
    addTurma(turma, turma === regente ? 'REGENTE MANHÃ' : index === 3 ? 'REDUÇÃO VITORIA' : 'REDUÇÃO TARDE');
    const caderneta = createCaderneta(db, { professorId: 'p1', turma });
    syncCaderneta(db, caderneta.id, raspagem(turma, index + 1));
    db.prepare(`UPDATE cadernetas SET created_at = ?, synced_at = ?,
      valor_recebido = ?, valor_a_receber = ? WHERE id = ?`).run(
      `2026-01-0${index + 1}`, `2026-02-0${index + 1}`,
      [null, 5, 10, null, 100][index], [1, null, 4, null, 200][index], caderneta.id,
    );
    return getCaderneta(db, caderneta.id);
  });
}

function snapshot() {
  return ['cadernetas', 'caderneta_turmas', ...cachedTables].map((table) => ({
    table,
    rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  }));
}

describe('automatic reconciliation of cadernetas de redução', () => {
  it('consolidates the five-caderneta case into one redução caderneta and one regente caderneta', () => {
    const before = fiveCadernetas();
    const result = reconcileCadernetasDeReducao(db, 'p1');
    expect(result).toHaveLength(2);
    const merged = result.find((caderneta) => caderneta.turmas.length === 4)!;
    expect(merged).toMatchObject({
      id: before[0].id,
      turmas: reducao,
      valorRecebido: 15,
      valorAReceber: 5,
      createdAt: '2026-01-01',
      syncedAt: '2026-02-01',
      syncStatus: 'sincronizada',
      totalDeEstudantes: 4,
      etapas: [{ totalDeAulas: 4, aulasPreenchidas: 4, totalDeNotas: 4, notasLancadas: 4 }],
    });
    expect(getCaderneta(db, before[4].id)).toEqual(before[4]);
    for (const [index, turma] of reducao.entries()) {
      expect(listAulasDaEtapa(db, merged.id, '1ª Etapa', turma)[0].desenvolvimento).toBe(turma);
      expect(listEstudantes(db, merged.id, turma)[0]).toMatchObject({ matricula: '1', nome: turma, dataMatricula: '01/02/2026' });
      expect(getBoletimDaEtapa(db, merged.id, '1ª Etapa', undefined, turma)).toMatchObject({
        disciplinas: ['Português'],
        avaliacoes: [{ nome: 'Prova', valor: 10 }],
        notas: [{ matricula: '1', avaliacao: 'Prova', valor: index + 1 }],
        notasDoEstudante: [{ matricula: '1', origem: 8, personalizada: index + 1 }],
      });
    }
    for (const table of cachedTables) {
      expect(db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get()).toEqual({ total: 5 });
    }
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('keeps the ficha de desempenho prévia of a turma that joins a group', () => {
    const before = fiveCadernetas();
    const previa = {
      areas: [0], etapas: [1, 2, 3, 4] as (1 | 2 | 3 | 4)[], gerais: [], naoResolvidos: [], descartadas: [], resposta: '',
      estudantes: [{ matricula: '1', nome: reducao[2], situacao: 'ATIVO', trechos: [], conceitos: { '0.0': ['RD', 'RD', 'R', 'R'] as ('R' | 'RD' | 'NR' | null)[] } }],
    };
    salvarPrevia(db, before[2].id, reducao[2], previa);

    const merged = reconcileCadernetasDeReducao(db, 'p1').find((caderneta) => caderneta.turmas.length === 4)!;

    expect(getPrevia(db, merged.id, reducao[2])).toMatchObject(previa);
  });

  it('is idempotent and does not change another professor', () => {
    fiveCadernetas();
    addTurma('Other A', 'REDUÇÃO NOITE', 'p2');
    addTurma('Other B', 'REDUÇÃO NOITE', 'p2');
    createCaderneta(db, { professorId: 'p2', turma: 'Other A' });
    createCaderneta(db, { professorId: 'p2', turma: 'Other B' });
    const other = listCadernetas(db, 'p2');
    reconcileCadernetasDeReducao(db, 'p1');
    const once = snapshot();
    reconcileCadernetasDeReducao(db, 'p1');
    expect(snapshot()).toEqual(once);
    expect(listCadernetas(db, 'p2')).toEqual(other);
  });

  it('preserves an established group and uses its free slots before creating another group', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    names.forEach((nome) => addTurma(nome, 'REDUÇÃO NOITE'));
    const existing = createCaderneta(db, { professorId: 'p1', turmas: ['C', 'D'] });
    syncCadernetaTurmas(db, existing.id, ['C', 'D'].map((turma) => ({ turma, raspagem: raspagem(turma) })));
    for (const nome of ['A', 'B', 'E', 'F', 'G']) createCaderneta(db, { professorId: 'p1', turma: nome });
    const merged = reconcileCadernetasDeReducao(db, 'p1');
    expect(merged).toHaveLength(2);
    expect(merged.map((caderneta) => caderneta.turmas.length).sort()).toEqual([3, 4]);
    expect(getCaderneta(db, existing.id).turmas.slice(0, 2)).toEqual(['C', 'D']);
    expect(merged.every((caderneta) => caderneta.turmas.length <= 4)).toBe(true);
  });

  it('keeps unknown grupo diário separate and preserves all-null monetary amounts', () => {
    for (const nome of ['A', 'B']) {
      addTurma(nome, 'REDUÇÃO TARDE');
      createCaderneta(db, { professorId: 'p1', turma: nome });
    }
    addTurma('Unknown', null);
    const unknown = createCaderneta(db, { professorId: 'p1', turma: 'Unknown' });
    const result = reconcileCadernetasDeReducao(db, 'p1');
    expect(result).toHaveLength(2);
    expect(result.find((caderneta) => caderneta.turmas.length === 2)).toMatchObject({
      valorRecebido: null, valorAReceber: null, syncedAt: null, syncStatus: 'pendente',
    });
    expect(getCaderneta(db, unknown.id)).toEqual(unknown);
  });

  it('defers every merge while any candidate is synchronizing', () => {
    const rows = fiveCadernetas();
    db.prepare("UPDATE cadernetas SET sync_status = 'sincronizando' WHERE id = ?").run(rows[1].id);
    const before = snapshot();
    expect(reconcileCadernetasDeReducao(db, 'p1')).toHaveLength(5);
    expect(snapshot()).toEqual(before);
    db.prepare("UPDATE cadernetas SET sync_status = 'sincronizada' WHERE id = ?").run(rows[1].id);
    expect(reconcileCadernetasDeReducao(db, 'p1')).toHaveLength(2);
  });

  it('retains failed status and conservative timestamps from partly synchronized sources', () => {
    const rows = fiveCadernetas();
    db.prepare("UPDATE cadernetas SET sync_status = 'falhou', sync_error = 'Portal timeout' WHERE id = ?").run(rows[1].id);
    db.prepare("UPDATE cadernetas SET sync_status = 'pendente', synced_at = NULL WHERE id = ?").run(rows[2].id);
    const merged = reconcileCadernetasDeReducao(db, 'p1').find((caderneta) => caderneta.turmas.length === 4)!;
    expect(merged).toMatchObject({ syncStatus: 'falhou', syncError: 'Portal timeout', syncedAt: null });
  });

  it('rolls back every moved record, membership and amount when consolidation fails', () => {
    fiveCadernetas();
    db.exec(`CREATE TRIGGER reject_move BEFORE UPDATE OF caderneta_id ON caderneta_notas
      WHEN NEW.caderneta_id <> OLD.caderneta_id BEGIN SELECT RAISE(ABORT, 'Blocked move'); END`);
    const before = snapshot();
    expect(() => reconcileCadernetasDeReducao(db, 'p1')).toThrow('Blocked move');
    expect(snapshot()).toEqual(before);
  });
});
