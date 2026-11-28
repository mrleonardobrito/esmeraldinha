import type { IdentidadeDaSessao } from '../domain/identidade';

/** Read ports for the current synchronous desktop implementation. */
export interface SessionReaders<Conta extends { id: string }, Professor> {
  readSession(token: string): IdentidadeDaSessao | null;
  readConta(): Conta | null;
  readProfessor(id: string): Professor | null;
}

export type ResolvedSession<Conta, Professor> =
  | { identidade: Extract<IdentidadeDaSessao, { papel: 'auxiliar de ensino' }>; conta: Conta }
  | { identidade: Extract<IdentidadeDaSessao, { papel: 'professor' }>; professor: Professor };

/** Resolves the existing session without depending on Hono or SQLite. */
export function resolveSession<Conta extends { id: string }, Professor>(
  token: string,
  readers: SessionReaders<Conta, Professor>,
): ResolvedSession<Conta, Professor> | null {
  const identidade = readers.readSession(token);
  if (!identidade) return null;

  if (identidade.papel === 'auxiliar de ensino') {
    const conta = readers.readConta();
    return conta && conta.id === identidade.contaId ? { identidade, conta } : null;
  }

  const professor = readers.readProfessor(identidade.professorId);
  return professor ? { identidade, professor } : null;
}
