import type { MiddlewareHandler } from 'hono';

import { getDb } from '../professores/db';
import { lerConta, type Conta } from './store';
import { usarSessao } from './sessoes';

/** O que a autenticação deixa no contexto para as rotas protegidas. */
export interface ContaEnv {
  Variables: {
    conta: Conta;
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
export const exigirSessao: MiddlewareHandler<ContaEnv> = async (context, next) => {
  const token = lerToken(context.req.header('Authorization'));
  const contaId = token ? usarSessao(token) : null;

  if (!token || !contaId) return context.json({ error: SEM_SESSAO }, 401);

  const conta = lerConta(getDb());
  if (!conta || conta.id !== contaId) {
    return context.json({ error: SEM_SESSAO }, 401);
  }

  context.set('conta', conta);
  context.set('token', token);

  await next();
};

/**
 * Enquanto a senha temporária ainda for a senha da conta, a sessão só serve
 * para trocá-la: uma senha que mora num arquivo de ambiente não é segredo
 * suficiente para abrir o resto do app.
 */
export const exigirSenhaDefinitiva: MiddlewareHandler<ContaEnv> = async (
  context,
  next,
) => {
  if (context.get('conta').precisaTrocarSenha) {
    return context.json({ error: PRIMEIRO_ACESSO }, 403);
  }

  await next();
};
