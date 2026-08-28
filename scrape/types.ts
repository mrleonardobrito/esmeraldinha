export type SimNao = 'Sim' | 'Não';

export interface ProfessorCredenciais {
  readonly username: string;
  readonly password: string;
  readonly school: string;
}

export interface Aula {
  readonly date: string;
  readonly order?: number;
  readonly remedialClass?: SimNao;
  readonly guardianInteraction?: SimNao;
  readonly curriculumCodes?: string;
  readonly aulaPlan?: string;
  readonly homework?: string;
}

export interface AulaBatch {
  readonly term: string;
  readonly classGroup: string;
  readonly month: string;
  readonly aulas: readonly Aula[];
}

export type FieldStatus = 'skipped' | 'disabled' | 'unchanged' | 'updated';

export interface AulaFailure {
  readonly aula: string;
  readonly reason: string;
}

export interface BatchResult {
  readonly succeeded: readonly string[];
  readonly failed: readonly AulaFailure[];
}