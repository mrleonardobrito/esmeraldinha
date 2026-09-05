import type { DatabaseSync } from 'node:sqlite';

/**
 * One curriculum reference an aula's conteúdo can be recorded against — the
 * código CR the portal asks for, plus the habilidade it stands for.
 */
export interface CodigoCR {
  codigo: string;
  texto: string;
}

/** Lists the catálogo de códigos CR in código order. */
export function listCodigosCR(db: DatabaseSync): CodigoCR[] {
  return db
    .prepare('SELECT codigo, texto FROM codigos_cr ORDER BY codigo ASC')
    .all() as unknown as CodigoCR[];
}

/** Reads one código CR, or `null` when the catálogo does not carry it. */
export function findCodigoCR(db: DatabaseSync, codigo: string): CodigoCR | null {
  const row = db
    .prepare('SELECT codigo, texto FROM codigos_cr WHERE codigo = ?')
    .get(codigo) as unknown as CodigoCR | undefined;

  return row ?? null;
}

/**
 * Replaces the catálogo with `codigos`. The catálogo mirrors an external
 * source, so importing it again is a full replacement rather than a merge —
 * a código dropped at the source must disappear here too.
 */
export function replaceCodigosCR(db: DatabaseSync, codigos: CodigoCR[]): number {
  const insert = db.prepare('INSERT INTO codigos_cr (codigo, texto) VALUES (?, ?)');

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM codigos_cr');
    for (const { codigo, texto } of codigos) {
      insert.run(codigo, texto);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return codigos.length;
}
