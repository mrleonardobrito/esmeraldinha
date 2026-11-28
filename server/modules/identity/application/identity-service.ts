import type { IdentidadeDaSessao } from '../domain/identidade';
import type {
  ApplicationSessions,
  EnrollmentResult,
  IdentityProvider,
  IdentityRepository,
  InternalUser,
  LoginInput,
} from './ports';

export interface IdentityDependencies {
  provider: IdentityProvider;
  repository: IdentityRepository;
  sessions: ApplicationSessions;
}

export type SignInResult =
  | { status: 'signed_in'; token: string; user: InternalUser; identidade: IdentidadeDaSessao }
  | { status: 'invalid_credentials' }
  | { status: 'access_denied' };

export interface ResolvedSession {
  user: InternalUser;
  identidade: IdentidadeDaSessao;
}

function identidadeOf(user: InternalUser): IdentidadeDaSessao {
  return user.papel === 'auxiliar de ensino'
    ? { papel: user.papel, contaId: user.contaId }
    : { papel: user.papel, professorId: user.professorId };
}

function sameIdentidade(a: IdentidadeDaSessao, b: IdentidadeDaSessao): boolean {
  if (a.papel === 'auxiliar de ensino') return b.papel === a.papel && b.contaId === a.contaId;
  return b.papel === a.papel && b.professorId === a.professorId;
}

export function createIdentityService({ provider, repository, sessions }: IdentityDependencies) {
  return {
    async issueEnrollment(actor: InternalUser, professorId: string, email: string): Promise<EnrollmentResult | { status: 'access_denied' }> {
      const current = await repository.findById(actor.id);
      if (!current || current.papel !== 'auxiliar de ensino' || current.status !== 'active' || current.mustChangePassword) {
        return { status: 'access_denied' };
      }
      const target = await repository.findByProfessor(professorId);
      if (!target) return { status: 'not_found' };
      const result = await provider.issueEnrollment(professorId, email);
      if (result.status === 'issued') sessions.closeForUser(target.id);
      return result;
    },

    async completeEnrollment(token: string, senha: string): Promise<boolean> {
      return provider.completeEnrollment(token, senha);
    },

    async signIn(input: LoginInput): Promise<SignInResult> {
      const verified = await provider.authenticate(input);
      if (!verified) return { status: 'invalid_credentials' };

      const user = await repository.findBySubject(verified.subject);
      if (!user) return { status: 'invalid_credentials' };
      if (user.status !== 'active') return { status: 'access_denied' };

      const identidade = identidadeOf(user);
      const token = sessions.open({ userId: user.id, identidade });
      return { status: 'signed_in', token, user, identidade };
    },

    /** Rechecks the stored user on every request: a valid token alone is not access. */
    async resolveSession(token: string): Promise<ResolvedSession | null> {
      const stored = sessions.read(token);
      if (!stored) return null;

      const user = await repository.findById(stored.userId);
      if (!user || user.status !== 'active' || !sameIdentidade(stored.identidade, identidadeOf(user))) {
        sessions.close(token);
        return null;
      }

      return { user, identidade: stored.identidade };
    },

    signOut(token: string): void {
      sessions.close(token);
    },

    closeOtherSessions(userId: string, currentToken: string): void {
      sessions.closeForUser(userId, currentToken);
    },

    async closeProfessorSessions(professorId: string): Promise<void> {
      const user = await repository.findByProfessor(professorId);
      if (user) sessions.closeForUser(user.id);
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
