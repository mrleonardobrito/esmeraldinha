import { z } from "zod";

const STORAGE_KEY = "esmeraldinha:professores";

/** Data URLs go into localStorage, so the image has to fit in it. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Applies the 000.000.000-00 mask as the user types. */
export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i++) {
      sum += Number(cpf[i]) * (position + 1 - i);
    }
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[position])) return false;
  }

  return true;
}

export const professorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, "Informe o nome com pelo menos 3 caracteres."),
  login: z
    .string()
    .transform(onlyDigits)
    .refine((cpf) => cpf.length === 11, "O CPF precisa ter 11 dígitos.")
    .refine(isValidCpf, "CPF inválido."),
  senha: z.string().min(4, "A senha precisa ter pelo menos 4 caracteres."),
  escola: z.string().trim().min(2, "Informe a escola do professor."),
  imagem: z.string().optional(),
});

export type ProfessorInput = z.infer<typeof professorSchema>;

export type Professor = ProfessorInput & {
  id: string;
  createdAt: string;
};

export type ProfessorField = keyof ProfessorInput;

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
