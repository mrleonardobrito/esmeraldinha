// Public module contract. Legacy callers must import from this entry point.
export type { IdentidadeDaSessao } from './domain/identidade';
export {
  canAccessProfessor,
  canReadFinancialValues,
  hasDirectAccess,
  isAuxiliarDeEnsino,
} from './domain/access-policy';
export { createIdentityService } from './application/identity-service';
export type {
  IdentityDependencies,
  IdentityService,
  ResolvedSession,
  SignInResult,
} from './application/identity-service';
export type {
  AccessStatus,
  ApplicationSessions,
  IdentityProvider,
  EnrollmentResult,
  IdentityRepository,
  InternalUser,
  LoginInput,
  StoredSession,
  VerifiedIdentity,
} from './application/ports';
