import { z } from 'zod'
import { DiaryType, ReductionDay } from '@types'

export const teacherFormSchema = z.object({
  code: z
    .string()
    .min(1, 'Código é obrigatório')
    .max(6, 'Código deve ter no máximo 6 caracteres'),
  reduction_day: z.nativeEnum(ReductionDay),
  diary_type: z.nativeEnum(DiaryType),
  school_id: z.number().min(1, 'Escola é obrigatória'),
})

export type TeacherFormSchema = typeof teacherFormSchema
