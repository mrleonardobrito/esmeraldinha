import { z } from "zod";

/**
 * Validation rules for a professor's data. Imported by both the renderer
 * (`src/lib/professores.ts`) and the server, so the API can enforce the
 * same rules the cadastro form already validates against.
 */

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
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
  // O banco guarda a ausência de imagem como NULL, e é assim que ela volta
  // da API para o formulário de edição: aceitamos os dois e normalizamos.
  imagem: z
    .string()
    .nullish()
    .transform((imagem) => imagem ?? undefined)
    .optional(),
});

export type ProfessorInput = z.infer<typeof professorSchema>;

export type ProfessorField = keyof ProfessorInput;

/**
 * Validation rules for editing a professor: everything `professorSchema`
 * requires, except the senha, which is optional — omitting it leaves the
 * stored senha untouched.
 */
export const professorUpdateSchema = professorSchema.extend({
  senha: professorSchema.shape.senha.optional(),
});

export type ProfessorUpdateInput = z.infer<typeof professorUpdateSchema>;
