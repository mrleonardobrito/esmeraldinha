import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fora de produção `env.redisEmMemoria` já escolhe o `ioredis-mock` sozinho
 * — é o próprio Map em memória do módulo que este teste teria que fingir.
 * Então aqui é a implementação real do `ioredis-mock` que roda, e o que se
 * confere é o comportamento observável: o que foi salvo, o TTL, a
 * invalidação e a resiliência a falha.
 */

const professorId = 'prof-1';

describe('sessoes-redis', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    const { fecharConexaoRedis } = await import('../sessoes-redis');
    await fecharConexaoRedis();
  });

  it('salva os metadados da sessão, sem a Page nem o BrowserContext', async () => {
    const { salvarSessao, lerSessao } = await import('../sessoes-redis');

    await salvarSessao(
      {
        id: 'sessao-1',
        professorId,
        login: 'maria',
        escola: 'Escola Municipal',
        createdAt: 1_700_000_000_000,
      },
      60_000,
    );

    await expect(lerSessao('sessao-1')).resolves.toEqual({
      id: 'sessao-1',
      professorId,
      login: 'maria',
      escola: 'Escola Municipal',
      createdAt: 1_700_000_000_000,
    });
  });

  it('expira sozinha depois do TTL', async () => {
    const { salvarSessao, lerSessao } = await import('../sessoes-redis');

    await salvarSessao(
      { id: 'sessao-1', professorId, login: 'maria', escola: 'Escola', createdAt: 0 },
      50,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect(lerSessao('sessao-1')).resolves.toBeUndefined();
  });

  it('renova o TTL sem apagar o valor', async () => {
    const { salvarSessao, renovarSessao, lerSessao } = await import(
      '../sessoes-redis'
    );

    await salvarSessao(
      { id: 'sessao-1', professorId, login: 'maria', escola: 'Escola', createdAt: 0 },
      50,
    );
    await renovarSessao('sessao-1', 500);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect(lerSessao('sessao-1')).resolves.toMatchObject({
      id: 'sessao-1',
    });
  });

  it('apaga o registro ao invalidar', async () => {
    const { salvarSessao, invalidarSessao, lerSessao } = await import(
      '../sessoes-redis'
    );

    await salvarSessao(
      { id: 'sessao-1', professorId, login: 'maria', escola: 'Escola', createdAt: 0 },
      60_000,
    );
    await expect(lerSessao('sessao-1')).resolves.not.toBeUndefined();

    await invalidarSessao('sessao-1');

    await expect(lerSessao('sessao-1')).resolves.toBeUndefined();
  });

  it('não derruba a chamada quando o Redis (real) falha', async () => {
    vi.stubEnv('REDIS_EM_MEMORIA', 'false');
    vi.doMock('ioredis', () => {
      class RedisComFalha {
        async set() {
          throw new Error('conexão recusada');
        }
        async pexpire() {
          throw new Error('conexão recusada');
        }
        async del() {
          throw new Error('conexão recusada');
        }
        on() {}
        async quit() {}
        disconnect() {}
      }
      return { Redis: RedisComFalha };
    });

    const { salvarSessao, renovarSessao, invalidarSessao } = await import(
      '../sessoes-redis'
    );

    await expect(
      salvarSessao(
        { id: 'x', professorId, login: 'maria', escola: 'Escola', createdAt: 0 },
        1_000,
      ),
    ).resolves.toBeUndefined();
    await expect(renovarSessao('x')).resolves.toBeUndefined();
    await expect(invalidarSessao('x')).resolves.toBeUndefined();

    vi.unstubAllEnvs();
  });
});
