import { AuthFailure } from '../conta/supabase';
import { providerDaSessaoAtual } from '../conta/sessoes';
import { hostedFetch, remoteToken } from './remote-auth';
import {
  CadernetaInvalidaError,
  CadernetaNotFoundError,
  TurmaJaCadastradaError,
} from '../cadernetas/store';
import { TurmaNotFoundError } from '../turmas/store';
import {
  ProfessorNotFoundError,
  DuplicateLoginError,
} from '../professores/store';

/** Fixed domain operations only. No remote endpoint accepts SQL. */
export async function callData<T>(
  operation: string,
  args: unknown[],
): Promise<T> {
  const provider = providerDaSessaoAtual();
  const token = provider && remoteToken(provider);
  if (!token)
    throw new AuthFailure('Entre com sua conta para acessar os dados.', 401);
  const response = await hostedFetch('/api/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, args }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    result?: T;
    error?: string;
    kind?: string;
  };
  if (!response.ok) {
    if (body.kind === 'CadernetaNotFoundError')
      throw new CadernetaNotFoundError(String(args[0]));
    if (body.kind === 'TurmaJaCadastradaError')
      throw new TurmaJaCadastradaError('');
    if (body.kind === 'CadernetaInvalidaError')
      throw new CadernetaInvalidaError(body.error ?? '');
    if (body.kind === 'TurmaNotFoundError')
      throw new TurmaNotFoundError(String(args[0]));
    if (body.kind === 'ProfessorNotFoundError')
      throw new ProfessorNotFoundError(String(args[0]));
    if (body.kind === 'DuplicateLoginError') throw new DuplicateLoginError('');
    throw new AuthFailure(
      response.status === 403
        ? 'Esta ação não está autorizada.'
        : response.status === 422
          ? 'Confira os dados enviados.'
          : 'Não foi possível consultar os dados. Tente novamente.',
      response.status === 401
        ? 401
        : response.status === 403
          ? 403
          : response.status === 409
            ? 409
            : response.status === 422
              ? 422
              : response.status === 429
                ? 429
                : 503,
    );
  }
  return body.result as T;
}
