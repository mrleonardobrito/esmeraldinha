import { DatabaseSync } from 'node:sqlite';

import { beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA } from '../../professores/db';
import {
  CadernetaNotFoundError,
  TurmaJaCadastradaError,
  createCaderneta,
  deleteCaderneta,
  getCaderneta,
  listAulasDaEtapa,
  listCadernetas,
  listEstudantes,
  marcarConteudoPreenchido,
  syncCaderneta,
  type EstudanteDaCaderneta,
  type EtapaRaspada,
} from '../store';

let db: DatabaseSync;

/** O mesmo schema do app, aplicado a um banco em memória. */
function freshDb(): DatabaseSync {
  const memoria = new DatabaseSync(':memory:');
  memoria.exec(SCHEMA);
  memoria
    .prepare(
      `INSERT INTO professores (id, nome, login, senha_encrypted, escola, created_at)
       VALUES ('prof-1', 'Maria', '111', X'00', 'Escola', '2026-01-01T00:00:00.000Z')`,
    )
    .run();

  return memoria;
}

function etapa(nome: string, aulas: EtapaRaspada['aulas']): EtapaRaspada {
  return { nome, meses: ['MARÇO', 'ABRIL'], aulas };
}

const primeiraEtapa = etapa('1ª Etapa', [
  { data: '05/03/2026', ordem: 1, preenchida: true, mes: 'MARÇO' },
  { data: '05/03/2026', ordem: 2, preenchida: false, mes: 'MARÇO' },
  { data: '12/03/2026', preenchida: false, mes: 'MARÇO' },
]);

/**
 * Uma caderneta nasce vazia e é preenchida pela raspagem — os testes que
 * querem conteúdo cadastram e sincronizam em seguida, como a rota faz.
 */
function cadastrar(
  etapas: readonly EtapaRaspada[] = [primeiraEtapa],
  estudantes: EstudanteDaCaderneta[] = [],
) {
  const caderneta = createCaderneta(db, {
    professorId: 'prof-1',
    turma: '9º ANO - 9º ANO B - MATUTINO',
  });

  return syncCaderneta(db, caderneta.id, { etapas, estudantes });
}

