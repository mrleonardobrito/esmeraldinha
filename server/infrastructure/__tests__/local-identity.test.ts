import { DatabaseSync } from 'node:sqlite';

import { beforeEach, describe, expect, it } from 'vitest';

import { definirSenha } from '../../conta/store';
import type { EncryptionPort } from '../../encryption';
import { SCHEMA, migrate } from '../../professores/db';
import { createProfessor, setProfessorAcesso } from '../../professores/store';
import { createLocalIdentityInfrastructure } from '../local';
import { createMemorySessions } from '../sessions';

const encryption: EncryptionPort = {
  encrypt: async (plain) => Buffer.from(plain, 'utf8'),
  decrypt: async (cipher) => cipher.toString('utf8'),
};

let db: DatabaseSync;

function infrastructure() {
  return createLocalIdentityInfrastructure({
    db: () => db,
    encryption: () => encryption,
    conta: { login: 'auxiliar', senhaTemporaria: 'temporaria' },
  });
}

describe('local identity infrastructure', () => {
  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(SCHEMA);
    migrate(db);
  });

  it('creates the conta on the first sign-in with the senha temporária, then accepts only the definitive one', async () => {
    const { provider, repository } = infrastructure();

    expect(await provider.authenticate({ login: 'auxiliar', senha: 'errada' })).toBeNull();
    const first = await provider.authenticate({ login: 'auxiliar', senha: 'temporaria' });
    expect(first).not.toBeNull();

    const user = await repository.findBySubject(first!.subject);
    expect(user).toMatchObject({ papel: 'auxiliar de ensino', status: 'active', mustChangePassword: true });

    await definirSenha(db, user!.id, 'senha-definitiva');
    expect(await provider.authenticate({ login: 'auxiliar', senha: 'temporaria' })).toBeNull();
    const second = await provider.authenticate({ login: 'auxiliar', senha: 'senha-definitiva' });
    expect(second?.subject).toBe(first!.subject);
    expect(await repository.findById(user!.id)).toMatchObject({ mustChangePassword: false });
  });

  it('verifies the professor CPF and portal senha but leaves the access decision to the core', async () => {
    const { provider, repository } = infrastructure();
    const professor = await createProfessor(db, encryption, {
      nome: 'Maria',
      login: '52998224725',
      senha: 'senha-do-portal',
      escola: 'Escola',
    });

    expect(await provider.authenticate({ login: '529.982.247-25', senha: 'errada' })).toBeNull();
    expect(await provider.authenticate({ login: '00000000000', senha: 'senha-do-portal' })).toBeNull();

    const verified = await provider.authenticate({ login: '529.982.247-25', senha: 'senha-do-portal' });
    expect(await repository.findBySubject(verified!.subject)).toMatchObject({
      id: professor.id,
      papel: 'professor',
      professorId: professor.id,
      status: 'suspended',
    });

    setProfessorAcesso(db, professor.id, true);
    expect(await repository.findByProfessor(professor.id)).toMatchObject({ status: 'active' });
    expect(await repository.findById('desconhecido')).toBeNull();
    expect(await repository.findBySubject('outro:id')).toBeNull();
  });
});

describe('memory sessions', () => {
  it('expires idle sessions and renews active ones', () => {
    let now = 0;
    const sessions = createMemorySessions({ idleMs: 100, now: () => now });
    const identidade = { papel: 'auxiliar de ensino', contaId: 'c' } as const;
    const token = sessions.open({ userId: 'c', identidade });

    now = 90;
    expect(sessions.read(token)).toEqual({ userId: 'c', identidade });
    now = 180;
    expect(sessions.read(token)).not.toBeNull();
    now = 400;
    expect(sessions.read(token)).toBeNull();
  });

  it('closes every session of a user except the current one', () => {
    const sessions = createMemorySessions({ idleMs: 1000 });
    const identidade = { papel: 'auxiliar de ensino', contaId: 'c' } as const;
    const current = sessions.open({ userId: 'c', identidade });
    const other = sessions.open({ userId: 'c', identidade });

    sessions.closeForUser('c', current);
    expect(sessions.read(current)).not.toBeNull();
    expect(sessions.read(other)).toBeNull();
  });
});
