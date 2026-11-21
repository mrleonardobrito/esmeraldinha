import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA } from '../../professores/db';
import { CadernetaInvalidaError, TurmaJaCadastradaError, atualizarConteudosDoMes, createCaderneta, deleteCaderneta, getBoletimDaEtapa, getCaderneta, listAulasDaEtapa, listAvaliacoesDoProfessor, listCadernetas, listEstudantes, marcarConteudoPreenchido, marcarNotasLancadas, syncCadernetaTurmas, type RaspagemDaTurma } from '../store';
let db: DatabaseSync;
const turmas = ['Turma A', 'Turma B', 'Turma C', 'Turma D', 'Turma E'];
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec(`INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
    VALUES ('p1', 'Maria', '111', X'00', 'Escola', '2026')`);
  const insert = db.prepare(`INSERT INTO turmas (id, professor_id, nome, grupo_diario, created_at)
    VALUES (?, 'p1', ?, ?, '2026')`);
  turmas.forEach((turma, index) => insert.run(`t${index}`, turma, index % 2 ? 'REDUÇÃO TARDE' : 'REDUÇÃO MANHÃ'));
});
afterEach(() => db.close());
function raspagem(
  nome: string,
  estudantes: number,
  avaliacoes: number,
  preenchida = false,
): RaspagemDaTurma {
  return {
    etapas: [{
      nome: '1ª Etapa',
      meses: ['MARÇO'],
      aulas: [{
        data: '05/03/2026',
        ordem: 1,
        mes: 'MARÇO',
        preenchida,
        desenvolvimento: nome
      }],
      boletins: [{
        disciplina: 'Português',
        avaliacoes: Array.from({
          length: avaliacoes
        }, (_, index) => ({
          nome: `Prova ${index + 1}`
        })),
        notas: [{
          matricula: '1',
          avaliacao: 'Prova 1',
          valor: nome === 'A' ? 7 : 8
        }],
        notasDoEstudante: [{
          matricula: '1',
          personalizada: nome === 'A' ? 4 : 5
        }]
      }]
    }],
    estudantes: Array.from({
      length: estudantes
    }, (_, index) => ({
      matricula: String(index + 1),
      nome: `${nome} ${index + 1}`,
      situacao: 'ATIVO',
      dataMatricula: null
    }))
  };
}
function cadastrar() {
  const caderneta = createCaderneta(db, {
    professorId: 'p1',
    turmas: turmas.slice(0, 2)
  });
  syncCadernetaTurmas(db, caderneta.id, [{
    turma: turmas[0],
    raspagem: raspagem('A', 1, 1, true)
  }, {
    turma: turmas[1],
    raspagem: raspagem('B', 2, 2)
  }]);
  return caderneta;
}
describe('turmas de redução in a caderneta', () => {
  it('groups up to four turmas explicitly, including different grupo diário suffixes', () => {
    const caderneta = createCaderneta(db, {
      professorId: 'p1',
      turmas: turmas.slice(0, 4)
    });
    expect(caderneta.turmas).toEqual(turmas.slice(0, 4));
    expect(listCadernetas(db, 'p1')).toHaveLength(1);
  });
  it.each([{
    pedidas: []
  }, {
    pedidas: turmas
  }, {
    pedidas: ['Turma A', 'Turma A']
  }])('rejects invalid composition $pedidas atomically', ({
    pedidas
  }) => {
    expect(() => createCaderneta(db, {
      professorId: 'p1',
      turmas: pedidas
    })).toThrow(CadernetaInvalidaError);
    expect(listCadernetas(db, 'p1')).toEqual([]);
  });
  it('rejects regente, unknown and other professor turmas in a group', () => {
    db.exec("UPDATE turmas SET grupo_diario = 'REGULAR' WHERE nome = 'Turma B'");
    for (const turma of ['Turma B', 'Unknown']) {
      expect(() => createCaderneta(db, {
        professorId: 'p1',
        turmas: ['Turma A', turma]
      })).toThrow(CadernetaInvalidaError);
    }
    db.exec("UPDATE turmas SET grupo_diario = NULL WHERE nome = 'Turma B'");
    expect(() => createCaderneta(db, {
      professorId: 'p1',
      turmas: ['Turma A', 'Turma B']
    })).toThrow(CadernetaInvalidaError);
  });
  it('prevents a secondary turma from joining another caderneta', () => {
    cadastrar();
    expect(() => createCaderneta(db, {
      professorId: 'p1',
      turma: 'Turma B'
    })).toThrow(TurmaJaCadastradaError);
    expect(() => createCaderneta(db, {
      professorId: 'p1',
      turmas: ['Turma C', 'Turma B']
    })).toThrow(TurmaJaCadastradaError);
    expect(listCadernetas(db, 'p1')).toHaveLength(1);
  });
  it('keeps matching aula, matrícula and avaliação keys isolated by turma', () => {
    const {
      id
    } = cadastrar();
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma A')[0].desenvolvimento).toBe('A');
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma B')[0].desenvolvimento).toBe('B');
    expect(listEstudantes(db, id, 'Turma A').map(entry => entry.nome)).toEqual(['A 1']);
    expect(listEstudantes(db, id, 'Turma B').map(entry => entry.nome)).toEqual(['B 1', 'B 2']);
    expect(getBoletimDaEtapa(db, id, '1ª Etapa', undefined, 'Turma A').notas[0].valor).toBe(7);
    expect(getBoletimDaEtapa(db, id, '1ª Etapa', undefined, 'Turma B').notas[0].valor).toBe(8);
    expect(listAvaliacoesDoProfessor(db, 'p1').map(entry => entry.turma)).toEqual(['Turma A', 'Turma B', 'Turma B']);
    expect(() => getCaderneta(db, id, 'Turma E')).toThrow(CadernetaInvalidaError);
  });
  it('sums required boletim entries per turma, without cross-multiplying', () => {
    const {
      id
    } = cadastrar();
    expect(getCaderneta(db, id)).toMatchObject({
      totalDeEstudantes: 3,
      etapas: [{
        totalDeAulas: 2,
        aulasPreenchidas: 1,
        conteudo: 'parcial',
        totalDeNotas: 5,
        notasLancadas: 2
      }]
    });
    expect(getCaderneta(db, id, 'Turma B')).toMatchObject({
      turma: 'Turma B',
      totalDeEstudantes: 2,
      etapas: [{
        totalDeAulas: 1,
        totalDeNotas: 4,
        notasLancadas: 1
      }]
    });
  });
  it('keeps aggregate completion partial when another turma is empty or missing the etapa', () => {
    const caderneta = createCaderneta(db, { professorId: 'p1', turmas: ['Turma A', 'Turma B'] });
    for (const etapas of [[{ nome: '1ª Etapa', meses: ['MARÇO'], aulas: [] }], []]) {
      syncCadernetaTurmas(db, caderneta.id, [
        { turma: 'Turma A', raspagem: raspagem('A', 1, 1, true) },
        { turma: 'Turma B', raspagem: { etapas, estudantes: [] } },
      ]);
      expect(getCaderneta(db, caderneta.id).etapas[0]).toMatchObject({
        totalDeAulas: 1, aulasPreenchidas: 1, conteudo: 'parcial',
        totalDeNotas: 1, notasLancadas: 1, boletim: 'parcial',
      });
    }
  });

  it('scopes conteúdo and boletim writes to the selected turma', () => {
    const {
      id
    } = cadastrar();
    marcarConteudoPreenchido(db, id, [{
      etapa: '1ª Etapa',
      data: '05/03/2026',
      ordem: 1
    }], 'Turma B');
    atualizarConteudosDoMes(db, id, '1ª Etapa', 'MARÇO', [{
      data: '05/03/2026',
      ordem: 1,
      preenchida: false,
      desenvolvimento: 'Changed'
    }], 'Turma B');
    marcarNotasLancadas(db, id, [{
      etapa: '1ª Etapa',
      disciplina: 'Português',
      matricula: '1',
      avaliacao: 'Prova 1',
      valor: 10
    }], [{
      etapa: '1ª Etapa',
      disciplina: 'Português',
      matricula: '1',
      personalizada: 9
    }], 'Turma B');
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma A')[0]).toMatchObject({
      conteudoPreenchido: true,
      desenvolvimento: 'A'
    });
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma B')[0]).toMatchObject({
      conteudoPreenchido: false,
      desenvolvimento: 'Changed'
    });
    const a = getBoletimDaEtapa(db, id, '1ª Etapa', undefined, 'Turma A');
    const b = getBoletimDaEtapa(db, id, '1ª Etapa', undefined, 'Turma B');
    expect(a.notas[0].valor).toBe(7);
    expect(a.notasDoEstudante[0].personalizada).toBe(4);
    expect(b.notas[0].valor).toBe(10);
    expect(b.notasDoEstudante[0].personalizada).toBe(9);
  });
  it('rolls back every turma when one replacement fails', () => {
    const {
      id
    } = cadastrar();
    const invalid = raspagem('Invalid', 1, 1);
    invalid.etapas[0].aulas.push({
      ...invalid.etapas[0].aulas[0]
    });
    expect(() => syncCadernetaTurmas(db, id, [{
      turma: 'Turma A',
      raspagem: raspagem('Replacement', 1, 1)
    }, {
      turma: 'Turma B',
      raspagem: invalid
    }])).toThrow();
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma A')[0].desenvolvimento).toBe('A');
    expect(listAulasDaEtapa(db, id, '1ª Etapa', 'Turma B')[0].desenvolvimento).toBe('B');
  });
  it('releases every membership and cached record when deleting a caderneta', () => {
    const {
      id
    } = cadastrar();
    deleteCaderneta(db, id);
    expect(db.prepare('SELECT * FROM caderneta_estudantes').all()).toEqual([]);
    expect(db.prepare('SELECT * FROM caderneta_turmas').all()).toEqual([]);
    expect(createCaderneta(db, {
      professorId: 'p1',
      turma: 'Turma B'
    }).turmas).toEqual(['Turma B']);
  });
});
