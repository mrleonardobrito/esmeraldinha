import { Redis } from 'ioredis';
import RedisEmMemoria from 'ioredis-mock';

import { env } from './env';

/**
 * O que sobra de uma `PortalSession` depois de tirar a `Page` e o
 * `BrowserContext` do Playwright: só o registro de que ela existe e a quem
 * pertence. É esse registro que mora fora do processo — o navegador em si
 * não é serializável e continua só na memória de `portal-sessions.ts`.
 */
export interface SessaoMetadados {
  readonly id: string;
  readonly professorId: string;
  readonly login: string;
  readonly escola: string;
  readonly createdAt: number;
}

const PREFIXO = 'esmeraldinha:sessao:';

let cliente: Redis | null = null;

/**
 * O cliente é único e preguiçoso: só conecta quando a primeira sessão precisa
 * dele, e falhas de conexão não derrubam o processo — `lazyConnect` faz a
 * primeira tentativa esperar pelo primeiro comando, e `retryStrategy` evita
 * que o `ioredis` fique gritando no console enquanto tenta de novo sozinho.
 *
 * `env.redisEmMemoria` troca o `ioredis` de verdade pelo `ioredis-mock`: a
 * mesma API (`set`/`pexpire`/`del`, TTL incluído), mas guardada num Map do
 * processo, sem precisar de um Redis instalado ou rodando. É o padrão fora
 * de produção — dev e testes não devem depender de infraestrutura externa
 * só para a sessão do portal funcionar.
 */
function getCliente(): Redis {
  if (!cliente) {
    cliente = env.redisEmMemoria
      ? (new RedisEmMemoria() as unknown as Redis)
      : new Redis(env.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: (tentativa) => Math.min(tentativa * 200, 2_000),
        });
    cliente.on('error', (error) => {
      console.error('Redis (sessões do portal):', error);
    });
  }

  return cliente;
}

/**
 * Guarda os metadados da sessão com o mesmo prazo de vida da sessão em
 * memória. Uma falha aqui não derruba a sessão: o Redis é cache auxiliar,
 * não a fonte da verdade — quem decide se a sessão existe é o `Map` de
 * `portal-sessions.ts`.
 */
export async function salvarSessao(
  metadados: SessaoMetadados,
  idleMs: number = env.sessionIdleMs,
): Promise<void> {
  try {
    await getCliente().set(
      PREFIXO + metadados.id,
      JSON.stringify(metadados),
      'PX',
      idleMs,
    );
  } catch (error) {
    console.error(`Falha ao salvar a sessão ${metadados.id} no Redis:`, error);
  }
}

/**
 * Renova o prazo de vida da sessão no Redis, para acompanhar o `touchSession`
 * que já renova o timer em memória. Não recria o valor: só estica o TTL.
 */
export async function renovarSessao(
  id: string,
  idleMs: number = env.sessionIdleMs,
): Promise<void> {
  try {
    await getCliente().pexpire(PREFIXO + id, idleMs);
  } catch (error) {
    console.error(`Falha ao renovar a sessão ${id} no Redis:`, error);
  }
}

/**
 * Apaga o registro. Chamado tanto quando a sessão expira por ociosidade
 * quanto quando o auxiliar de ensino a encerra de propósito — nos dois casos
 * o navegador já foi fechado, e o registro não deve sobreviver a ele.
 */
export async function invalidarSessao(id: string): Promise<void> {
  try {
    await getCliente().del(PREFIXO + id);
  } catch (error) {
    console.error(`Falha ao invalidar a sessão ${id} no Redis:`, error);
  }
}

/** Fecha a conexão; usado no encerramento do processo e entre os testes. */
export async function fecharConexaoRedis(): Promise<void> {
  if (!cliente) return;

  const atual = cliente;
  cliente = null;
  await atual.quit().catch(() => atual.disconnect());
}

/**
 * Lê o registro de volta. É o que permite `retomarSessao` reconhecer o dono
 * de uma sessão depois que o `Map` de `portal-sessions.ts` esvaziou — um
 * restart do processo, por exemplo — sem esse registro a sessão seria tratada
 * como se nunca tivesse existido, mesmo tendo TTL de sobra no Redis.
 */
export async function lerSessao(id: string): Promise<SessaoMetadados | undefined> {
  try {
    const valor = await getCliente().get(PREFIXO + id);
    return valor ? (JSON.parse(valor) as SessaoMetadados) : undefined;
  } catch (error) {
    console.error(`Falha ao ler a sessão ${id} no Redis:`, error);
    return undefined;
  }
}
