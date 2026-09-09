import { describe, expect, it } from 'vitest';

import { definesDoBuild, VARIAVEIS_DE_BUILD } from '../build-defines.mjs';

describe('definesDoBuild', () => {
  it('embute no bundle o que o ambiente informou', () => {
    expect(
      definesDoBuild({
        ESMERALDINHA_LOGIN: 'auxiliar-da-escola',
        ESMERALDINHA_SENHA_TEMPORARIA: 'senha-do-secret',
      }),
    ).toEqual({
      'process.env.ESMERALDINHA_LOGIN': '"auxiliar-da-escola"',
      'process.env.ESMERALDINHA_SENHA_TEMPORARIA': '"senha-do-secret"',
    });
  });

  /**
   * Um secret que não existe chega como string vazia no GitHub Actions.
   * Embuti-la apagaria o padrão do `server/env.ts` e ninguém entraria.
   */
  it('ignora a variável ausente ou vazia', () => {
    expect(definesDoBuild({ ESMERALDINHA_LOGIN: '', ESMERALDINHA_SENHA_TEMPORARIA: '  ' })).toEqual(
      {},
    );
    expect(definesDoBuild({})).toEqual({});
  });

  it('só toca nas variáveis da conta do auxiliar de ensino', () => {
    expect(VARIAVEIS_DE_BUILD).toEqual([
      'ESMERALDINHA_LOGIN',
      'ESMERALDINHA_SENHA_TEMPORARIA',
    ]);
    expect(definesDoBuild({ OPENROUTER_API_KEY: 'sk-teste' })).toEqual({});
  });
});
