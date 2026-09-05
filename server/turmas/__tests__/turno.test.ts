import { describe, expect, it } from 'vitest';

import { nomeCurtoDaTurma, turnoDaTurma } from '../../../shared/turma';

describe('turnoDaTurma', () => {
  it('lê o turno escrito no fim do nome da turma', () => {
    expect(turnoDaTurma('PRÉ-ESCOLA I - PRÉ-ESCOLA I - B - INTEGRAL')).toBe('INTEGRAL');
    expect(turnoDaTurma('PRÉ-ESCOLA I - PRÉ-ESCOLA I - D - VESPERTINO')).toBe('VESPERTINO');
    expect(turnoDaTurma('9º ANO - 9º ANO B - MATUTINO')).toBe('MATUTINO');
  });

  it('ignora espaços e caixa em volta do turno', () => {
    expect(turnoDaTurma('9º ANO - 9º ANO B -  matutino ')).toBe('MATUTINO');
  });

  it('devolve nulo quando o portal não escreveu turno nenhum', () => {
    expect(turnoDaTurma('9º ANO B')).toBeNull();
    expect(turnoDaTurma('9º ANO - 9º ANO B - NOTURNO')).toBeNull();
  });
});

describe('nomeCurtoDaTurma', () => {
  it('tira a série repetida e o turno, deixando só o nome da turma', () => {
    expect(nomeCurtoDaTurma('1º ANO - 1º ANO D - INTEGRAL')).toBe('1º ANO D');
    expect(nomeCurtoDaTurma('3º ANO - 3º ANO A - INTEGRAL')).toBe('3º ANO A');
    expect(nomeCurtoDaTurma('9º ANO - 9º ANO B - MATUTINO')).toBe('9º ANO B');
  });

  it('não parte a série no hífen que ela mesma tem', () => {
    expect(nomeCurtoDaTurma('PRÉ-ESCOLA I - PRÉ-ESCOLA I - B - INTEGRAL')).toBe(
      'PRÉ-ESCOLA I - B',
    );
    expect(nomeCurtoDaTurma('PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL')).toBe(
      'PRÉ-ESCOLA II - C',
    );
    expect(nomeCurtoDaTurma('PRÉ-ESCOLA I - PRÉ-ESCOLA I - D - VESPERTINO')).toBe(
      'PRÉ-ESCOLA I - D',
    );
  });

  it('mantém o que vem depois do nome da turma', () => {
    expect(nomeCurtoDaTurma('2º ANO - 2º ANO C - ANEXO - INTEGRAL')).toBe(
      '2º ANO C - ANEXO',
    );
  });

  it('devolve o nome como está quando não há série repetida para tirar', () => {
    expect(nomeCurtoDaTurma('3º ANO A')).toBe('3º ANO A');
    expect(nomeCurtoDaTurma('TURMA MULTISSERIADA - INTEGRAL')).toBe('TURMA MULTISSERIADA');
    // A série I não pode casar dentro de II: encurtar no chute erraria a turma.
    expect(nomeCurtoDaTurma('PRÉ-ESCOLA I - PRÉ-ESCOLA II - A - INTEGRAL')).toBe(
      'PRÉ-ESCOLA I - PRÉ-ESCOLA II - A',
    );
  });
});
