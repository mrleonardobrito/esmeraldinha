import { requestApi } from "@/lib/api";
import type { Professor } from "@/lib/professores";

export interface PortalSession {
  sessionId: string;
  escola: string;
  expiresInMs: number;
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
