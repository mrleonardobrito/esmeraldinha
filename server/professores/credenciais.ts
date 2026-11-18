import { env } from '../env';
import { callData } from '../database/remote';
import { createEncryptionPort } from '../encryption';
import { getDb } from './db';
import { getProfessorCredenciais } from './store';

/** Hosted credentials do not depend on a new desktop's local encryption key. */
export async function lerCredenciaisDoProfessor(
  id: string,
): Promise<Awaited<ReturnType<typeof getProfessorCredenciais>>> {
  if (env.dataApiUrl)
    return callData('professores.getProfessorCredenciais', [id]);
  return getProfessorCredenciais(getDb(), createEncryptionPort(), id);
}
