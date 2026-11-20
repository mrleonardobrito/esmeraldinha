import { z } from 'zod';

export const aulaParaVerificacaoSchema = z.object({
  mes: z.string().trim().min(1),
  data: z.string().trim().min(1),
  ordem: z.number().int().nonnegative().nullable(),
});

export const verificacaoDeConteudosSchema = z.object({
  etapa: z.string().trim().min(1),
  aulas: z.array(aulaParaVerificacaoSchema).min(1),
});

export const preenchimentoDeConteudosSchema = verificacaoDeConteudosSchema.extend({
  aulas: z.array(aulaParaVerificacaoSchema.extend({
    codigoCR: z.string(),
    desenvolvimento: z.string().trim().min(1),
    ferramentas: z.string(),
  })).min(1),
});

export type PreenchimentoDeConteudos = z.infer<typeof preenchimentoDeConteudosSchema>;
export type VerificacaoDeConteudos = z.infer<typeof verificacaoDeConteudosSchema>;
export interface ConteudosVerificados {
  aulas: (z.infer<typeof aulaParaVerificacaoSchema> & { preenchida: boolean })[];
}
