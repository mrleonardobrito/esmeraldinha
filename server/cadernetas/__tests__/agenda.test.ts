import { describe, expect, it } from 'vitest';

import { proximaExecucao } from '../agenda';

/** Domingo, 3h — o padrão da agenda semanal. */
const DOMINGO = 0;
const TRES_DA_MANHA = 3;

describe('proximaExecucao', () => {
  it('aponta para a próxima madrugada de domingo', () => {
    // Quinta-feira, 05/02/2026, 10h.
    const agora = new Date(2026, 1, 5, 10, 0, 0);

    const proxima = proximaExecucao(agora, DOMINGO, TRES_DA_MANHA);

    expect(proxima.getDay()).toBe(DOMINGO);
    expect(proxima.getHours()).toBe(TRES_DA_MANHA);
    expect(proxima.getDate()).toBe(8);
  });

  it('pula para a semana seguinte quando o horário de hoje já passou', () => {
    // Domingo, 08/02/2026, 9h — as 3h já foram.
    const agora = new Date(2026, 1, 8, 9, 0, 0);

    const proxima = proximaExecucao(agora, DOMINGO, TRES_DA_MANHA);

    expect(proxima.getDate()).toBe(15);
    expect(proxima.getDay()).toBe(DOMINGO);
  });

  it('mantém hoje quando o horário ainda está por vir', () => {
    // Domingo, 08/02/2026, 1h — as 3h ainda não chegaram.
    const agora = new Date(2026, 1, 8, 1, 0, 0);

    const proxima = proximaExecucao(agora, DOMINGO, TRES_DA_MANHA);

    expect(proxima.getDate()).toBe(8);
    expect(proxima.getHours()).toBe(TRES_DA_MANHA);
  });

  it('nunca devolve um horário no passado', () => {
    // Um ano inteiro de segundas, para pegar viradas de mês e de ano.
    for (let dia = 1; dia <= 365; dia += 1) {
      const agora = new Date(2026, 0, dia, 3, 0, 0);
      expect(proximaExecucao(agora, DOMINGO, TRES_DA_MANHA).getTime()).toBeGreaterThan(
        agora.getTime(),
      );
    }
  });

  it('respeita outro dia e outra hora', () => {
    // Quinta-feira, 05/02/2026 — pedindo quarta (3) às 23h.
    const proxima = proximaExecucao(new Date(2026, 1, 5, 10, 0, 0), 3, 23);

    expect(proxima.getDay()).toBe(3);
    expect(proxima.getHours()).toBe(23);
    expect(proxima.getDate()).toBe(11);
  });
});
