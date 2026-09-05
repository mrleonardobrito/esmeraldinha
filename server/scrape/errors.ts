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
