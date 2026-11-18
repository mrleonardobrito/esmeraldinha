import { z } from "zod";

/**
 * Validation rules for a conta do auxiliar de ensino. Imported by both the
 * renderer (`src/lib/conta.ts`) and the server, so the API enforces the same
 * rules the forms already validate against.
 */

/** O mínimo aceito para a senha definitiva do auxiliar de ensino. */
export const MIN_SENHA = 8;

export const entrarSchema = z.object({
  login: z.string().trim().min(1, "Informe o login."),
  senha: z.string().min(1, "Informe a senha."),
  senhaLocal: z.string().optional(),
});

export type EntrarInput = z.infer<typeof entrarSchema>;

export const novaSenhaSchema = z.object({
  /** Current senha; omitted only for an explicitly verified recovery session. */
  senhaAtual: z.string().default(""),
  senha: z
    .string()
    .min(MIN_SENHA, `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`),
});

export type NovaSenhaInput = z.infer<typeof novaSenhaSchema>;

export const contaSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome com pelo menos 3 caracteres."),
  // Sem e-mail cadastrado o campo chega vazio; só o preenchido é validado.
  email: z
    .string()
    .trim()
    .nullish()
    .transform((email) => email ?? "")
    .refine(
      (email) => email === "" || z.email().safeParse(email).success,
      "E-mail inválido.",
    ),
  // O banco guarda a ausência de imagem como NULL, e é assim que ela volta
  // da API para o formulário: aceitamos os dois e normalizamos.
  imagem: z
    .string()
    .nullish()
    .transform((imagem) => imagem ?? undefined)
    .optional(),
});

export type ContaInput = z.infer<typeof contaSchema>;

export type ContaField = keyof ContaInput;

export const codigoDeAcessoSchema = z.object({
  login: z.string().trim().min(1),
  codigo: z.string().regex(/^\d{6,10}$/, 'Informe o código recebido por e-mail.'),
  senhaLocal: z.string().optional(),
});

export interface ConfiguracaoDeAcesso {
  configurada: boolean;
  precisaVincular: boolean;
}
