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
