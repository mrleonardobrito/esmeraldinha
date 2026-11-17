import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { SCHEMA } from '../../professores/db';
import { createCaderneta, getCaderneta, syncCaderneta } from '../store';

for (const situacao of ['Transferido', ' TRANSFERIDO ', 'transferida']) {
  it(`excludes ${situacao} from required and completed boletim entries`, () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(SCHEMA);
      db.exec("INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at) VALUES ('p1', 'Maria', '111', X'00', 'Escola', '2026')");
      const caderneta = createCaderneta(db, { professorId: 'p1', turma: 'Turma A' });
      syncCaderneta(db, caderneta.id, {
        etapas: [{ nome: 'I ETAPA', meses: [], aulas: [] }],
        estudantes: [
          { matricula: '1', nome: 'Ana', situacao: null, dataMatricula: null },
          { matricula: '2', nome: 'Bia', situacao: 'ATIVO', dataMatricula: null },
          { matricula: '3', nome: 'Caio', situacao, dataMatricula: null },
        ],
      });
      db.prepare("INSERT INTO caderneta_avaliacoes (caderneta_id, etapa, disciplina, nome, posicao) VALUES (?, 'I ETAPA', 'Português', 'Prova', 0)").run(caderneta.id);
      const insert = db.prepare("INSERT INTO caderneta_notas (caderneta_id, etapa, disciplina, matricula, avaliacao, valor) VALUES (?, 'I ETAPA', 'Português', ?, 'Prova', 8)");
      insert.run(caderneta.id, '1');
      insert.run(caderneta.id, '3');
      expect(getCaderneta(db, caderneta.id).etapas[0]).toMatchObject({ totalDeNotas: 2, notasLancadas: 1, boletim: 'parcial' });
      insert.run(caderneta.id, '2');
      const updated = getCaderneta(db, caderneta.id);
      expect(updated.etapas[0]).toMatchObject({ totalDeNotas: 2, notasLancadas: 2, boletim: 'concluido' });
      expect(updated.totalDeEstudantes).toBe(3);
      db.prepare("DELETE FROM caderneta_notas WHERE matricula = '3'").run();
      expect(getCaderneta(db, caderneta.id).etapas[0].boletim).toBe('concluido');
    } finally { db.close(); }
  });
}
