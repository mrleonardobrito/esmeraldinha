/**
 * Importa o catálogo de códigos CR de uma planilha de habilidades para o
 * SQLite. Só o código e o texto da habilidade são guardados: é o que o
 * portal pede ao lançar o conteúdo de uma aula.
 *
 * Uso: tsx scripts/importar-codigos-cr.ts [caminho-do-csv]
 */
import { readFile } from 'node:fs/promises';

import { parseCodigosCR } from '../server/codigos-cr/csv';
import { replaceCodigosCR } from '../server/codigos-cr/store';
import { getDb, closeDb } from '../server/professores/db';
import { env } from '../server/env';

const csvPath = process.argv[2] ?? './habilidades-ef.csv';

const codigos = parseCodigosCR(await readFile(csvPath, 'utf8'));
const total = replaceCodigosCR(getDb(), codigos);
closeDb();

console.log(`${total} códigos CR importados de ${csvPath} para ${env.dbPath}.`);
