import { createProfessor, loadProfessores, onlyDigits } from "@/lib/professores";

const STORAGE_KEY = "esmeraldinha:professores";

/**
 * Minimal `Storage` surface the migration needs. Lets tests inject an
 * in-memory implementation instead of reaching for the `localStorage`
 * global (there is no jsdom/browser test environment configured yet).
 */
export interface MigrationStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

interface LegacyProfessor {
  nome: string;
  login: string;
  senha: string;
  escola: string;
  imagem?: string;
}

function isLegacyProfessor(value: unknown): value is LegacyProfessor {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nome === "string" &&
    typeof candidate.login === "string" &&
    typeof candidate.senha === "string" &&
    typeof candidate.escola === "string" &&
    (candidate.imagem === undefined || typeof candidate.imagem === "string")
  );
}

/**
 * Carrega os professores cadastrados na versão anterior de Esmeraldinha
 * (guardados em `localStorage`, sob a chave `esmeraldinha:professores`)
 * para a API/SQLite.
 *
 * Roda uma vez: se não houver nada guardado, não faz nada. É best-effort e
 * retomável — a chave antiga só é removida depois que todo professor foi
 * movido com sucesso; qualquer falha no meio do caminho deixa a chave
 * intacta para uma nova tentativa, e uma nova tentativa nunca duplica um
 * professor já migrado.
 */
export async function migrateProfessoresFromLocalStorage(
  storage: MigrationStorage = typeof localStorage === "undefined"
    ? { getItem: () => null, removeItem: () => {} }
    : localStorage,
): Promise<void> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    // Dado corrompido: nada seguro a migrar, mas também nada a apagar.
    return;
  }

  if (!Array.isArray(stored)) return;

  const professoresLegados = stored.filter(isLegacyProfessor);
  if (professoresLegados.length === 0) {
    storage.removeItem(STORAGE_KEY);
    return;
  }

  let loginsExistentes: Set<string>;
  try {
    const existentes = await loadProfessores();
    loginsExistentes = new Set(existentes.map((p) => onlyDigits(p.login)));
  } catch {
    // API fora do ar: tenta de novo na próxima inicialização.
    return;
  }

  const pendentes = professoresLegados.filter(
    (professor) => !loginsExistentes.has(onlyDigits(professor.login)),
  );

  for (const professor of pendentes) {
    try {
      await createProfessor({
        nome: professor.nome,
        login: professor.login,
        senha: professor.senha,
        escola: professor.escola,
        imagem: professor.imagem,
      });
    } catch {
      // Falhou no meio: deixa a chave intacta para tentar de novo depois.
      return;
    }
  }

  storage.removeItem(STORAGE_KEY);
}
