import { describe, expect, it } from 'vitest';

import { isReducao } from '../../../shared/turma';

describe('isReducao', () => {
  it.each(['REDUÇÃO MANHÃ', 'REDUÇÃO TARDE', 'REDUÇÃO NOITE', 'REDUÇÃO VITORIA', 'REDUÇÃO INTEGRAL', 'REDUÇÃO'])(
    'recognizes the explicit grupo diário %s',
    (grupoDiario) => expect(isReducao(grupoDiario)).toBe(true),
  );

  it('normalizes accents, case and whitespace without consulting the turma name', () => {
    expect(isReducao('  redução\u00a0 manhã  ')).toBe(true);
    expect(isReducao('reducao noite')).toBe(true);
  });

  it.each([null, undefined, '', 'Regular', 'REGENTE', 'MATUTINO', 'SEM REDUÇÃO TARDE', 'REDUÇÃOVITORIA', 'REGENTE REDUÇÃO'])(
    'does not infer redução from %s',
    (grupoDiario) => expect(isReducao(grupoDiario)).toBe(false),
  );
});
