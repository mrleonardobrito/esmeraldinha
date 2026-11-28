// Public module contract. Legacy callers must import from this entry point.
export type { IdentidadeDaSessao } from './domain/identidade';
export { canAccessProfessor, canReadFinancialValues, isAuxiliarDeEnsino } from './domain/access-policy';
export { resolveSession } from './application/resolve-session';
export type { ResolvedSession, SessionReaders } from './application/resolve-session';
