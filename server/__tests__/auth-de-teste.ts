import { vi } from 'vitest';
import type { AuthProvider, AuthSession } from '../conta/supabase';

export const INITIAL_SENHA = 'senha-inicial-de-teste';
export const AUXILIAR_ID = '00000000-0000-4000-8000-000000000001';
export const AUXILIAR_EMAIL = 'auxiliar@example.test';

export function authDeTeste() {
  const identities = new Map([[AUXILIAR_EMAIL, { id: AUXILIAR_ID, senha: INITIAL_SENHA }]]);
  const active = new Set<{ ended: boolean; userId: string }>();
  function session(email: string): AuthSession {
    const user = identities.get(email)!;
    const state = { ended: false, userId: user.id };
    active.add(state);
    return {
      userId: user.id, email, emailVerified: true,
      accessToken: vi.fn(async () => {
        if (state.ended) throw new (await import('../conta/supabase')).AuthFailure('Sessão encerrada.', 401);
        return `verified-token-for-${user.id}`;
      }),
      changeSenha: vi.fn(async (senha) => { user.senha = senha; }),
      signOut: vi.fn(async (scope) => {
        for (const other of active) if (other.userId === user.id && (scope === 'local' ? other === state : other !== state)) other.ended = true;
      }),
    };
  }
  const provider = {
    auxiliarId: AUXILIAR_ID, auxiliarEmail: AUXILIAR_EMAIL, configured: true,
    signIn: vi.fn(async (email: string, senha: string) => {
      if (identities.get(email)?.senha !== senha) throw new (await import('../conta/supabase')).AuthFailure('Credenciais inválidas.', 401);
      return session(email);
    }),
    sendCode: vi.fn(async () => {}),
    verifyCode: vi.fn(async (code: string, email = AUXILIAR_EMAIL) => {
      if (code !== '123456' || !identities.has(email)) throw new (await import('../conta/supabase')).AuthFailure('Código inválido.', 401);
      return session(email);
    }),
    administer: vi.fn<AuthProvider['administer']>(async () => { throw new (await import('../conta/supabase')).AuthFailure('Serviço não configurado no teste.', 503); }),
    identities,
    session,
  } satisfies AuthProvider & { identities: typeof identities; session: typeof session };
  return provider;
}
