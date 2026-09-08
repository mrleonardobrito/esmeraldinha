/**
 * O guia de boas-vindas se impõe uma vez só. Depois de visto, ele volta apenas
 * quando o auxiliar de ensino o pede pelo cabeçalho — por isso a marca mora no
 * `localStorage`: ela é de quem usa a máquina, não do domínio, e perdê-la custa
 * apenas ver o guia de novo.
 */
const STORAGE_KEY = "esmeraldinha:welcome-seen";

/**
 * Não há armazenamento nos testes, e um navegador que bloqueia dados de site
 * chega a lançar daqui. Nada aqui assume que ele existe: um guia que aparece
 * duas vezes é melhor do que uma tela que não monta.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function hasSeenWelcome(): boolean {
  try {
    return storage()?.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markWelcomeAsSeen(): void {
  try {
    storage()?.setItem(STORAGE_KEY, "true");
  } catch {
    // Nada a fazer: o guia aparece de novo na próxima vez, e é só isso.
  }
}
