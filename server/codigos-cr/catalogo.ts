import { existsSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { parseCodigosCR } from './csv';
import { listCodigosCR, replaceCodigosCR, type CodigoCR } from './store';
import { env } from '../env';

/**
 * O catálogo de códigos CR, importado da planilha de habilidades na primeira
 * vez que alguém o pede. Ninguém precisa lembrar de rodar o script de
 * importação numa instalação nova: sem catálogo, o agente devolve só os
 * códigos e o portal fica sem o texto das habilidades.
 *
 * Um catálogo já importado nunca é reimportado daqui — trocar a planilha é
 * trabalho do script, que substitui tudo de propósito.
 */
export function garantirCatalogoDeCodigosCR(db: DatabaseSync): CodigoCR[] {
  const existentes = listCodigosCR(db);
  if (existentes.length > 0) return existentes;

  if (!existsSync(env.codigosCRCsvPath)) {
    console.warn(
      `Catálogo de códigos CR vazio e planilha não encontrada em ${env.codigosCRCsvPath}: ` +
        'os conteúdos gerados sairão sem o texto das habilidades.',
    );
    return [];
  }

  const codigos = parseCodigosCR(readFileSync(env.codigosCRCsvPath, 'utf8'));
  replaceCodigosCR(db, codigos);
  return codigos;
}
