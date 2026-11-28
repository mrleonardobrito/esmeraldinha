import type { IdentidadeDaSessao } from '../domain/identidade';

export interface LoginInput {
  login: string;
  senha: string;
}

/** Proof from the provider that the credentials are valid. Not an access grant. */
export interface VerifiedIdentity {
  subject: string;
}

export type AccessStatus = 'active' | 'suspended';

export type InternalUser = {
  readonly id: string;
  readonly status: AccessStatus;
  readonly mustChangePassword: boolean;
} & (
  | { readonly papel: 'auxiliar de ensino'; readonly contaId: string }
  | { readonly papel: 'professor'; readonly professorId: string }
);

export interface IdentityProvider {
  authenticate(input: LoginInput): Promise<VerifiedIdentity | null>;
}

export interface IdentityRepository {
  findBySubject(subject: string): Promise<InternalUser | null>;
  findById(id: string): Promise<InternalUser | null>;
  findByProfessor(professorId: string): Promise<InternalUser | null>;
}

export interface StoredSession {
  readonly userId: string;
  readonly identidade: IdentidadeDaSessao;
}

/** Provider-neutral sessões da aplicação, shared by every infrastructure bundle. */
export interface ApplicationSessions {
  open(session: StoredSession): string;
  read(token: string): StoredSession | null;
  close(token: string): void;
  closeForUser(userId: string, except?: string): void;
}
