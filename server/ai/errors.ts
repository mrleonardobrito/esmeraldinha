export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super(
      'OPENROUTER_API_KEY não está configurada. Sem ela o sistema não ' +
        'consegue ler o material enviado pelo professor.',
    );
    this.name = 'OpenRouterNotConfiguredError';
  }
}

export class OpenRouterError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/** O agente respondeu algo que não bate com o catálogo do professor. */
export class EnvioInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvioInvalidoError';
  }
}

export class ParteNaoSuportadaError extends Error {
  constructor(readonly parte: string) {
    super(
      `O material enviado parece ser de ${parte}, que o sistema ainda ` +
        'não preenche. Por enquanto só o conteúdo das aulas é gravado.',
    );
    this.name = 'ParteNaoSuportadaError';
  }
}

/** O arquivo de Word ou Excel não pôde ser lido — corrompido ou senha. */
export class ArquivoIlegivelError extends Error {
  constructor(
    readonly filename: string,
    cause: unknown,
  ) {
    super(`Não foi possível ler o arquivo "${filename}". Ele pode estar corrompido ou protegido por senha.`);
    this.name = 'ArquivoIlegivelError';
    this.cause = cause;
  }
}
