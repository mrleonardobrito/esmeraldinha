import type { DatabaseSync } from 'node:sqlite';

import { isReducao } from '../../shared/turma';
import { listCadernetas, type Caderneta, type SyncStatus } from './store';

const CACHE_TABLES = [
  'caderneta_etapas',
  'caderneta_aulas',
  'caderneta_estudantes',
  'caderneta_disciplinas',
  'caderneta_avaliacoes',
  'caderneta_notas',
  'caderneta_notas_do_estudante',
] as const;

interface Group {
  cadernetas: Caderneta[];
  turmas: string[];
}

function sumAmounts(values: readonly (number | null)[]): number | null {
  if (values.every((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function mergedSync(cadernetas: readonly Caderneta[]): {
  status: SyncStatus;
  syncedAt: string | null;
  error: string | null;
} {
  const syncedAt = cadernetas.every((caderneta) => caderneta.syncedAt !== null)
    ? cadernetas.map((caderneta) => caderneta.syncedAt!).sort()[0]
    : null;

  if (cadernetas.some((caderneta) => caderneta.syncStatus === 'falhou')) {
    const errors = [...new Set(cadernetas
      .filter((caderneta) => caderneta.syncStatus === 'falhou')
      .map((caderneta) => caderneta.syncError)
      .filter((error): error is string => Boolean(error)))];
    return {
      status: 'falhou',
      syncedAt,
      error: errors.join('\n') || 'Synchronization failed for at least one turma.',
    };
  }

  return {
    status: syncedAt !== null && cadernetas.every((caderneta) => caderneta.syncStatus === 'sincronizada')
      ? 'sincronizada'
      : 'pendente',
    syncedAt,
    error: null,
  };
}

/**
 * Consolidate known turmas de redução automatically without rereading the portal.
 * Existing groups remain intact; their remaining slots are filled before new
 * groups are formed. A running synchronization defers the entire reconciliation.
 */
export function reconcileCadernetasDeReducao(
  db: DatabaseSync,
  professorId: string,
): Caderneta[] {
  const current = listCadernetas(db, professorId);
  const rows = db.prepare(
    'SELECT nome, grupo_diario FROM turmas WHERE professor_id = ?',
  ).all(professorId) as unknown as { nome: string; grupo_diario: string | null }[];
  const turmasDeReducao = new Set(rows
    .filter((row) => isReducao(row.grupo_diario))
    .map((row) => row.nome));
  const candidates = current
    .filter((caderneta) => caderneta.turmas.length > 0 &&
      caderneta.turmas.every((turma) => turmasDeReducao.has(turma)))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  if (candidates.some((caderneta) => caderneta.syncStatus === 'sincronizando')) return current;

  const groups: Group[] = [];
  // Preserve established groups and their IDs before placing individual turmas.
  const ordered = [
    ...candidates.filter((caderneta) => caderneta.turmas.length > 1),
    ...candidates.filter((caderneta) => caderneta.turmas.length === 1),
  ];
  for (const caderneta of ordered) {
    const available = groups.find((group) => group.turmas.length + caderneta.turmas.length <= 4);
    if (available) {
      available.cadernetas.push(caderneta);
      available.turmas.push(...caderneta.turmas);
    } else {
      groups.push({ cadernetas: [caderneta], turmas: [...caderneta.turmas] });
    }
  }
  const merges = groups.filter((group) => group.cadernetas.length > 1);
  if (merges.length === 0) return current;

  db.exec('BEGIN');
  try {
    const insertMembership = db.prepare(
      'INSERT INTO caderneta_turmas (caderneta_id, professor_id, turma, posicao) VALUES (?, ?, ?, ?)',
    );
    const updateMetadata = db.prepare(`
      UPDATE cadernetas SET created_at = ?, synced_at = ?, sync_status = ?, sync_error = ?,
        valor_recebido = ?, valor_a_receber = ? WHERE id = ?
    `);
    for (const group of merges) {
      const survivor = group.cadernetas[0];
      for (const source of group.cadernetas.slice(1)) {
        for (const table of CACHE_TABLES) {
          db.prepare(`UPDATE ${table} SET caderneta_id = ? WHERE caderneta_id = ?`)
            .run(survivor.id, source.id);
        }
        db.prepare('DELETE FROM caderneta_turmas WHERE caderneta_id = ?').run(source.id);
        db.prepare('DELETE FROM cadernetas WHERE id = ?').run(source.id);
      }
      // Rebuild positions only after every source membership has been released.
      db.prepare('DELETE FROM caderneta_turmas WHERE caderneta_id = ?').run(survivor.id);
      group.turmas.forEach((turma, position) => {
        insertMembership.run(survivor.id, professorId, turma, position);
      });
      const sync = mergedSync(group.cadernetas);
      updateMetadata.run(
        group.cadernetas.map((caderneta) => caderneta.createdAt).sort()[0],
        sync.syncedAt,
        sync.status,
        sync.error,
        sumAmounts(group.cadernetas.map((caderneta) => caderneta.valorRecebido)),
        sumAmounts(group.cadernetas.map((caderneta) => caderneta.valorAReceber)),
        survivor.id,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return listCadernetas(db, professorId);
}
