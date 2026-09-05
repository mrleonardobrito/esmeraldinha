import WordExtractor from 'word-extractor';
import { read, utils } from 'xlsx';

import { ArquivoIlegivelError } from './errors';
import type { ArquivoEnviado } from './interpretar-envio';

const EXTENSOES_WORD = ['.doc', '.docx'];
const EXTENSOES_PLANILHA = ['.xls', '.xlsx', '.csv'];

const MIME_WORD = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MIME_PLANILHA = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function temExtensao(filename: string, extensoes: readonly string[]): boolean {
  const nome = filename.toLowerCase();
  return extensoes.some((extensao) => nome.endsWith(extensao));
}

export function ehArquivoWord(arquivo: ArquivoEnviado): boolean {
  return MIME_WORD.includes(arquivo.mimeType) || temExtensao(arquivo.filename, EXTENSOES_WORD);
}

export function ehArquivoDePlanilha(arquivo: ArquivoEnviado): boolean {
  return (
    MIME_PLANILHA.includes(arquivo.mimeType) || temExtensao(arquivo.filename, EXTENSOES_PLANILHA)
  );
}

/** Word (.doc/.docx) só tem texto corrido — não há tabela para preservar. */
async function extrairDeWord(arquivo: ArquivoEnviado): Promise<string> {
  try {
    const documento = await new WordExtractor().extract(Buffer.from(arquivo.data));
    return documento.getBody().trim();
  } catch (error) {
    throw new ArquivoIlegivelError(arquivo.filename, error);
  }
}

/** Cada aba vira um bloco de CSV, que o modelo lê tão bem quanto uma tabela. */
function extrairDePlanilha(arquivo: ArquivoEnviado): string {
  try {
    const planilha = read(arquivo.data, { type: 'array' });

    return planilha.SheetNames.map((nome) => {
      const csv = utils.sheet_to_csv(planilha.Sheets[nome]);
      return planilha.SheetNames.length > 1 ? `# ${nome}\n${csv}` : csv;
    })
      .join('\n\n')
      .trim();
  } catch (error) {
    throw new ArquivoIlegivelError(arquivo.filename, error);
  }
}

/**
 * Converte um arquivo de Word ou Excel no texto que ele contém, para ser
 * mandado ao modelo como texto — hoje só imagem e PDF viajam como mídia.
 */
export async function extrairTexto(arquivo: ArquivoEnviado): Promise<string> {
  if (ehArquivoWord(arquivo)) return extrairDeWord(arquivo);
  if (ehArquivoDePlanilha(arquivo)) return extrairDePlanilha(arquivo);

  return Buffer.from(arquivo.data).toString('utf8');
}
