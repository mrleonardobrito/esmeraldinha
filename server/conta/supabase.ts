import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { env } from '../env';

export class AuthFailure extends Error {
  constructor(message: string, readonly status: 400 | 401 | 403 | 409 | 422 | 429 | 503) {
    super(message);
    this.name = 'AuthFailure';
  }
}

export interface AuthSession {
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  accessToken(): Promise<string>;
  changeSenha(senha: string, senhaAtual?: string): Promise<void>;
  signOut(scope: 'local' | 'others'): Promise<void>;
}

export interface AuthProvider {
  readonly auxiliarId: string;
  readonly auxiliarEmail: string;
  readonly configured: boolean;
  signIn(email: string, senha: string): Promise<AuthSession>;
  sendCode(email?: string, purpose?: 'setup' | 'recovery'): Promise<void>;
  verifyCode(code: string, email?: string): Promise<AuthSession>;
  administer(session: AuthSession, input: Record<string, unknown>): Promise<{ id: string; email: string; verified: boolean }>;
}

const configuration = z.object({
  url: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  }),
  publishableKey: z.string().startsWith('sb_publishable_'),
  auxiliarId: z.uuid(),
  auxiliarEmail: z.email(),
  adminUrl: z.string().optional(),
});

type Configuration = z.infer<typeof configuration>;

