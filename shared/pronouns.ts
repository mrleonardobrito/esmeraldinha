import { z } from 'zod';

export const pronounsSchema = z.object({
  pronouns: z.enum(['ele/dele', 'ela/dela']).nullable(),
});

export type Pronouns = z.infer<typeof pronounsSchema>['pronouns'];

export function professorGreeting(nome: string, pronouns?: Pronouns): string {
  const greeting = pronouns === 'ela/dela' ? 'Bem-vinda' : 'Bem-vindo';
  return `${greeting}, ${nome.trim() || 'professor'}!`;
}
