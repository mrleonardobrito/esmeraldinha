export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

export class MissingAulaRowsError extends Error {
  constructor(readonly entries: readonly string[]) {
    super(`Aula rows not found: ${entries.join(', ')}`);
    this.name = 'MissingAulaRowsError';
  }
}

export class FieldTooLongError extends Error {
  constructor(
    readonly field: string,
    readonly actual: number,
    readonly max: number,
  ) {
    super(
      `${field}: text is ${actual} characters, the field accepts ${max}. ` +
        'Trim the generated content before submitting.',
    );
    this.name = 'FieldTooLongError';
  }
}

export class OptionNotFoundError extends Error {
  constructor(
    readonly label: string,
    readonly disponiveis: readonly string[] = [],
  ) {
    super(
      `Option not found in the menu: ${label}. ` +
        `Available options: ${disponiveis.join(', ') || '(none)'}.`,
    );
    this.name = 'OptionNotFoundError';
  }
}

/** The ficha offers answers other than R, RD and NR, which this version does not handle. */
export class FichaNaoSuportadaError extends Error {
  constructor(readonly opcoes: readonly string[]) {
    super(
      'Esta ficha de desempenho usa respostas que a Esmeraldinha ainda não preenche: ' +
        `${opcoes.join(', ')}. Preencha-a direto no portal.`,
    );
    this.name = 'FichaNaoSuportadaError';
  }
}

/** The dialog moved to another estudante before the conceitos were written. */
export class EstudanteTrocadoError extends Error {
  constructor(readonly esperada: string, readonly aberta: string) {
    super(`A ficha aberta é da matrícula ${aberta}, não da ${esperada}.`);
    this.name = 'EstudanteTrocadoError';
  }
}

/** The ficha's áreas or habilidades differ from the structure read before. */
export class FichaAlteradaError extends Error {
  constructor() {
    super('A ficha de desempenho mudou no portal desde a última leitura. Releia a ficha e revise as exceções.');
    this.name = 'FichaAlteradaError';
  }
}
