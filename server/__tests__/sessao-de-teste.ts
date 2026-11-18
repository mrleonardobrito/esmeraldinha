import type { Hono } from 'hono';
import type { ContaEnv } from '../conta/autenticacao';
import { INITIAL_SENHA } from './auth-de-teste';
export { authDeTeste } from './auth-de-teste';

/** Definitive senha used by the injected test provider. */
export const SENHA_DE_TESTE = 'senha-de-teste';

/**
 * O que as rotas protegidas veem: o mesmo `app.fetch`, com o token de uma
 * sessão do auxiliar de ensino já pronta em cada requisição. Cada teste que
 * exercita outra rota passa por aqui em vez de repetir o login.
 */
export interface AppAutenticado {
  fetch: (request: Request) => Promise<Response>;
  token: string;
}

/** Authenticates through the injected provider and completes primeiro acesso. */
export async function autenticar(app: Hono<ContaEnv>): Promise<AppAutenticado> {
  const { env } = await import('../env');

  const entrada = await app.fetch(
    new Request('http://localhost/api/conta/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: env.conta.login,
        senha: INITIAL_SENHA,
      }),
    }),
  );

  let { token } = (await entrada.json()) as { token: string };
  if (entrada.status !== 200) throw new Error(`Test entry failed: ${entrada.status}`);

  const changed = await app.fetch(
    new Request('http://localhost/api/conta/senha', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        senhaAtual: INITIAL_SENHA,
        senha: SENHA_DE_TESTE,
      }),
    }),
  );
  if (changed.status !== 200) throw new Error(`Test senha change failed: ${changed.status}`);
  token = ((await changed.json()) as { token: string }).token;

  return {
    token,
    fetch: async (request) => {
      const autenticada = new Request(request);
      autenticada.headers.set('Authorization', `Bearer ${token}`);
      return app.fetch(autenticada);
    },
  };
}
