import type { DatabaseSync } from 'node:sqlite';

import { lerConta } from '../../conta/store';
import type { IdentityRepository, InternalUser } from '../../modules/identity';
import { getProfessor } from '../../professores/store';

const CONTA_SUBJECT = 'conta:';
const PROFESSOR_SUBJECT = 'professor:';

export function contaSubject(contaId: string): string {
  return `${CONTA_SUBJECT}${contaId}`;
}

export function professorSubject(professorId: string): string {
  return `${PROFESSOR_SUBJECT}${professorId}`;
}

/** Maps the existing SQLite conta and professores to the core's internal users, keeping their IDs. */
export function createLocalIdentityRepository(db: () => DatabaseSync): IdentityRepository {
  function auxiliar(contaId: string): InternalUser | null {
    const conta = lerConta(db());
    if (!conta || conta.id !== contaId) return null;
    return {
      id: conta.id,
      papel: 'auxiliar de ensino',
      contaId: conta.id,
      status: 'active',
      mustChangePassword: conta.precisaTrocarSenha,
    };
  }

  function professor(professorId: string): InternalUser | null {
    const found = getProfessor(db(), professorId);
    if (!found) return null;
    return {
      id: found.id,
      papel: 'professor',
      professorId: found.id,
      status: found.acessoLiberado ? 'active' : 'suspended',
      mustChangePassword: false,
    };
  }

  return {
    async findBySubject(subject) {
      if (subject.startsWith(CONTA_SUBJECT)) return auxiliar(subject.slice(CONTA_SUBJECT.length));
      if (subject.startsWith(PROFESSOR_SUBJECT)) return professor(subject.slice(PROFESSOR_SUBJECT.length));
      return null;
    },

    async findById(id) {
      return auxiliar(id) ?? professor(id);
    },

    async findByProfessor(professorId) {
      return professor(professorId);
    },
  };
}
