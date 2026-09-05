import type { CodigoCR } from './store';

/** Raised when the CSV does not carry the columns the catálogo needs. */
export class MissingColumnError extends Error {
  constructor(column: string) {
    super(`A planilha não tem a coluna ${column}.`);
    this.name = 'MissingColumnError';
  }
}

/** Splits RFC 4180 CSV text into rows of raw fields. */
function parseRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else if (char !== '\r') field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Reads the códigos CR out of a habilidades CSV. Every other column of the
 * source describes how the habilidade is filed at the BNCC; the portal only
 * ever asks for the código and shows the texto, so those are all we keep.
 */
export function parseCodigosCR(source: string): CodigoCR[] {
  const [header, ...rows] = parseRows(source);
  if (!header) return [];

  const codigoAt = header.indexOf('codigo');
  if (codigoAt === -1) throw new MissingColumnError('codigo');
  const textoAt = header.indexOf('texto');
  if (textoAt === -1) throw new MissingColumnError('texto');

  return rows
    .map((row) => ({
      codigo: (row[codigoAt] ?? '').trim(),
      texto: (row[textoAt] ?? '').trim(),
    }))
    .filter(({ codigo, texto }) => codigo !== '' && texto !== '');
}
