import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { SCHEMA } from '../db';
import { listProfessores } from '../store';

it('sums all cadernetas per professor and returns zero for an empty professor', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await db.exec(SCHEMA);
    await db.exec(`INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at) VALUES
      ('p1', 'Maria', '111', X'00', 'Escola', '2026'), ('p2', 'Ana', '222', X'00', 'Escola', '2026');
      INSERT INTO cadernetas (id, professor_id, turma, created_at, valor_recebido, valor_a_receber) VALUES
      ('c1', 'p1', 'A', '2026', 10.50, 20), ('c2', 'p1', 'B', '2026', 5.25, 30), ('c3', 'p1', 'C', '2026', NULL, NULL);`);
    expect(
      (await listProfessores(db)).map((p) => [
        p.id,
        p.valorRecebidoTotal,
        p.valorAReceberTotal,
      ]),
    ).toEqual([
      ['p1', 15.75, 50],
      ['p2', 0, 0],
    ]);
  } finally {
    db.close();
  }
});
