import { transaction } from '../database/types';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  professorUpdateSchema,
  type ProfessorUpdateInput,
} from '../../shared/professor';
import { createEncryptionPort } from '../encryption';
import { encerrarSessoesDoProfessor } from '../conta/sessoes';
import {
  AuthFailure,
  type AuthProvider,
  type AuthSession,
} from '../conta/supabase';
import { closeSession, openSession } from '../portal-sessions';
import { LoginError } from '../scrape/errors';
import { getDb } from './db';
import { env } from '../env';
import {
  deleteProfessor,
  getProfessor,
  getProfessorCredenciais,
  ProfessorNotFoundError,
  updateProfessor,
} from './store';

const pendingSchema = z.object({
  action: z.enum(['sync', 'revoke', 'delete']),
  email: z.email(),
  senha: z.string().optional(),
  enabled: z.boolean(),
  professor: professorUpdateSchema.optional(),
});
type Pending = z.infer<typeof pendingSchema>;
const queues = new Map<string, Promise<unknown>>();

export async function withProfessorLock<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(id) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  queues.set(id, current);
  try {
    return await current;
  } finally {
    if (queues.get(id) === current) queues.delete(id);
  }
}

async function validatePortal(
  id: string,
  replacement?: ProfessorUpdateInput,
): Promise<string> {
  const stored = await getProfessorCredenciais(
    getDb(),
    createEncryptionPort(),
    id,
  );
  if (!stored) throw new ProfessorNotFoundError(id);
  const credenciais = {
    login: replacement?.login ?? stored.login,
    escola: replacement?.escola ?? stored.escola,
    senha: replacement?.senha ?? stored.senha,
  };
  if (env.portalAutomation === 'desktop') return credenciais.senha;
  try {
    const session = await openSession(credenciais);
    await closeSession(session.id);
  } catch (error) {
    if (error instanceof LoginError)
      throw new AuthFailure(
        'As credenciais do professor precisam ser atualizadas no portal.',
        422,
      );
    throw new AuthFailure(
      'Não foi possível conferir as credenciais no portal. Tente novamente.',
      503,
    );
  }
  return credenciais.senha;
}

async function stage(id: string, payload: Pending): Promise<void> {
  const encrypted = await createEncryptionPort().encrypt(
    JSON.stringify(payload),
  );
  const db = getDb();
  await transaction(db, async () => {
    await db
      .prepare(
        'INSERT INTO professor_auth_operations (professor_id, operation_id, payload) VALUES (?, ?, ?)',
      )
      .run(id, randomUUID(), encrypted);
    await db
      .prepare(
        "UPDATE professores SET auth_sync_status = 'pending', auth_revision = auth_revision + 1 WHERE id = ?",
      )
      .run(id);
  });
  await encerrarSessoesDoProfessor(id);
}

export async function reconcileProfessor(
  id: string,
  auth: AuthProvider,
  remote: AuthSession,
): Promise<Awaited<ReturnType<typeof getProfessor>>> {
  const db = getDb();
  const row = (await db
    .prepare('SELECT * FROM professor_auth_operations WHERE professor_id = ?')
    .get(id)) as { operation_id: string; payload: Uint8Array } | undefined;
  if (!row) return await getProfessor(db, id);
  const encryption = createEncryptionPort();
  const pending = pendingSchema.parse(
    JSON.parse(await encryption.decrypt(Buffer.from(row.payload))),
  );
  let result;
  try {
    result = await auth.administer(remote, {
      operationId: row.operation_id,
      professorId: id,
      action: pending.action,
      email: pending.email,
      ...(pending.action === 'sync' ? { senha: pending.senha } : {}),
    });
  } catch (error) {
    if (error instanceof AuthFailure && error.status === 422) {
      await transaction(db, async () => {
        await db
          .prepare(
            'DELETE FROM professor_auth_operations WHERE professor_id = ?',
          )
          .run(id);
        await db
          .prepare(
            "UPDATE professores SET acesso_liberado = FALSE, auth_sync_status = 'unlinked', auth_revision = auth_revision + 1 WHERE id = ?",
          )
          .run(id);
      });
    }
    throw error;
  }
  const binding = (await db
    .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
    .get(id)) as { supabase_auth_id: string | null } | undefined;
  if (
    !binding ||
    result.email !== pending.email ||
    (binding.supabase_auth_id && result.id !== binding.supabase_auth_id)
  )
    throw new AuthFailure(
      'O vínculo remoto precisa ser conferido pelo auxiliar de ensino.',
      409,
    );
  if (pending.action !== 'delete') {
    await db
      .prepare('UPDATE professores SET supabase_auth_id = ? WHERE id = ?')
      .run(result.id, id);
  }
  if (pending.action === 'sync' && !result.verified) {
    const prior = await getProfessor(db, id);
    await db
      .prepare(
        "UPDATE professores SET auth_sync_status = 'verifying' WHERE id = ?",
      )
      .run(id);
    if (prior?.authStatus !== 'verifying') await auth.sendCode(pending.email);
    return await getProfessor(db, id);
  }
  if (pending.professor)
    await updateProfessor(db, encryption, id, pending.professor);
  const followUp =
    pending.action === 'sync' && !pending.enabled
      ? await encryption.encrypt(
          JSON.stringify({
            action: 'revoke',
            email: pending.email,
            enabled: false,
          } satisfies Pending),
        )
      : null;
  await transaction(db, async () => {
    await db
      .prepare('DELETE FROM professor_auth_operations WHERE professor_id = ?')
      .run(id);
    if (pending.action === 'delete') await deleteProfessor(db, id);
    else {
      await db
        .prepare(
          'UPDATE professores SET acesso_liberado = ?, auth_sync_status = ?, auth_revision = auth_revision + 1 WHERE id = ?',
        )
        .run(pending.enabled ? 1 : 0, followUp ? 'pending' : 'ready', id);
      if (followUp)
        await db
          .prepare(
            'INSERT INTO professor_auth_operations (professor_id, operation_id, payload) VALUES (?, ?, ?)',
          )
          .run(id, randomUUID(), followUp);
    }
  });
  return followUp
    ? await reconcileProfessor(id, auth, remote)
    : await getProfessor(db, id);
}

