import { describe, expect, it, vi } from 'vitest';
import { canAccessProfessor, canReadFinancialValues, isAuxiliarDeEnsino, resolveSession, type IdentidadeDaSessao } from '../index';

const auxiliar: IdentidadeDaSessao = { papel: 'auxiliar de ensino', contaId: 'conta-a' };
const professor: IdentidadeDaSessao = { papel: 'professor', professorId: 'professor-a' };

describe('identity access policy', () => {
  it('preserves management access in a single installation', () => {
    expect(isAuxiliarDeEnsino(auxiliar)).toBe(true);
    expect(canAccessProfessor(auxiliar, 'professor-b')).toBe(true);
    expect(canReadFinancialValues(auxiliar)).toBe(true);
  });

  it('restricts professores to their own resources and hides financial values', () => {
    expect(isAuxiliarDeEnsino(professor)).toBe(false);
    expect(canAccessProfessor(professor, 'professor-a')).toBe(true);
    expect(canAccessProfessor(professor, 'professor-b')).toBe(false);
    expect(canReadFinancialValues(professor)).toBe(false);
  });
});

describe('resolveSession', () => {
  function readers(identity: IdentidadeDaSessao | null) {
    return {
      readSession: vi.fn((_token: string) => identity),
      readConta: vi.fn((): { id: string } | null => ({ id: 'conta-a' })),
      readProfessor: vi.fn((id: string): { id: string } | null => ({ id })),
    };
  }

  it('rejects an unknown session without reading accounts', () => {
    const ports = readers(null);
    expect(resolveSession('token', ports)).toBeNull();
    expect(ports.readConta).not.toHaveBeenCalled();
    expect(ports.readProfessor).not.toHaveBeenCalled();
  });

  it('resolves the conta and checks the stored identity', () => {
    const ports = readers(auxiliar);
    expect(resolveSession('token', ports)).toEqual({ identidade: auxiliar, conta: { id: 'conta-a' } });
    ports.readConta.mockReturnValue({ id: 'another-conta' });
    expect(resolveSession('token', ports)).toBeNull();
    ports.readConta.mockReturnValue(null);
    expect(resolveSession('token', ports)).toBeNull();
  });

  it('loads the professor from the authenticated identity and rejects a missing professor', () => {
    const ports = readers(professor);
    expect(resolveSession('token', ports)).toEqual({ identidade: professor, professor: { id: 'professor-a' } });
    expect(ports.readProfessor).toHaveBeenCalledWith('professor-a');
    expect(ports.readConta).not.toHaveBeenCalled();
    ports.readProfessor.mockReturnValue(null);
    expect(resolveSession('token', ports)).toBeNull();
  });
});
