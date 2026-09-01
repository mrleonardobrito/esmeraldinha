import { describe, expect, it, vi } from 'vitest';

import { EnvioInvalidoError, ParteNaoSuportadaError } from '../errors';
import { buildContentParts, interpretarEnvio } from '../interpretar-envio';
import type { ConteudoCatalogo } from '../../scrape/types';

const catalogo: ConteudoCatalogo = {
  etapas: [
    { nome: '1ª Etapa', turmas: ['3º ANO A'], meses: ['MARÇO', 'ABRIL'] },
    { nome: '2ª Etapa', turmas: ['3º ANO B'], meses: ['MAIO'] },
  ],
};

const planoValido = {
  parte: 'conteudo',
  identificado: true,
  etapa: '1ª Etapa',
  turma: '3º ANO A',
  mes: 'MARÇO',
  observacao: '',
  aulas: [
    {
      data: '05/03/2026',
      ordem: null,
      codigoCR: 'EF03MA01',
      desenvolvimento: 'Adição com reagrupamento.',
      ferramentas: 'Quadro e material dourado.',
      isRecuperacao: 'Não',
      isInteracao: 'Não',
    },
  ],
};

function completeWith(plano: unknown) {
  return vi.fn().mockResolvedValue(JSON.stringify(plano));
}

describe('interpretarEnvio', () => {
  it('devolve o plano quando etapa, turma e mês estão no catálogo', async () => {
    const plano = await interpretarEnvio({
      texto: 'Dia 05/03 ensinei adição com reagrupamento no 3º ano A.',
      catalogo,
      complete: completeWith(planoValido),
    });

    expect(plano.turma).toBe('3º ANO A');
    expect(plano.aulas).toHaveLength(1);
    expect(plano.aulas[0].data).toBe('05/03/2026');
  });

  it('recusa uma turma que não pertence à etapa detectada', async () => {
    await expect(
      interpretarEnvio({
        texto: 'qualquer coisa',
        catalogo,
        complete: completeWith({ ...planoValido, turma: '3º ANO B' }),
      }),
    ).rejects.toThrow(EnvioInvalidoError);
  });

  it('recusa uma etapa que o professor não tem', async () => {
    await expect(
      interpretarEnvio({
        texto: 'qualquer coisa',
        catalogo,
        complete: completeWith({ ...planoValido, etapa: '4ª Etapa' }),
      }),
    ).rejects.toThrow(/não existe para este professor/);
  });

  it('recusa uma parte da caderneta que ainda não é preenchida', async () => {
    await expect(
      interpretarEnvio({
        texto: 'lista de presença',
        catalogo,
        complete: completeWith({ ...planoValido, parte: 'frequencia', aulas: [] }),
      }),
    ).rejects.toThrow(ParteNaoSuportadaError);
  });

  it('recusa um plano sem nenhuma aula datada', async () => {
    await expect(
      interpretarEnvio({
        texto: 'bom dia',
        catalogo,
        complete: completeWith({ ...planoValido, aulas: [] }),
      }),
    ).rejects.toThrow(/nenhuma aula datada/);
  });

  it('recusa um envio sem texto e sem arquivo antes de chamar o agente', async () => {
    const complete = completeWith(planoValido);

    await expect(interpretarEnvio({ texto: '  ', catalogo, complete })).rejects.toThrow(
      EnvioInvalidoError,
    );
    expect(complete).not.toHaveBeenCalled();
  });

  it('pede a extração de PDF só quando há um PDF', async () => {
    const complete = completeWith(planoValido);

    await interpretarEnvio({
      catalogo,
      complete,
      arquivos: [
        {
          filename: 'plano.pdf',
          mimeType: 'application/pdf',
          data: new TextEncoder().encode('%PDF-1.4'),
        },
      ],
    });

    expect(complete.mock.calls[0][0].parsePdf).toBe(true);
  });
});

describe('buildContentParts', () => {
  it('manda imagem como image_url, PDF como file e o resto como texto', () => {
    const data = new TextEncoder().encode('abc');

    const parts = buildContentParts({
      texto: 'olá',
      arquivos: [
        { filename: 'foto.png', mimeType: 'image/png', data },
        { filename: 'plano.pdf', mimeType: 'application/pdf', data },
        { filename: 'notas.txt', mimeType: 'text/plain', data },
      ],
    });

    expect(parts.map((part) => part.type)).toEqual([
      'text',
      'image_url',
      'file',
      'text',
    ]);
    expect(parts[1]).toMatchObject({
      image_url: { url: 'data:image/png;base64,YWJj' },
    });
    expect(parts[2]).toMatchObject({ file: { filename: 'plano.pdf' } });
  });
});

describe('material de outra turma', () => {
  it('recusa em vez de escolher a turma mais parecida', async () => {
    await expect(
      interpretarEnvio({
        texto: 'Plano de aula 5º ano B',
        catalogo,
        complete: completeWith({
          ...planoValido,
          identificado: false,
          etapa: '',
          turma: '',
          mes: '',
          observacao: 'O material é de um 5º ano, e este professor não tem 5º ano.',
        }),
      }),
    ).rejects.toThrow(/não tem 5º ano/);
  });
});
