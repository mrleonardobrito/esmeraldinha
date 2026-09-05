import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import { ArquivoIlegivelError } from '../errors';
import { ehArquivoDePlanilha, ehArquivoWord, extrairTexto } from '../extrair-texto';
import type { ArquivoEnviado } from '../interpretar-envio';

function planilhaDeTeste(): Uint8Array {
  const planilha = utils.book_new();
  const aba = utils.aoa_to_sheet([
    ['estudante', 'nota'],
    ['Maria', 8.5],
    ['João', 7],
  ]);
  utils.book_append_sheet(planilha, aba, 'Notas');

  return write(planilha, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('ehArquivoWord', () => {
  it('reconhece pelo mimetype', () => {
    expect(
      ehArquivoWord({
        filename: 'plano',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: new Uint8Array(),
      }),
    ).toBe(true);
  });

  it('reconhece pela extensão quando o mimetype vem genérico', () => {
    expect(
      ehArquivoWord({
        filename: 'plano-de-aula.docx',
        mimeType: 'application/octet-stream',
        data: new Uint8Array(),
      }),
    ).toBe(true);

    expect(
      ehArquivoWord({
        filename: 'plano-antigo.doc',
        mimeType: 'application/octet-stream',
        data: new Uint8Array(),
      }),
    ).toBe(true);
  });

  it('não reconhece outros arquivos', () => {
    expect(
      ehArquivoWord({ filename: 'foto.png', mimeType: 'image/png', data: new Uint8Array() }),
    ).toBe(false);
  });
});

describe('ehArquivoDePlanilha', () => {
  it('reconhece xlsx, xls e csv', () => {
    for (const filename of ['notas.xlsx', 'notas.xls', 'notas.csv']) {
      expect(
        ehArquivoDePlanilha({
          filename,
          mimeType: 'application/octet-stream',
          data: new Uint8Array(),
        }),
      ).toBe(true);
    }
  });
});

describe('extrairTexto', () => {
  it('lê uma planilha .xlsx e devolve o conteúdo em CSV', async () => {
    const arquivo: ArquivoEnviado = {
      filename: 'notas.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: planilhaDeTeste(),
    };

    const texto = await extrairTexto(arquivo);

    expect(texto).toContain('estudante,nota');
    expect(texto).toContain('Maria,8.5');
    expect(texto).toContain('João,7');
  });

  it('rotula cada aba quando a planilha tem mais de uma', async () => {
    const planilha = utils.book_new();
    utils.book_append_sheet(planilha, utils.aoa_to_sheet([['a']]), 'Turma A');
    utils.book_append_sheet(planilha, utils.aoa_to_sheet([['b']]), 'Turma B');
    const data = write(planilha, { type: 'array', bookType: 'xlsx' }) as Uint8Array;

    const texto = await extrairTexto({
      filename: 'notas.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data,
    });

    expect(texto).toContain('# Turma A');
    expect(texto).toContain('# Turma B');
  });

  it('lê um .csv como texto puro', async () => {
    const texto = await extrairTexto({
      filename: 'notas.csv',
      mimeType: 'text/csv',
      data: new TextEncoder().encode('estudante,nota\nMaria,8.5\n'),
    });

    expect(texto).toContain('Maria,8.5');
  });

  it('lança ArquivoIlegivelError quando a planilha está corrompida', async () => {
    await expect(
      extrairTexto({
        filename: 'notas.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Um zip PK truncado, para forçar o parser a rejeitar em vez de
        // adivinhar algum conteúdo — texto puro seria lido como CSV de uma
        // coluna só.
        data: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
      }),
    ).rejects.toThrow(ArquivoIlegivelError);
  });

  it('lança ArquivoIlegivelError quando o Word está corrompido', async () => {
    await expect(
      extrairTexto({
        filename: 'plano.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: new TextEncoder().encode('isto não é um docx'),
      }),
    ).rejects.toThrow(ArquivoIlegivelError);
  });

  it('devolve texto puro para arquivos que não são Word nem planilha', async () => {
    const texto = await extrairTexto({
      filename: 'notas.txt',
      mimeType: 'text/plain',
      data: new TextEncoder().encode('conteúdo qualquer'),
    });

    expect(texto).toBe('conteúdo qualquer');
  });
});
