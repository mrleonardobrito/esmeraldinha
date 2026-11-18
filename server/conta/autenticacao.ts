import type { MiddlewareHandler } from 'hono';

import { getDb } from '../professores/db';
import { lerConta, lerVinculoDaConta, type Conta } from './store';
import { getProfessor, type Professor } from '../professores/store';
import { encerrarSessao, naSessaoDoAuxiliar, usarSessao, type IdentidadeDaSessao, type SessaoDaEsmeraldinha } from './sessoes';
import { AuthFailure, type AuthProvider } from './supabase';

/** O que a autenticação deixa no contexto para as rotas protegidas. */
export interface ContaEnv {
  Variables: {
    auth: AuthProvider;
    sessao: SessaoDaEsmeraldinha;
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
export const exigirSessao: MiddlewareHandler<ContaEnv> = async (context, next) => {
  const token = lerToken(context.req.header('Authorization'));
  let sessao: SessaoDaEsmeraldinha | null = null;
  try { sessao = token ? await usarSessao(token) : null; }
  catch (error) {
    if (error instanceof AuthFailure && error.status === 401 && token) void encerrarSessao(token);
    throw error;
  }

  if (!token || !sessao) return context.json({ error: SEM_SESSAO }, 401);
  const identidade = sessao.identidade;

  if (identidade.papel === 'auxiliar de ensino') {
    const conta = lerConta(getDb());
    if (!conta || conta.id !== identidade.contaId || lerVinculoDaConta(getDb())?.id !== sessao.provider.userId) return context.json({ error: SEM_SESSAO }, 401);
    context.set('conta', conta);
  } else {
    const professor = getProfessor(getDb(), identidade.professorId);
    if (!professor) return context.json({ error: SEM_SESSAO }, 401);
    const binding = getDb().prepare('SELECT supabase_auth_id, auth_sync_status, auth_revision FROM professores WHERE id = ?').get(professor.id) as { supabase_auth_id: string; auth_sync_status: string; auth_revision: number };
    if (!professor.acessoLiberado || binding.auth_sync_status !== 'ready' || binding.auth_revision !== identidade.authRevision || binding.supabase_auth_id !== sessao.provider.userId) {
      void encerrarSessao(token);
      return context.json({ error: 'O acesso do professor foi suspenso. Procure o auxiliar de ensino.' }, 403);
    }
    context.set('professor', professor);
  }

  context.set('identidade', identidade);
  context.set('token', token);
  context.set('sessao', sessao);

  await naSessaoDoAuxiliar(token, next);
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
  const conta = context.get('conta');
  if (conta?.precisaTrocarSenha || context.get('sessao').purpose !== 'full') {
    return context.json({ error: PRIMEIRO_ACESSO }, 403);
  }

  await next();
};

/** Operações de gestão pertencem exclusivamente ao auxiliar de ensino. */
export const exigirAuxiliarDeEnsino: MiddlewareHandler<ContaEnv> = async (context, next) => {
  if (context.get('identidade').papel !== 'auxiliar de ensino') {
    return context.json({ error: 'Esta ação é exclusiva do auxiliar de ensino.' }, 403);
  }
  await next();
};
