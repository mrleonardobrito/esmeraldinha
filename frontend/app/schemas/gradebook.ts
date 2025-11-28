import { z } from 'zod'

export const gradebookFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Título é obrigatório')
    .max(200, 'Título muito longo'),
  teacher_id: z.number().min(1, 'Professor é obrigatório'),
  calendar_id: z.number().min(1, 'Calendário é obrigatório'),
  progress: z.number().min(0).max(100).default(0),
})

export type GradebookFormSchema = typeof gradebookFormSchema
