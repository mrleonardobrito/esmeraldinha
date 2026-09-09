/**
 * O token da sessão do auxiliar de ensino — a prova, guardada nesta máquina,
 * de que quem abriu o app já entrou com a senha da conta. Não confundir com a
 * sessão do portal, que é um navegador aberto com as credenciais de um
 * professor (`src/lib/sessao-de-trabalho.ts`).
 *
 * Ele mora no `localStorage` para uma recarga da janela não pedir a senha de
 * novo. Vale pouco sozinho: o servidor guarda as sessões em memória, então
 * fechar o app já derruba a sessão do outro lado, e um token órfão só rende
 * um 401 e a tela de entrada.
 */
const STORAGE_KEY = "esmeraldinha:sessao-do-auxiliar";

/**
 * Não há armazenamento nos testes, e um navegador que bloqueia dados de site
 * chega a lançar daqui. Pedir a senha de novo é pior do que uma tela que não
 * monta, então nada aqui assume que ele existe.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let token: string | null = (() => {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
})();

const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

export function lerToken(): string | null {
  return token;
}

export function guardarToken(novo: string): void {
  token = novo;
  try {
    storage()?.setItem(STORAGE_KEY, novo);
  } catch {
    // Sem armazenamento a sessão vale só enquanto a janela não recarregar.
  }
  avisar();
}

/** Esquece a sessão: ao sair, e sempre que a API responder 401. */
export function esquecerToken(): void {
  if (token === null) return;

  token = null;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nada a fazer: o token já não é usado a partir daqui.
  }
  avisar();
}

/**
 * Avisa quando a sessão muda. É por aqui que a tela volta para a entrada
 * quando a API recusa um token vencido no meio de um pedido qualquer.
 */
export function assinarSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
