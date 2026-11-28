import type { MiddlewareHandler } from 'hono';

import { getDb } from '../professores/db';
import { lerConta, type Conta } from './store';
import { getProfessor, type Professor } from '../professores/store';
import {
  isAuxiliarDeEnsino,
  type IdentidadeDaSessao,
  type IdentityService,
} from '../modules/identity';

/** O que a autenticação deixa no contexto para as rotas protegidas. */
export interface ContaEnv {
  Variables: {
    identidade: IdentidadeDaSessao;
    conta?: Conta;
    professor?: Professor;
    /** O token desta sessão, para sair e para poupá-la ao trocar a senha. */
    token: string;
  };
}

const SEM_SESSAO = 'Entre com a sua conta para continuar.';
const PRIMEIRO_ACESSO = 'Defina a sua senha definitiva para continuar.';

function lerToken(header: string | undefined): string | null {
  const [esquema, token] = (header ?? '').split(' ');
  return esquema === 'Bearer' && token ? token : null;
}

/**
 * Barra quem não entrou. Vale para tudo que toca dados dos professores: as
 * credenciais deles estão aqui dentro porque o portal não tem acesso
 * delegado, e não é o app que decide quem pode lê-las — é o login.
 */
export function createExigirSessao(identity: IdentityService): MiddlewareHandler<ContaEnv> {
  return async (context, next) => {
    const token = lerToken(context.req.header('Authorization'));
    const resolved = token ? await identity.resolveSession(token) : null;
    if (!token || !resolved) return context.json({ error: SEM_SESSAO }, 401);

    const { identidade } = resolved;
    if (identidade.papel === 'auxiliar de ensino') {
      const conta = lerConta(getDb());
      if (!conta) return context.json({ error: SEM_SESSAO }, 401);
      context.set('conta', conta);
    } else {
      const professor = getProfessor(getDb(), identidade.professorId);
      if (!professor) return context.json({ error: SEM_SESSAO }, 401);
      context.set('professor', professor);
    }

    context.set('identidade', identidade);
    context.set('token', token);

    await next();
  };
}

/**
 * Enquanto a senha temporária ainda for a senha da conta, a sessão só serve
 * para trocá-la: uma senha que mora num arquivo de ambiente não é segredo
 * suficiente para abrir o resto do app.
 */
export const exigirSenhaDefinitiva: MiddlewareHandler<ContaEnv> = async (
  context,
  next,
) => {
  const conta = context.get('conta');
  if (conta?.precisaTrocarSenha) {
    return context.json({ error: PRIMEIRO_ACESSO }, 403);
  }

  await next();
};

/** Operações de gestão pertencem exclusivamente ao auxiliar de ensino. */
export const exigirAuxiliarDeEnsino: MiddlewareHandler<ContaEnv> = async (context, next) => {
  if (!isAuxiliarDeEnsino(context.get('identidade'))) {
    return context.json({ error: 'Esta ação é exclusiva do auxiliar de ensino.' }, 403);
  }
  await next();
};
