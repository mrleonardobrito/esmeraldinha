export type SimNao = 'Sim' | 'Não';

export interface ProfessorCredenciais {
  readonly login: string;
  readonly senha: string;
  readonly escola: string;
}

export interface Aula {
  readonly data: string;
  readonly isRecuperacao?: SimNao;
  readonly isInteracao?: SimNao;
  readonly ordem?: number;
  readonly codigoCR?: string;
  readonly desenvolvimento?: string;
  readonly ferramentas?: string;
}

export interface LancaConteudoFilter {
  readonly etapa: string;
  readonly reducao: string;
  readonly mes: string;
  readonly turma: string;
  readonly aulas: readonly Aula[];
}

export type FieldStatus = 'skipped' | 'disabled' | 'unchanged' | 'updated';

export interface AulaFailure {
  readonly aula: string;
  readonly reason: string;
}

export interface WriteResult {
  readonly succeeded: readonly string[];
  readonly failed: readonly AulaFailure[];
}