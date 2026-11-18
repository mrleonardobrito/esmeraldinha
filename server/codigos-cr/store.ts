import { callData } from '../database/remote';
import { env } from '../env';
import { transaction } from '../database/types';
import type { Database } from '../database/types';

/**
 * One curriculum reference an aula's conteúdo can be recorded against — the
 * código CR the portal asks for, plus the habilidade it stands for.
 */
export interface CodigoCR {
  codigo: string;
  texto: string;
}

/** Lists the catálogo de códigos CR in código order. */
export async function listCodigosCR(db: Database): Promise<CodigoCR[]> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof listCodigosCR>>>(
      'codigos-cr.listCodigosCR',
      [],
    );
  return (await db
    .prepare('SELECT codigo, texto FROM codigos_cr ORDER BY codigo ASC')
    .all()) as unknown as CodigoCR[];
}

/** Reads one código CR, or `null` when the catálogo does not carry it. */
export async function findCodigoCR(
  db: Database,
  codigo: string,
): Promise<CodigoCR | null> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof findCodigoCR>>>(
      'codigos-cr.findCodigoCR',
      [codigo],
    );
  const row = (await db
    .prepare('SELECT codigo, texto FROM codigos_cr WHERE codigo = ?')
    .get(codigo)) as unknown as CodigoCR | undefined;

  return row ?? null;
}

/**
 * Replaces the catálogo with `codigos`. The catálogo mirrors an external
 * source, so importing it again is a full replacement rather than a merge —
 * a código dropped at the source must disappear here too.
 */
export async function replaceCodigosCR(
  db: Database,
  codigos: CodigoCR[],
): Promise<number> {
  if (env.dataApiUrl)
    return callData<Awaited<ReturnType<typeof replaceCodigosCR>>>(
      'codigos-cr.replaceCodigosCR',
      [codigos],
    );
  const insert = db.prepare(
    'INSERT INTO codigos_cr (codigo, texto) VALUES (?, ?)',
  );

  await transaction(db, async () => {
    await db.exec('DELETE FROM codigos_cr');
    for (const { codigo, texto } of codigos) {
      await insert.run(codigo, texto);
    }
  });

  return codigos.length;
}
