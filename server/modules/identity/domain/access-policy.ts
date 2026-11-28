import type { IdentidadeDaSessao } from './identidade';

/** Current single-installation policy; organization scope must precede shared hosting. */
export function isAuxiliarDeEnsino(identity: IdentidadeDaSessao): boolean {
  return identity.papel === 'auxiliar de ensino';
}

/** The professorId must come from a trusted resource, not a claim about its owner. */
export function canAccessProfessor(identity: IdentidadeDaSessao, professorId: string): boolean {
  return identity.papel === 'auxiliar de ensino' || identity.professorId === professorId;
}

export function canReadFinancialValues(identity: IdentidadeDaSessao): boolean {
  return isAuxiliarDeEnsino(identity);
}
