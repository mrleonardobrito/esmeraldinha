import type { DayType, StageId } from '@types'

export const DAY_TYPES = {
  LETIVO: 'letivo',
  EVENTO: 'evento',
  AVALIACAO_RECUPERACAO: 'avaliacao_recuperacao',
  PLANEJAMENTO: 'planejamento',
  NAO_LETIVO: 'nao_letivo',
  FERIADO_NACIONAL: 'feriado_nacional',
  FERIADO_MUNICIPAL: 'feriado_municipal',
  PONTO_FACULTATIVO: 'ponto_facultativo',
  FERIAS: 'ferias',
  RECESSO: 'recesso'
} as const

export const LETIVO_TYPES: DayType[] = [
  DAY_TYPES.LETIVO,
  DAY_TYPES.EVENTO,
  DAY_TYPES.AVALIACAO_RECUPERACAO,
  DAY_TYPES.PLANEJAMENTO
]

export const NAO_LETIVO_TYPES: DayType[] = [
  DAY_TYPES.NAO_LETIVO,
  DAY_TYPES.FERIADO_NACIONAL,
  DAY_TYPES.FERIADO_MUNICIPAL,
  DAY_TYPES.PONTO_FACULTATIVO,
  DAY_TYPES.FERIAS,
  DAY_TYPES.RECESSO
]

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  [DAY_TYPES.LETIVO]: 'Dia letivo',
  [DAY_TYPES.NAO_LETIVO]: 'Dia não letivo',
  [DAY_TYPES.FERIADO_NACIONAL]: 'Feriado nacional',
  [DAY_TYPES.FERIADO_MUNICIPAL]: 'Feriado municipal',
  [DAY_TYPES.PONTO_FACULTATIVO]: 'Ponto facultativo',
  [DAY_TYPES.FERIAS]: 'Férias',
  [DAY_TYPES.RECESSO]: 'Recesso',
  [DAY_TYPES.PLANEJAMENTO]: 'Planejamento',
  [DAY_TYPES.AVALIACAO_RECUPERACAO]: 'Avaliação / recuperação',
  [DAY_TYPES.EVENTO]: 'Evento'
}

export const DEFAULT_TYPE_COLORS: Record<DayType, string> = {
  [DAY_TYPES.LETIVO]: '#00FF88', // verde vibrante
  [DAY_TYPES.NAO_LETIVO]: '#9CA3AF', // cinza mais claro
  [DAY_TYPES.FERIADO_NACIONAL]: '#FF3333', // vermelho vibrante
  [DAY_TYPES.FERIADO_MUNICIPAL]: '#FF6600', // laranja vibrante
  [DAY_TYPES.PONTO_FACULTATIVO]: '#FFD700', // amarelo dourado
  [DAY_TYPES.FERIAS]: '#00BFFF', // azul céu vibrante
  [DAY_TYPES.RECESSO]: '#AA00FF', // roxo vibrante
  [DAY_TYPES.PLANEJAMENTO]: '#0066FF', // azul vibrante
  [DAY_TYPES.AVALIACAO_RECUPERACAO]: '#FF8800', // laranja vibrante
  [DAY_TYPES.EVENTO]: '#00FFAA' // verde água vibrante
}

export const STAGE_COLORS: Record<StageId, string> = {
  I: '#0066FF', // azul vibrante
  II: '#AA00FF', // roxo vibrante
  III: '#FF0066', // rosa vibrante
  IV: '#00FFCC' // ciano vibrante
}

export const CALENDAR_CONFIG = {
  ROWS: 3,
  COLUMNS: 4,
  HIGHLIGHT_OPACITY: '60', // 37% opacidade
  CIRCLE_OPACITY: '50' // 31% opacidade
} as const

