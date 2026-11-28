import { describe, expect, it } from 'vitest';

import {
  canAccessProfessor,
  canReadFinancialValues,
  createIdentityService,
  isAuxiliarDeEnsino,
  type ApplicationSessions,
  type IdentidadeDaSessao,
  type InternalUser,
  type StoredSession,
} from '../index';

const auxiliar: IdentidadeDaSessao = { papel: 'auxiliar de ensino', contaId: 'conta-a' };
const professor: IdentidadeDaSessao = { papel: 'professor', professorId: 'professor-a' };

describe('identity access policy', () => {
  it('preserves management access in a single installation', () => {
    expect(isAuxiliarDeEnsino(auxiliar)).toBe(true);
    expect(canAccessProfessor(auxiliar, 'professor-b')).toBe(true);
    expect(canReadFinancialValues(auxiliar)).toBe(true);
  });

  it('restricts professores to their own resources and hides financial values', () => {
    expect(isAuxiliarDeEnsino(professor)).toBe(false);
    expect(canAccessProfessor(professor, 'professor-a')).toBe(true);
    expect(canAccessProfessor(professor, 'professor-b')).toBe(false);
    expect(canReadFinancialValues(professor)).toBe(false);
  });
});

function memorySessions(): ApplicationSessions & { size(): number } {
  const entries = new Map<string, StoredSession>();
  let next = 0;
  return {
    open(session) {
      const token = `token-${++next}`;
      entries.set(token, session);
      return token;
    },
    read: (token) => entries.get(token) ?? null,
    close: (token) => void entries.delete(token),
    closeForUser(userId, except) {
      for (const [token, session] of entries) {
        if (session.userId === userId && token !== except) entries.delete(token);
      }
    },
    size: () => entries.size,
  };
}

function setup() {
  const users = new Map<string, InternalUser>([
    ['conta-a', { id: 'conta-a', papel: 'auxiliar de ensino', contaId: 'conta-a', status: 'active', mustChangePassword: false }],
    ['professor-a', { id: 'professor-a', papel: 'professor', professorId: 'professor-a', status: 'active', mustChangePassword: false }],
  ]);
  const passwords = new Map([
    ['auxiliar', { senha: 'senha-boa', subject: 'conta-a' }],
    ['111', { senha: 'portal', subject: 'professor-a' }],
  ]);
  const sessions = memorySessions();
  const identity = createIdentityService({
    provider: {
      async authenticate({ login, senha }) {
        const entry = passwords.get(login);
        return entry?.senha === senha ? { subject: entry.subject } : null;
      },
    },
    repository: {
      findBySubject: async (subject) => users.get(subject) ?? null,
      findById: async (id) => users.get(id) ?? null,
      findByProfessor: async (professorId) =>
        [...users.values()].find((user) => user.papel === 'professor' && user.professorId === professorId) ?? null,
    },
    sessions,
  });

  function suspend(id: string) {
    users.set(id, { ...users.get(id)!, status: 'suspended' });
  }

  return { identity, sessions, users, suspend };
}

describe('identity service', () => {
  it('opens a session only for verified, active users', async () => {
    const { identity, suspend } = setup();

    expect(await identity.signIn({ login: 'auxiliar', senha: 'errada' })).toEqual({ status: 'invalid_credentials' });
    expect(await identity.signIn({ login: 'ninguem', senha: 'x' })).toEqual({ status: 'invalid_credentials' });

    const signedIn = await identity.signIn({ login: 'auxiliar', senha: 'senha-boa' });
    expect(signedIn).toMatchObject({ status: 'signed_in', identidade: auxiliar });

    suspend('professor-a');
    expect(await identity.signIn({ login: '111', senha: 'portal' })).toEqual({ status: 'access_denied' });
  });

  it('rechecks the stored user on every request and drops sessions of suspended users', async () => {
    const { identity, suspend, sessions } = setup();
    const result = await identity.signIn({ login: '111', senha: 'portal' });
    if (result.status !== 'signed_in') throw new Error('expected sign in');

    expect(await identity.resolveSession(result.token)).toMatchObject({ identidade: professor });

    suspend('professor-a');
    expect(await identity.resolveSession(result.token)).toBeNull();
    expect(sessions.size()).toBe(0);
  });

  it('rejects an unknown token and a user that no longer exists', async () => {
    const { identity, users } = setup();
    expect(await identity.resolveSession('nope')).toBeNull();

    const result = await identity.signIn({ login: 'auxiliar', senha: 'senha-boa' });
    if (result.status !== 'signed_in') throw new Error('expected sign in');
    users.delete('conta-a');
    expect(await identity.resolveSession(result.token)).toBeNull();
  });

  it('closes sessions on sign-out, password change and professor revocation', async () => {
    const { identity } = setup();
    const first = await identity.signIn({ login: 'auxiliar', senha: 'senha-boa' });
    const second = await identity.signIn({ login: 'auxiliar', senha: 'senha-boa' });
    const prof = await identity.signIn({ login: '111', senha: 'portal' });
    if (first.status !== 'signed_in' || second.status !== 'signed_in' || prof.status !== 'signed_in') {
      throw new Error('expected sign in');
    }

    identity.closeOtherSessions('conta-a', first.token);
    expect(await identity.resolveSession(first.token)).not.toBeNull();
    expect(await identity.resolveSession(second.token)).toBeNull();

    await identity.closeProfessorSessions('professor-a');
    expect(await identity.resolveSession(prof.token)).toBeNull();

    identity.signOut(first.token);
    expect(await identity.resolveSession(first.token)).toBeNull();
  });
});
