import type { Hono } from 'hono';

/**
 * A senha definitiva que os testes usam depois do primeiro acesso. Qualquer
 * uma serve, desde que não seja a temporária.
 */
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

/** Entra com a senha temporária, define a definitiva e devolve a sessão pronta. */
export async function autenticar(app: Hono): Promise<AppAutenticado> {
  const { env } = await import('../env');

  const entrada = await app.fetch(
    new Request('http://localhost/api/conta/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: env.conta.login,
        senha: env.conta.senhaTemporaria,
      }),
    }),
  );

  const { token } = (await entrada.json()) as { token: string };

  await app.fetch(
    new Request('http://localhost/api/conta/senha', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        senhaAtual: env.conta.senhaTemporaria,
        senha: SENHA_DE_TESTE,
      }),
    }),
  );

  return {
    token,
    fetch: async (request) => {
      const autenticada = new Request(request);
      autenticada.headers.set('Authorization', `Bearer ${token}`);
      return app.fetch(autenticada);
    },
  };
}
