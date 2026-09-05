/**
 * O material do professor traz nomes; o portal chaveia por matrícula. Este
 * módulo faz a ponte, e é ele que impede a nota de cair no estudante errado.
 */

/** Um estudante da turma, do jeito que a caderneta o guarda. */
export interface EstudanteConhecido {
  readonly matricula: string;
  readonly nome: string;
}

export class EstudanteNaoEncontradoError extends Error {
  constructor(
    readonly nome: string,
    readonly conhecidos: readonly string[],
  ) {
    super(
      `Nenhum estudante da turma se chama "${nome}". ` +
        `Estudantes da turma: ${conhecidos.join(', ') || 'nenhum'}.`,
    );
    this.name = 'EstudanteNaoEncontradoError';
  }
}

export class EstudanteAmbiguoError extends Error {
  constructor(
    readonly nome: string,
    readonly candidatos: readonly string[],
  ) {
    super(
      `"${nome}" combina com mais de um estudante da turma: ` +
        `${candidatos.join(', ')}. Use o nome completo.`,
    );
    this.name = 'EstudanteAmbiguoError';
  }
}

/**
 * Um nome comparável: sem acento, sem caixa, sem espaço sobrando. O professor
 * escreve "josé da silva" onde o portal tem "JOSE DA SILVA", e os dois são a
 * mesma pessoa.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A matrícula do estudante que o nome designa.
 *
 * Casa primeiro pelo nome inteiro. Só quando nada casa é que aceita o nome
 * parcial — o professor que escreve "Maria Clara" numa turma com uma única
 * Maria Clara dos Santos está falando dela. Um parcial que sirva a mais de um
 * estudante não escolhe nenhum: preencher a nota da pessoa errada é pior do
 * que não preencher nenhuma.
 *
 * @throws {EstudanteNaoEncontradoError} quando nenhum estudante casa.
 * @throws {EstudanteAmbiguoError} quando mais de um casa.
 */
export function resolverMatricula(
  nome: string,
  estudantes: readonly EstudanteConhecido[],
): string {
  const procurado = normalizarNome(nome);
  const nomes = estudantes.map((estudante) => estudante.nome);

  if (procurado === '') {
    throw new EstudanteNaoEncontradoError(nome, nomes);
  }

  const exatos = estudantes.filter(
    (estudante) => normalizarNome(estudante.nome) === procurado,
  );

  if (exatos.length === 1) return exatos[0].matricula;

  if (exatos.length > 1) {
    throw new EstudanteAmbiguoError(
      nome,
      exatos.map((estudante) => estudante.nome),
    );
  }

  // Um nome parcial só vale se for uma sequência de palavras inteiras do nome
  // do estudante: "Ana" não pode casar com "Joana".
  const parciais = estudantes.filter((estudante) =>
    ` ${normalizarNome(estudante.nome)} `.includes(` ${procurado} `),
  );

  if (parciais.length === 1) return parciais[0].matricula;

  if (parciais.length > 1) {
    throw new EstudanteAmbiguoError(
      nome,
      parciais.map((estudante) => estudante.nome),
    );
  }

  throw new EstudanteNaoEncontradoError(nome, nomes);
}
