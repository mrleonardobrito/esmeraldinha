import type { DatabaseSync } from 'node:sqlite';

import { textoConfere } from '../../conta/senhas';
import { conferirSenhaDefinitiva, criarConta, lerConta } from '../../conta/store';
import type { EncryptionPort } from '../../encryption';
import type { IdentityProvider } from '../../modules/identity';
import { conferirSenhaDoProfessor, getProfessorPorLogin } from '../../professores/store';
import { onlyDigits } from '../../../shared/professor';
import { contaSubject, professorSubject } from './identity-repository';

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
  return {
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

      // Professor logins are CPFs. The cadastro persists only digits, while
      // people commonly type the formatted value shown in the portal.
      const cpf = onlyDigits(login);
      // Avoid initializing the encryption adapter for an unknown login: a
      // fresh install may not have its key yet.
      if (!getProfessorPorLogin(db, cpf)) return null;

      const professor = await conferirSenhaDoProfessor(db, config.encryption(), cpf, senha);
      return professor ? { subject: professorSubject(professor.id) } : null;
    },
  };
}
