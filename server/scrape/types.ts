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

export interface EtapaOptions {
  readonly nome: string;
  readonly turmas: readonly string[];
  readonly meses: readonly string[];
}

/** As opções válidas de Lançamento de Conteúdo para o professor da sessão. */
export interface ConteudoCatalogo {
  readonly etapas: readonly EtapaOptions[];
}

export interface LancaConteudoFilter {
  readonly etapa: string;
  /** O portal salva sem ela; fica aqui porque a tela a exibe. */
  readonly reducao?: string;
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

/** Uma aula como o portal a mostra na tela de Lançamento de Conteúdo. */
export interface AulaDoPortal {
  readonly data: string;
  readonly ordem?: number;
  /** O conteúdo que o portal já tem na linha; ausente quando o campo está vazio. */
  readonly codigoCR?: string;
  readonly desenvolvimento?: string;
  readonly ferramentas?: string;
  /** O portal já tem desenvolvimento nessa linha. */
  readonly preenchida: boolean;
}

/** Os campos de uma aula que o preenchimento assistido escreve na tela. */
export interface ConteudoDaAula {
  readonly codigoCR?: string;
  readonly desenvolvimento?: string;
  readonly ferramentas?: string;
  readonly isRecuperacao?: SimNao;
  readonly isInteracao?: SimNao;
}

/** Onde a aula mora no portal, mais o que escrever nela. */
export interface PreenchimentoAssistidoFilter {
  readonly etapa: string;
  readonly mes: string;
  readonly turma: string;
  readonly data: string;
  readonly ordem?: number;
  readonly conteudo: ConteudoDaAula;
}

export interface ListaDeAulasFilter {
  readonly etapa: string;
  readonly mes: string;
  readonly turma: string;
}

/** Um estudante como o portal o lista na turma. */
export interface EstudanteDoPortal {
  readonly matricula: string;
  readonly nome: string;
  readonly situacao?: string;
}
