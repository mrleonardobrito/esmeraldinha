import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { ContaEnv } from '../conta/autenticacao';
import { env } from '../env';
import { createEncryptionPort } from '../encryption';
import { encerrarSessao } from '../conta/sessoes';
import { AuthFailure } from '../conta/supabase';
import { hostedFetch, remoteToken } from './remote-auth';
import { exportSqlite } from './migration';

export const localMigration = new Hono<ContaEnv>();
localMigration.get('/', (context) =>
  context.json({
    available: Boolean(env.dataApiUrl && existsSync(env.dbPath)),
  }),
);
localMigration.post('/', async (context) => {
  const token = remoteToken(context.get('sessao').provider);
  if (!env.dataApiUrl || !token)
    return context.json(
      { error: 'A importação está disponível ao conectar a API de dados.' },
      409,
    );
  if (!existsSync(env.dbPath))
    return context.json(
      { error: 'Não há dados anteriores nesta instalação.' },
      404,
    );
  let payload;
  try {
    payload = await exportSqlite(env.dbPath, createEncryptionPort());
  } catch {
    throw new AuthFailure(
      'Confira os dados anteriores, o chaveiro do sistema e as sincronizações de acesso antes de importar.',
      422,
    );
  }
  const response = await hostedFetch('/api/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = (await response
    .json()
    .catch(() => ({
      error:
        response.status === 413
          ? 'Os dados excedem o limite de importação configurado no servidor.'
          : 'Não foi possível concluir a importação.',
    }))) as { requiresLogin?: boolean };
  if (response.ok && result.requiresLogin)
    await encerrarSessao(context.get('token'));
  return Response.json(result, { status: response.status });
});