/** The desktop is a public client, including its Node main process. */
export function createAuthProvider(input: Configuration = env.supabase): AuthProvider {
  const parsed = configuration.safeParse(input);
  function config(): Configuration {
    if (!parsed.success) throw new AuthFailure('Configure a autenticação do Supabase nesta instalação.', 503);
    return parsed.data;
  }
  function client(): SupabaseClient {
    const settings = config();
    return createClient(settings.url, settings.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, {
        ...init,
        redirect: 'error',
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
      }) },
    });
  }

  async function checked<T extends { error: unknown }>(work: () => Promise<T>): Promise<T extends { data: infer D } ? D : undefined> {
    try {
      const result = await work();
      if (result.error) throw providerFailure(result.error);
      return ('data' in result ? result.data : undefined) as T extends { data: infer D } ? D : undefined;
    } catch (error) {
      if (error instanceof AuthFailure) throw error;
      throw providerFailure(error);
    }
  }

  function wrap(sdk: SupabaseClient, initial: Session): AuthSession {
    let current = initial;
    let ended = false;
    let refreshing: Promise<void> | undefined;
    const userId = initial.user.id;
    async function accessToken(): Promise<string> {
      if (ended) throw new AuthFailure('Entre novamente para continuar.', 401);
      if ((current.expires_at ?? 0) * 1000 <= Date.now() + 10_000) {
        refreshing ??= (async () => {
          // The SDK owns the in-memory refresh token. Read its renewed token here,
          // then verify the JWT below; getSession is never an authorization proof.
          const data = await checked(() => sdk.auth.getSession());
          if (!data.session || data.session.user.id !== userId) throw new AuthFailure('Entre novamente para continuar.', 401);
          current = data.session;
        })().finally(() => { refreshing = undefined; });
        await refreshing;
      }
      const data = await checked(() => sdk.auth.getClaims(current.access_token));
      const expectedIssuer = `${config().url.replace(/\/$/, '')}/auth/v1`;
      const audience = data?.claims.aud;
      if (!data || data.claims.sub !== userId || data.claims.iss !== expectedIssuer || !(audience === 'authenticated' || (Array.isArray(audience) && audience.includes('authenticated'))) || ended) throw new AuthFailure('Entre novamente para continuar.', 401);
      return current.access_token;
    }
    return {
      userId,
      email: initial.user.email?.toLowerCase() ?? '',
      emailVerified: Boolean(initial.user.email_confirmed_at),
      accessToken,
      async changeSenha(senha, senhaAtual) {
        await accessToken();
        await checked(() => sdk.auth.updateUser({ password: senha, ...(senhaAtual ? { current_password: senhaAtual } : {}) }));
      },
      async signOut(scope) {
        if (scope === 'local') ended = true;
        await checked(() => sdk.auth.signOut({ scope }));
      },
    };
  }

  return {
    auxiliarId: input.auxiliarId,
    auxiliarEmail: input.auxiliarEmail.toLowerCase(),
    configured: parsed.success,
    async signIn(email, senha) {
      const sdk = client();
      await checked(() => sdk.auth.initialize());
      const data = await checked(() => sdk.auth.signInWithPassword({ email, password: senha }));
      if (!data.session) throw new AuthFailure('Login ou senha incorretos.', 401);
      return wrap(sdk, data.session);
    },
    async sendCode(email, purpose = email ? 'setup' : 'recovery') {
      const sdk = client();
      const destination = email ?? config().auxiliarEmail;
      // Passwordless signup can clear an unconfirmed identity's existing senha.
      // Resend its confirmation instead, preserving the synchronized portal senha.
      if (purpose === 'setup') await checked(() => sdk.auth.resend({ type: 'signup', email: destination }));
      else await checked(() => sdk.auth.signInWithOtp({ email: destination, options: { shouldCreateUser: false } }));
    },
    async verifyCode(code, email) {
      const sdk = client();
      await checked(() => sdk.auth.initialize());
      const data = await checked(() => sdk.auth.verifyOtp({ email: email ?? config().auxiliarEmail, token: code, type: 'email' }));
      if (!data.session) throw new AuthFailure('Código inválido ou expirado.', 401);
      const remote = wrap(sdk, data.session);
      if (!email && remote.userId !== config().auxiliarId) {
        await remote.signOut('local').catch(() => {});
        throw new AuthFailure('Esta identidade não tem acesso a esta instalação.', 403);
      }
      return remote;
    },
    async administer(session, body) {
      const settings = config();
      if (!settings.adminUrl) throw new AuthFailure('Configure o serviço de acesso dos professores.', 503);
      if (!URL.canParse(settings.adminUrl)) throw new AuthFailure('Configure um endereço válido para o serviço de acesso.', 503);
      const url = new URL(settings.adminUrl);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
        throw new AuthFailure('O serviço de acesso precisa usar HTTPS.', 503);
      }
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await session.accessToken()}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
      } catch (error) {
        if (error instanceof AuthFailure) throw error;
        throw new AuthFailure('O serviço de acesso não respondeu. Tente novamente.', 503);
      }
      if (!response.ok) {
        if (response.status === 429) throw new AuthFailure('Aguarde antes de tentar novamente.', 429);
        if (response.status === 409) throw new AuthFailure('O acesso precisa ser reconciliado pelo auxiliar de ensino.', 409);
        if (response.status === 403) throw new AuthFailure('Esta ação não está autorizada.', 403);
        if (response.status === 422) throw new AuthFailure('Confira o e-mail e os requisitos da senha do portal na autenticação.', 422);
        throw new AuthFailure('Não foi possível sincronizar o acesso. Tente novamente.', 503);
      }
      const result = z.object({ id: z.uuid(), email: z.email(), verified: z.boolean() }).safeParse(await response.json().catch(() => null));
      if (!result.success) throw new AuthFailure('O serviço devolveu uma resposta inválida.', 503);
      return result.data;
    },
  };
}

function providerFailure(error: unknown): AuthFailure {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (typeof code === 'string' && ['same_password', 'weak_password', 'reauthentication_needed', 'reauthentication_not_valid'].includes(code)) return new AuthFailure('Escolha outra senha ou confirme novamente o acesso.', 422);
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
  if (status === 429) return new AuthFailure('Muitas tentativas. Aguarde antes de tentar novamente.', 429);
  if (status === 400 || status === 401 || status === 403) return new AuthFailure('Login, senha ou código inválido.', 401);
  if (status === 422) return new AuthFailure('A senha não atende aos requisitos da autenticação.', 422);
  return new AuthFailure('A autenticação não respondeu. Tente novamente em instantes.', 503);
}
