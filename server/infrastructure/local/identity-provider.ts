import type { DatabaseSync } from 'node:sqlite';

import { textoConfere } from '../../conta/senhas';
import { conferirSenhaDefinitiva, criarConta, lerConta } from '../../conta/store';
import type { EncryptionPort } from '../../encryption';
import type { IdentityProvider } from '../../modules/identity';
import { conferirSenhaDoProfessor, getProfessorPorLogin } from '../../professores/store';
import { onlyDigits } from '../../../shared/professor';
import { contaSubject, professorSubject } from './identity-repository';
import { createProfessorEnrollment } from './professor-enrollment';

export interface LocalIdentityConfig {
  db: () => DatabaseSync;
  encryption: () => EncryptionPort;
  conta: { login: string; senhaTemporaria: string };
}

/**
 * The conta do auxiliar de ensino is born on the first sign-in with the
 * senha temporária from the environment; afterwards only its hash counts.
 */
export function createLocalIdentityProvider(config: LocalIdentityConfig): IdentityProvider {
  const enrollment = createProfessorEnrollment(config.db, config.conta.login);
  return {
    issueEnrollment: enrollment.issue,
    completeEnrollment: enrollment.complete,
    async authenticate({ login, senha }) {
      const db = config.db();
      const existing = lerConta(db);
      const expectedLogin = existing?.login ?? config.conta.login;

      if (textoConfere(login, expectedLogin)) {
        const valid = existing?.precisaTrocarSenha === false
          ? await conferirSenhaDefinitiva(db, senha)
          : textoConfere(senha, config.conta.senhaTemporaria);
        if (!valid) return null;
        return { subject: contaSubject((existing ?? criarConta(db, config.conta.login)).id) };
      }

      if (login.includes('@')) {
        const professorId = await enrollment.authenticate(login, senha);
        return professorId ? { subject: professorSubject(professorId) } : null;
      }

      // Compatibility only for professors not yet migrated. Once a link is
      // issued, CPF and portal senha can never authenticate that professor again.
      // Professor logins are CPFs. The cadastro persists only digits, while
      // people commonly type the formatted value shown in the portal.
      const cpf = onlyDigits(login);
      // Avoid initializing the encryption adapter for an unknown login: a
      // fresh install may not have its key yet.
      const legacy = getProfessorPorLogin(db, cpf);
      if (!legacy || db.prepare('SELECT 1 FROM professor_accounts WHERE professor_id = ?').get(legacy.id)) return null;

      const professor = await conferirSenhaDoProfessor(db, config.encryption(), cpf, senha);
      return professor && !db.prepare('SELECT 1 FROM professor_accounts WHERE professor_id = ?').get(professor.id)
        ? { subject: professorSubject(professor.id) } : null;
    },
  };
}
