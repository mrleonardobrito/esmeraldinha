export enum ReductionDay {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
}

export enum DiaryType {
  C1 = 'c1',
  C2 = 'c2',
}

export interface School {
  readonly id: number
  readonly name: string
  readonly code: number
}

export interface Class {
  readonly id: number
  readonly code: string
  readonly label: string
  readonly school_id: number
  readonly teacher_id: number
  readonly school: School
  readonly teacher: Teacher
}

export interface ClassResumed {
  readonly id: number
  readonly code: string
  readonly label: string
  readonly school: School
}

export interface ClassUpdate {
  code?: string
  label?: string
  school_id?: number
  teacher_id?: number
}

export const classUpdateMapper: {
  [K in keyof ClassUpdate]: (
    value: ClassUpdate[K],
  ) => Partial<ClassUpdate>;
} = {
  code: value => ({
    code: (value as string).trim(),
  }),
  label: value => ({
    label: (value as string).trim(),
  }),
  school_id: value => ({
    school_id: value as number,
  }),
  teacher_id: value => ({
    teacher_id: value as number,
  }),
}

export const mapClassUpdate = <K extends keyof ClassUpdate>(
  key: K,
  value: ClassUpdate[K],
): Partial<ClassUpdate> => {
  const mapper = classUpdateMapper[key]
  if (!mapper) return {}
  return mapper(value)
}

export interface ClassCreate {
  readonly code: string
  readonly label: string
  readonly school_id: number
}

export interface Gradebook {
  readonly id: number
  readonly title: string
  readonly status: GradebookStatus
  readonly teacher: Teacher
  readonly calendar: AcademicCalendar
  readonly progress: number
  readonly created_at: string
}

export interface GradebookCreate {
  readonly teacher_id: number
  readonly calendar_id: number
  readonly class_id: number
  readonly title: string
  readonly progress?: number
}

export interface GradebookUpdate {
  readonly teacher_id?: number
  readonly calendar_id?: number
  readonly status?: GradebookStatus
  readonly title?: string
  readonly progress?: number
}

export enum GradebookStatus {
  PENDING = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface GradebookStatusColumn {
  readonly id: GradebookStatus
  readonly title: string
  readonly color: 'warning' | 'primary' | 'success' | 'error'
  readonly description: string
}

export const gradebookStatusColumns: GradebookStatusColumn[] = [
  {
    id: GradebookStatus.PENDING,
    title: 'Pendente',
    color: 'warning' as const,
    description: 'Gradebooks aguardando processamento',
  },
  {
    id: GradebookStatus.IN_PROGRESS,
    title: 'Em andamento',
    color: 'primary' as const,
    description: 'Gradebooks em processamento',
  },
  {
    id: GradebookStatus.COMPLETED,
    title: 'Concluída',
    color: 'success' as const,
    description: 'Gradebooks finalizadas',
  },
  {
    id: GradebookStatus.CANCELLED,
    title: 'Cancelada',
    color: 'error' as const,
    description: 'Gradebooks canceladas',
  },
] as const

export interface Teacher {
  readonly profile_img?: string
  readonly id: number
  readonly name: string
  readonly code: string
  readonly reduction_day: number
  readonly diary_type: string
  readonly school: School
  readonly classes: ClassResumed[]
}

export interface TeacherCreate {
  readonly code: string
  readonly name: string
  readonly password: string
  readonly reduction_day: number
  readonly diary_type: string
  readonly class_ids: number[]
}

export interface TeacherUpdate {
  code?: string
  reduction_day?: number
  diary_type?: string
  school_id?: number
  name?: string
  class_ids?: number[]
}

export const teacherUpdateMapper: {
  [K in keyof TeacherUpdate]: (
    value: TeacherUpdate[K],
  ) => Partial<TeacherUpdate>;
} = {
  name: value => ({
    name: (value as string).trim(),
  }),
  code: value => ({
    code: (value as string).trim(),
  }),
  reduction_day: value => ({
    reduction_day: value as ReductionDay,
  }),
  diary_type: value => ({
    diary_type: value as DiaryType,
  }),
  class_ids: value => ({
    class_ids: value as number[],
  }),
  school_id: value => ({
    school_id: value as number,
  }),
}

export const mapTeacherUpdate = <K extends keyof TeacherUpdate>(
  key: K,
  value: TeacherUpdate[K],
): Partial<TeacherUpdate> => {
  const mapper = teacherUpdateMapper[key]
  if (!mapper) return {}
  return mapper(value)
}

export interface AcademicCalendar {
  readonly id: number
  readonly year: number
  readonly calendar_data: CalendarData
  readonly processed_at: string
}

export type DayType
  = | 'letivo'
    | 'nao_letivo'
    | 'feriado_nacional'
    | 'feriado_municipal'
    | 'ponto_facultativo'
    | 'ferias'
    | 'recesso'
    | 'planejamento'
    | 'avaliacao_recuperacao'
    | 'evento'

export type StageId = 'I' | 'II' | 'III' | 'IV'

export interface Stage {
  id: StageId
  start_date: string
  end_date: string
}

export interface Day {
  date: string
  type: DayType
  stage?: StageId
  labels: string[]
}

export interface LegendItem {
  type: DayType
  description: string
  color_hex?: string
}

export interface MonthlyMeta {
  month: number
  school_days: number
}

export interface CalendarData {
  year: number
  stages: Stage[]
  days: Day[]
  legend: LegendItem[]
  monthly_meta?: MonthlyMeta[]
}
