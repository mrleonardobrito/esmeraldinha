import type { Context } from 'hono';
import { z } from 'zod';
import { env } from '../env';
import {
  abrirSessao,
  encerrarSessao,
  usarSessao,
  type IdentidadeDaSessao,
} from '../conta/sessoes';
import { AuthFailure, type AuthSession } from '../conta/supabase';
import type { ContaEnv } from '../conta/autenticacao';

const contaSchema = z
  .object({
    id: z.string(),
    login: z.string(),
    nome: z.string(),
    email: z.string(),
    imagem: z.string().nullable(),
    papel: z.enum(['auxiliar de ensino', 'professor']),
    precisaTrocarSenha: z.boolean(),
    professorId: z.string().optional(),
    escola: z.string().optional(),
    acessoPorCodigo: z.boolean().optional(),
  })
  .passthrough();
export type RemoteConta = z.infer<typeof contaSchema>;
const sessions = new WeakMap<
  AuthSession,
  { token: string; conta: RemoteConta }
>();

export function hostedUrl(path: string): URL {
  let root: URL;
  try {
    root = new URL(env.dataApiUrl);
  } catch {
    throw new AuthFailure('Configure o endereço da API de dados.', 503);
  }
  if (
    root.username ||
    root.password ||
    root.search ||
    root.hash ||
    (root.protocol !== 'https:' &&
      !(
        root.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(root.hostname)
      ))
  )
    throw new AuthFailure(
      'O acesso desta instalação precisa ser configurado.',
      503,
    );
  return new URL(`${root.toString().replace(/\/$/, '')}${path}`);
}

export async function hostedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(hostedUrl(path), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if (error instanceof AuthFailure) throw error;
    throw new AuthFailure(
      'Não foi possível acessar sua conta. Verifique a conexão e tente novamente.',
      503,
    );
  }
}

export function remoteToken(provider: AuthSession): string | undefined {
  return sessions.get(provider)?.token;
}

export async function readRemoteConta(
  provider: AuthSession,
): Promise<RemoteConta | undefined> {
  const remote = sessions.get(provider);
  if (!remote) return undefined;
  const response = await hostedFetch('/api/conta', {
    headers: { Authorization: `Bearer ${remote.token}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new AuthFailure('Entre novamente para continuar.', 401);
    throw new AuthFailure(
      'Não foi possível acessar sua conta. Tente novamente.',
      503,
    );
  }
  const parsed = contaSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new AuthFailure('A API devolveu uma conta inválida.', 503);
  remote.conta = parsed.data;
  return parsed.data;
}

function openRemoteSession(token: string, conta: RemoteConta): string {
  const provider: AuthSession = {
    userId: conta.id,
    email: conta.email,
    emailVerified: true,
    async accessToken() {
      return token;
    },
    async changeSenha() {
      throw new Error('Use the hosted conta endpoint.');
    },
    async signOut() {
      await hostedFetch('/api/conta/sair', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
  sessions.set(provider, { token, conta });
  const identity: IdentidadeDaSessao =
    conta.papel === 'professor'
      ? { papel: 'professor', professorId: conta.professorId!, authRevision: 0 }
      : { papel: 'auxiliar de ensino', contaId: conta.id };
  return abrirSessao(
    identity,
    provider,
    conta.precisaTrocarSenha ? 'recovery' : 'full',
  );
}

/** Provider sessions and hosted app tokens never enter the renderer. */
export async function proxyConta(
  context: Context<ContaEnv>,
): Promise<Response> {
  const path = new URL(context.req.url).pathname;
  const localToken = context.req
    .header('Authorization')
    ?.match(/^Bearer (\S+)$/)?.[1];
  const local = localToken ? await usarSessao(localToken) : null;
  if (path.endsWith('/sair') && localToken) {
    await encerrarSessao(localToken);
    return new Response(null, { status: 204 });
  }
  const token = local && remoteToken(local.provider);
  const body = ['GET', 'HEAD'].includes(context.req.method)
    ? undefined
    : await context.req.text();
  const response = await hostedFetch(path, {
    method: context.req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (path.endsWith('/sair') && localToken) await encerrarSessao(localToken);
  if (response.status === 204) return new Response(null, { status: 204 });
  const value = (await response
    .json()
    .catch(() => ({
      error: 'A API devolveu uma resposta inválida.',
    }))) as Record<string, unknown>;
  if (response.ok && typeof value.token === 'string') {
    const conta = contaSchema.safeParse(value.conta ?? value);
    if (!conta.success)
      throw new AuthFailure('A API devolveu uma conta inválida.', 503);
    if (localToken) await encerrarSessao(localToken);
    value.token = openRemoteSession(value.token, conta.data);
  }
  return Response.json(value, { status: response.status });
}

export async function proxyProfessores(
  context: Context<ContaEnv>,
): Promise<Response> {
  const token = remoteToken(context.get('sessao').provider);
  if (!token) throw new AuthFailure('Entre novamente para continuar.', 401);
  const body = ['GET', 'HEAD'].includes(context.req.method)
    ? undefined
    : await context.req.text();
  if (context.req.method === 'PUT') {
    const input = JSON.parse(body ?? '{}') as {
      liberado?: boolean;
      login?: string;
      senha?: string;
      escola?: string;
    };
    const id = new URL(context.req.url).pathname.match(
      /^\/api\/professores\/([^/]+)/,
    )?.[1];
    if (id && (input.liberado || input.login)) {
      const { lerCredenciaisDoProfessor } = await import(
        '../professores/credenciais'
      );
      const stored = await lerCredenciaisDoProfessor(id);
      if (
        stored &&
        (input.liberado ||
          input.senha ||
          input.login !== stored.login ||
          input.escola !== stored.escola)
      ) {
        const { openSession, closeSession } = await import(
          '../portal-sessions'
        );
        const { LoginError } = await import('../scrape/errors');
        try {
          const browser = await openSession({
            login: input.login ?? stored.login,
            senha: input.senha || stored.senha,
            escola: input.escola ?? stored.escola,
          });
          await closeSession(browser.id);
        } catch (error) {
          if (error instanceof LoginError)
            throw new AuthFailure(
              'As credenciais do professor precisam ser atualizadas no portal.',
              422,
            );
          throw new AuthFailure(
            'Não foi possível conferir as credenciais no portal.',
            503,
          );
        }
      }
    }
  }
  const response = await hostedFetch(
    `${new URL(context.req.url).pathname}${new URL(context.req.url).search}`,
    {
      method: context.req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
