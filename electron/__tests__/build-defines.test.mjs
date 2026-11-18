import { describe, expect, it } from 'vitest';
import { definesDoBuild } from '../build-defines.mjs';

describe('desktop public configuration', () => {
  it('embeds the project and intended auxiliar identity', () => {
    expect(definesDoBuild({
      ESMERALDINHA_LOGIN: 'auxiliar-da-escola',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      SUPABASE_AUXILIAR_AUTH_ID: 'auxiliar-id',
    })).toEqual({
      'process.env.ESMERALDINHA_LOGIN': '"auxiliar-da-escola"',
      'process.env.SUPABASE_URL': '"https://example.supabase.co"',
      'process.env.SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_test"',
      'process.env.SUPABASE_AUXILIAR_AUTH_ID': '"auxiliar-id"',
    });
  });
  it('ignores absent settings without introducing shared senhas', () => {
    expect(definesDoBuild({ ESMERALDINHA_LOGIN: '', SUPABASE_URL: '  ' })).toEqual({});
    expect(definesDoBuild({})).toEqual({});
  });
  it('never embeds privileged keys or the old senha temporária', () => {
    expect(definesDoBuild({
      SUPABASE_SECRET_KEY: 'sb_secret_test',
      SUPABASE_SERVICE_ROLE_KEY: 'privileged-test-key',
      ESMERALDINHA_SENHA_TEMPORARIA: 'legacy-test-senha',
      OPENROUTER_API_KEY: 'model-test-key',
    })).toEqual({});
  });
  it('rejects a secret accidentally assigned to the publishable setting', () => {
    expect(() => definesDoBuild({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do-not-bundle' })).toThrow('must be a publishable key');
  });
});