describe('cadernetas store', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('cadastra uma caderneta com as etapas e aulas raspadas', () => {
    const caderneta = cadastrar();

    expect(caderneta.turma).toBe('9º ANO - 9º ANO B - MATUTINO');
    expect(caderneta.turno).toBe('MATUTINO');
    expect(caderneta.etapas).toHaveLength(1);
    expect(caderneta.etapas[0]).toMatchObject({
      nome: '1ª Etapa',
      meses: ['MARÇO', 'ABRIL'],
      totalDeAulas: 3,
      aulasPreenchidas: 1,
      conteudo: 'parcial',
    });
  });

  it('nasce vazia e pendente, para a raspagem vir depois', () => {
    const caderneta = createCaderneta(db, { professorId: 'prof-1', turma: '9º ANO - 9º ANO C - VESPERTINO' });

    expect(caderneta.syncStatus).toBe('pendente');
    expect(caderneta.syncedAt).toBeNull();
    expect(caderneta.etapas).toEqual([]);
    expect(caderneta.totalDeEstudantes).toBe(0);
  });

  it('guarda os estudantes da turma na ordem do portal', () => {
    const caderneta = cadastrar(
      [primeiraEtapa],
      [
        { matricula: '2026001', nome: 'Ana Lima', situacao: 'ATIVO' },
        { matricula: '2026002', nome: 'Bruno Sá', situacao: null },
      ],
    );

    expect(caderneta.totalDeEstudantes).toBe(2);
    expect(listEstudantes(db, caderneta.id)).toEqual([
      { matricula: '2026001', nome: 'Ana Lima', situacao: 'ATIVO' },
      { matricula: '2026002', nome: 'Bruno Sá', situacao: null },
    ]);
  });

  it('substitui os estudantes numa nova sincronização', () => {
    const caderneta = cadastrar(
      [primeiraEtapa],
      [{ matricula: '2026001', nome: 'Ana Lima', situacao: 'ATIVO' }],
    );

    syncCaderneta(db, caderneta.id, {
      etapas: [primeiraEtapa],
      estudantes: [{ matricula: '2026009', nome: 'Rita Melo', situacao: 'ATIVO' }],
    });

    expect(listEstudantes(db, caderneta.id)).toEqual([
      { matricula: '2026009', nome: 'Rita Melo', situacao: 'ATIVO' },
    ]);
  });

  it('recusa uma turma que o professor já tem cadastrada', () => {
    cadastrar();

    expect(() =>
      createCaderneta(db, { professorId: 'prof-1', turma: '9º ANO - 9º ANO B - MATUTINO' }),
    ).toThrow(TurmaJaCadastradaError);
    expect(listCadernetas(db, 'prof-1')).toHaveLength(1);
  });

  it('conta a etapa como pendente quando nenhuma aula tem conteúdo', () => {
    const caderneta = cadastrar([
      etapa('1ª Etapa', [{ data: '05/03/2026', preenchida: false, mes: 'MARÇO' }]),
    ]);

    expect(caderneta.etapas[0]?.conteudo).toBe('pendente');
  });

  it('conta a etapa como concluída quando todas as aulas têm conteúdo', () => {
    const caderneta = cadastrar([
      etapa('1ª Etapa', [{ data: '05/03/2026', preenchida: true, mes: 'MARÇO' }]),
    ]);

    expect(caderneta.etapas[0]?.conteudo).toBe('concluido');
  });

  it('lista as aulas de uma etapa em ordem de data', () => {
    const caderneta = cadastrar([
      etapa('1ª Etapa', [
        { data: '12/03/2026', preenchida: false, mes: 'MARÇO' },
        { data: '05/03/2026', ordem: 2, preenchida: false, mes: 'MARÇO' },
        { data: '05/03/2026', ordem: 1, preenchida: true, mes: 'MARÇO' },
      ]),
    ]);

    const aulas = listAulasDaEtapa(db, caderneta.id, '1ª Etapa');

    expect(aulas.map((aula) => [aula.data, aula.ordem])).toEqual([
      ['05/03/2026', 1],
      ['05/03/2026', 2],
      ['12/03/2026', null],
    ]);
    expect(aulas[0]?.conteudoPreenchido).toBe(true);
  });

  it('marca como preenchida a aula que um envio gravou', () => {
    const caderneta = cadastrar();

    const changed = marcarConteudoPreenchido(db, caderneta.id, [
      { etapa: '1ª Etapa', data: '12/03/2026' },
    ]);

    expect(changed).toBe(1);
    expect(getCaderneta(db, caderneta.id).etapas[0]?.aulasPreenchidas).toBe(2);
  });

  it('marca todas as aulas da data quando o envio não diz a ordem', () => {
    const caderneta = cadastrar();

    marcarConteudoPreenchido(db, caderneta.id, [{ etapa: '1ª Etapa', data: '05/03/2026' }]);

    const aulas = listAulasDaEtapa(db, caderneta.id, '1ª Etapa');
    expect(aulas.filter((aula) => aula.data === '05/03/2026')).toEqual([
      expect.objectContaining({ ordem: 1, conteudoPreenchido: true }),
      expect.objectContaining({ ordem: 2, conteudoPreenchido: true }),
    ]);
  });

  it('ignora uma aula gravada que a caderneta não tem', () => {
    const caderneta = cadastrar();

    const changed = marcarConteudoPreenchido(db, caderneta.id, [
      { etapa: '1ª Etapa', data: '31/12/2026' },
    ]);

    expect(changed).toBe(0);
  });

  it('substitui as aulas numa sincronização, sem duplicar', () => {
    const caderneta = cadastrar();

    const sincronizada = syncCaderneta(db, caderneta.id, {
      etapas: [
        etapa('1ª Etapa', [
          { data: '05/03/2026', ordem: 1, preenchida: true, mes: 'MARÇO' },
          { data: '19/03/2026', preenchida: false, mes: 'MARÇO' },
        ]),
      ],
      estudantes: [],
    });

    expect(sincronizada.etapas[0]?.totalDeAulas).toBe(2);
    expect(listAulasDaEtapa(db, caderneta.id, '1ª Etapa').map((aula) => aula.data)).toEqual([
      '05/03/2026',
      '19/03/2026',
    ]);
    expect(sincronizada.syncStatus).toBe('sincronizada');
    expect(sincronizada.syncedAt).not.toBeNull();
  });

  it('não deixa uma sincronização de caderneta inexistente passar', () => {
    expect(() =>
      syncCaderneta(db, 'nao-existe', { etapas: [], estudantes: [] }),
    ).toThrow(CadernetaNotFoundError);
  });

  it('exclui a caderneta com as etapas e aulas dela', () => {
    const caderneta = cadastrar();

    deleteCaderneta(db, caderneta.id);

    expect(listCadernetas(db, 'prof-1')).toEqual([]);
    expect(listAulasDaEtapa(db, caderneta.id, '1ª Etapa')).toEqual([]);
    expect(() => deleteCaderneta(db, caderneta.id)).toThrow(CadernetaNotFoundError);
  });
});
