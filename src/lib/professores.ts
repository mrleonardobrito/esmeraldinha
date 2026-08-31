import {
  isValidCpf,
  onlyDigits,
  professorSchema,
  type ProfessorField,
  type ProfessorInput,
} from "@shared/professor";

export { isValidCpf, onlyDigits, professorSchema };
export type { ProfessorField, ProfessorInput };

const STORAGE_KEY = "esmeraldinha:professores";

/** Data URLs go into localStorage, so the image has to fit in it. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

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

export type Professor = ProfessorInput & {
  id: string;
  createdAt: string;
};

export function loadProfessores(): Professor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored.filter((item): item is Professor => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        professorSchema.safeParse(candidate).success
      );
    });
  } catch {
    return [];
  }
}

export function saveProfessores(professores: Professor[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(professores));
}

export function createProfessor(input: ProfessorInput): Professor {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

export function isLoginTaken(
  professores: Professor[],
  login: string,
  ignoredId?: string,
) {
  const target = onlyDigits(login);
  return professores.some(
    (professor) =>
      professor.id !== ignoredId && onlyDigits(professor.login) === target,
  );
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