export async function changeProfessorAcesso(
  id: string,
  enabled: boolean,
  auth: AuthProvider,
  remote: AuthSession,
) {
  return withProfessorLock(id, async () => {
    const professor = await getProfessor(getDb(), id);
    if (!professor) throw new ProfessorNotFoundError(id);
    const pending = (await getDb()
      .prepare(
        'SELECT payload FROM professor_auth_operations WHERE professor_id = ?',
      )
      .get(id)) as { payload: Uint8Array } | undefined;
    if (!enabled) {
      await getDb()
        .prepare(
          'UPDATE professores SET acesso_liberado = FALSE, auth_revision = auth_revision + 1 WHERE id = ?',
        )
        .run(id);
      await encerrarSessoesDoProfessor(id);
      if (pending) {
        const encryption = createEncryptionPort();
        const data = pendingSchema.parse(
          JSON.parse(await encryption.decrypt(Buffer.from(pending.payload))),
        );
        data.enabled = false;
        await getDb()
          .prepare(
            'UPDATE professor_auth_operations SET payload = ? WHERE professor_id = ?',
          )
          .run(await encryption.encrypt(JSON.stringify(data)), id);
        return await reconcileProfessor(id, auth, remote);
      }
    }
    if (pending) return await reconcileProfessor(id, auth, remote);
    const binding = (await getDb()
      .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
      .get(id)) as { supabase_auth_id: string | null };
    if (!enabled && !binding.supabase_auth_id)
      return await getProfessor(getDb(), id);
    if (!professor.email)
      throw new AuthFailure(
        'Informe o e-mail do professor no cadastro para liberar o acesso.',
        422,
      );
    const senha = enabled ? await validatePortal(id) : undefined;
    await stage(id, {
      action: enabled ? 'sync' : 'revoke',
      email: professor.email.toLowerCase(),
      senha,
      enabled,
    });
    return await reconcileProfessor(id, auth, remote);
  });
}

export async function updateProfessorWithAuth(
  id: string,
  input: ProfessorUpdateInput,
  auth: AuthProvider,
  remote: AuthSession,
) {
  return withProfessorLock(id, async () => {
    const professor = await getProfessor(getDb(), id);
    if (!professor) throw new ProfessorNotFoundError(id);
    if (['pending', 'verifying'].includes(professor.authStatus ?? ''))
      throw new AuthFailure(
        'Conclua a sincronização pendente antes de editar o professor.',
        409,
      );
    const binding = (await getDb()
      .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
      .get(id)) as { supabase_auth_id: string | null };
    if (
      binding.supabase_auth_id &&
      input.email !== undefined &&
      input.email.toLowerCase() !== professor.email
    )
      throw new AuthFailure(
        'O e-mail vinculado ao acesso não pode ser alterado por esta edição.',
        422,
      );
    if (
      !binding.supabase_auth_id ||
      (!input.senha &&
        input.login === professor.login &&
        input.escola === professor.escola)
    )
      return await updateProfessor(getDb(), createEncryptionPort(), id, input);
    if (input.login !== professor.login && !input.senha)
      throw new AuthFailure(
        'Informe as credenciais completas ao alterar o CPF.',
        422,
      );
    const senha = await validatePortal(id, input);
    await stage(id, {
      action: 'sync',
      email: professor.email!,
      senha,
      enabled: professor.acessoLiberado,
      professor: input,
    });
    return await reconcileProfessor(id, auth, remote);
  });
}

export async function deleteProfessorWithAuth(
  id: string,
  auth: AuthProvider,
  remote: AuthSession,
): Promise<void> {
  await withProfessorLock(id, async () => {
    const db = getDb();
    const professor = await getProfessor(db, id);
    if (!professor) throw new ProfessorNotFoundError(id);
    if (
      await db
        .prepare(
          'SELECT professor_id FROM professor_auth_operations WHERE professor_id = ?',
        )
        .get(id)
    )
      throw new AuthFailure(
        'Conclua a sincronização pendente antes de excluir o professor.',
        409,
      );
    const binding = (await db
      .prepare('SELECT supabase_auth_id FROM professores WHERE id = ?')
      .get(id)) as { supabase_auth_id: string | null };
    await encerrarSessoesDoProfessor(id);
    if (!binding.supabase_auth_id) {
      await deleteProfessor(db, id);
      return;
    }
    await db
      .prepare('UPDATE professores SET acesso_liberado = FALSE WHERE id = ?')
      .run(id);
    await stage(id, {
      action: 'delete',
      email: professor.email!,
      enabled: false,
    });
    await reconcileProfessor(id, auth, remote);
  });
}
