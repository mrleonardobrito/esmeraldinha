import { requestApi } from "@/lib/api";
import { nomeCurtoDaTurma } from "@shared/turma";

export { nomeCurtoDaTurma };

/**
 * Uma turma do professor, como o portal a nomeia. Ela não é digitada: o
 * cadastro do professor a descobre no portal, e o turno sai do próprio nome.
 */
export interface Turma {
  id: string;
  professorId: string;
  nome: string;
  /** Lido do fim do nome da turma; nulo quando o portal não o escreveu. */
  turno: string | null;
  totalDeEstudantes: number;
  createdAt: string;
}

export interface EstudanteDaTurma {
  matricula: string;
  nome: string;
  situacao: string | null;
  /** Nulo enquanto a busca de estudantes não estiver implementada. */
  dataMatricula: string | null;
}

/** Confere no portal se o login, a senha e a escola fazem login de verdade. */
export async function validarCredenciais(input: {
  login: string;
  senha: string;
  escola: string;
}): Promise<{ valida: boolean; escola: string }> {
  const response = await requestApi("/api/turmas/validacoes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return (await response.json()) as { valida: boolean; escola: string };
}

/** Lê no portal as turmas em que o professor trabalha e passa a guardá-las. */
export async function buscarTurmas(professorId: string): Promise<Turma[]> {
  const response = await requestApi("/api/turmas/buscas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ professorId }),
  });
  const body = (await response.json()) as { turmas: Turma[] };

  return body.turmas;
}

/** As turmas já conhecidas de um professor, sem ir ao portal. */
export async function loadTurmas(professorId: string): Promise<Turma[]> {
  const response = await requestApi(
    `/api/turmas?professorId=${encodeURIComponent(professorId)}`,
  );
  const body = (await response.json()) as { turmas: Turma[] };

  return body.turmas;
}

export async function loadEstudantes(turmaId: string): Promise<EstudanteDaTurma[]> {
  const response = await requestApi(`/api/turmas/${turmaId}/estudantes`);
  const body = (await response.json()) as { estudantes: EstudanteDaTurma[] };

  return body.estudantes;
}

/**
 * Lê no portal os estudantes de uma turma.
 *
 * TODO: o servidor ainda devolve lista vazia — falta ler a tela de presença.
 * Ver `server/turmas/busca.ts`.
 */
export async function buscarEstudantes(
  turmaId: string,
  sessionId: string,
): Promise<EstudanteDaTurma[]> {
  const response = await requestApi(`/api/turmas/${turmaId}/estudantes/buscas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const body = (await response.json()) as { estudantes: EstudanteDaTurma[] };

  return body.estudantes;
}
