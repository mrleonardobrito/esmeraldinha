import {
  isValidCpf,
  onlyDigits,
  professorSchema,
  professorUpdateSchema,
  type ProfessorField,
  type ProfessorInput,
  type ProfessorUpdateInput,
} from "@shared/professor";

export { isValidCpf, onlyDigits, professorSchema, professorUpdateSchema };
export type { ProfessorField, ProfessorInput, ProfessorUpdateInput };

/** Data URLs travel to the API as JSON, so the image has to fit comfortably in a request body. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

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

/** Applies the 000.000.000-00 mask as the user types. */
export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

/** Esconde o final do CPF, deixando visíveis só os primeiros dígitos. */
export function maskCpf(value: string) {
  const formatted = formatCpf(value);
  return (
    formatted.slice(0, 5) + formatted.slice(5).replace(/\d/g, "*")
  );
}

/**
 * A professor as returned by the API. The senha is write-only across this
 * boundary — the API never includes it in a response — so it is optional
 * here rather than on `ProfessorInput`, which the cadastro form uses.
 */
export type Professor = Omit<ProfessorInput, "senha"> & {
  senha?: string;
  id: string;
  createdAt: string;
};

/** Lista os professores cadastrados. */
export async function loadProfessores(): Promise<Professor[]> {
  const response = await requestApi("/api/professores");
  return (await response.json()) as Professor[];
}

/** Cadastra um novo professor. */
export async function createProfessor(
  input: ProfessorInput,
): Promise<Professor> {
  const response = await requestApi("/api/professores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await response.json()) as Professor;
}

/**
 * Atualiza um professor cadastrado. Omitir `senha` deixa a senha
 * armazenada intacta.
 */
export async function updateProfessor(
  id: string,
  input: ProfessorUpdateInput,
): Promise<Professor> {
  const response = await requestApi(`/api/professores/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await response.json()) as Professor;
}

/** Exclui um professor cadastrado. */
export async function deleteProfessor(id: string): Promise<void> {
  await requestApi(`/api/professores/${id}`, { method: "DELETE" });
}

export function getInitials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("O arquivo selecionado não é uma imagem."));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("A imagem precisa ter no máximo 1 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}
