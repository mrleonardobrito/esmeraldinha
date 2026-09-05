export const API_OFFLINE =
  "A API local não respondeu. Confira se o `pnpm dev` está rodando (ele sobe o Vite e a API juntos).";

/**
 * Um erro que a API respondeu de propósito, com o status HTTP junto — para
 * quem chamou distinguir, por exemplo, uma sessão que expirou (404) de
 * qualquer outra falha, sem precisar comparar a mensagem em português.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Lê o `{ error }` da API; devolve null se a resposta não for JSON. */
async function readApiError(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const { error } = body as Record<string, unknown>;
      if (typeof error === "string") return error;
    }
  } catch {
    // sem corpo JSON — provavelmente não foi a API que respondeu
  }
  return null;
}

export async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(API_OFFLINE);
  }

  if (response.ok) return response;

  const apiError = await readApiError(response);
  if (apiError) throw new ApiError(apiError, response.status);

  // Sem JSON num 5xx é o proxy do Vite sem ninguém atrás dele.
  throw new ApiError(
    response.status >= 500
      ? `${API_OFFLINE} (HTTP ${response.status})`
      : `Falha inesperada ao falar com a API (HTTP ${response.status}).`,
    response.status,
  );
}

