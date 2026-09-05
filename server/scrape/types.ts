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

/** Uma disciplina da etapa e as avaliações cadastradas nela. */
export interface DisciplinaOptions {
  readonly nome: string;
  readonly avaliacoes: readonly AvaliacaoDoPortal[];
}

export interface EtapaOptions {
  readonly nome: string;
  readonly turmas: readonly string[];
  readonly meses: readonly string[];
  /**
   * As disciplinas da etapa com as avaliações de cada uma. Vazio quando o
   * professor ainda não as cadastrou no portal — e aí não há nota a lançar.
   */
  readonly disciplinas?: readonly DisciplinaOptions[];
}

/** As opções válidas de Lançamento de Conteúdo para o professor da sessão. */
export interface ConteudoCatalogo {
  readonly etapas: readonly EtapaOptions[];
}

export type FieldStatus = 'skipped' | 'disabled' | 'unchanged' | 'updated';

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

/**
 * Uma avaliação da etapa: é ela que dá as colunas do boletim. O portal exige
 * que exista antes de qualquer nota ser lançada.
 */
export interface AvaliacaoDoPortal {
  readonly nome: string;
  readonly tipo?: string;
  readonly data?: string;
  /** O valor máximo da avaliação; ausente quando o portal não o informa. */
  readonly valor?: number;
  /** A média que o portal exibe junto do valor. */
  readonly media?: number;
}

/**
 * As notas da linha do estudante que não pertencem a nenhuma avaliação. O
 * portal calcula duas delas — `calculada` e `parcial` chegam desabilitadas e
 * só são lidas; `personalizada` e `final` é que se escreve.
 */
export interface NotaDoEstudante {
  readonly matricula: string;
  readonly personalizada?: number;
  readonly final?: number;
  readonly calculada?: number;
  readonly parcial?: number;
}

/** Uma nota que o portal já tem, chaveada como ele a chaveia. */
export interface NotaDoPortal {
  readonly matricula: string;
  readonly avaliacao: string;
  readonly valor: number;
}

/** O boletim de uma etapa como o portal o mostra. */
export interface BoletimDoPortal {
  readonly avaliacoes: readonly AvaliacaoDoPortal[];
  readonly notas: readonly NotaDoPortal[];
  readonly notasDoEstudante: readonly NotaDoEstudante[];
}

/**
 * Onde o boletim mora no portal. A disciplina só tem opções quando a etapa
 * tem avaliação cadastrada, então ela é opcional: sem avaliação não há nem
 * disciplina nem tabela.
 */
export interface BoletimFilter {
  readonly etapa: string;
  readonly turma: string;
  readonly disciplina?: string;
}

/** Uma nota a escrever, já resolvida na matrícula do estudante. */
export interface NotaParaLancar {
  readonly matricula: string;
  readonly avaliacao: string;
  readonly valor: number;
}

/** Onde as notas moram no portal, mais o que escrever nelas. */
export interface PreenchimentoDeNotasFilter {
  readonly etapa: string;
  readonly turma: string;
  readonly disciplina?: string;
  readonly notas: readonly NotaParaLancar[];
  /** A nota personalizada e a final da etapa, por estudante. */
  readonly notasDoEstudante?: readonly NotaDoEstudante[];
}

/** Um estudante como o portal o lista na turma. */
export interface EstudanteDoPortal {
  readonly matricula: string;
  readonly nome: string;
  readonly situacao?: string;
  /** Como o portal a escreve, em DD/MM/AAAA. */
  readonly dataMatricula?: string;
}
