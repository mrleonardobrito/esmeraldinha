export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super(
      'OPENROUTER_API_KEY não está configurada. Sem ela a Esmeraldinha não ' +
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
      `O material enviado parece ser de ${parte}, que a Esmeraldinha ainda ` +
        'não preenche. Por enquanto só o conteúdo das aulas é gravado.',
    );
    this.name = 'ParteNaoSuportadaError';
  }
}
