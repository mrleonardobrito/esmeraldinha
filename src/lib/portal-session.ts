import { requestApi } from "@/lib/api";

export interface PortalSession {
  sessionId: string;
  escola: string;
  expiresInMs: number;
}

/**
 * Abre uma sessão headless no portal para o professor identificado por
 * `professorId`. A senha nunca sai do servidor: o backend resolve e
 * decifra as credenciais armazenadas antes de logar no portal.
 */
export async function openPortalSession(
  professorId: string,
): Promise<PortalSession> {
  const response = await requestApi("/api/cadernetas/sessoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ professorId }),
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
