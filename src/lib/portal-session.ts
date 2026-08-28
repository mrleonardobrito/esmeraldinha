import type { Professor } from "@/lib/professores";

export interface PortalSession {
  sessionId: string;
  escola: string;
  expiresInMs: number;
}

const API_OFFLINE =
  "A API local não respondeu. Confira se o `pnpm dev` está rodando (ele sobe o Vite e a API juntos).";

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

async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(path, init);
  } catch {
    throw new Error(API_OFFLINE);
  }

  if (response.ok) return response;

  const apiError = await readApiError(response);
  if (apiError) throw new Error(apiError);

  // Sem JSON num 5xx é o proxy do Vite sem ninguém atrás dele.
  throw new Error(
    response.status >= 500
      ? `${API_OFFLINE} (HTTP ${response.status})`
      : `Falha inesperada ao falar com a API (HTTP ${response.status}).`,
  );
}

/** Abre uma sessão headless no portal usando as credenciais do professor. */
export async function openPortalSession(
  professor: Professor,
): Promise<PortalSession> {
  const response = await requestApi("/api/cadernetas/sessoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: professor.login,
      senha: professor.senha,
      escola: professor.escola,
    }),
  });

  return (await response.json()) as PortalSession;
}

export async function closePortalSession(sessionId: string): Promise<void> {
  await fetch(`/api/cadernetas/sessoes/${sessionId}`, {
    method: "DELETE",
  }).catch(() => {
    // encerrar sessão é best-effort: ela expira sozinha por ociosidade
  });
}
