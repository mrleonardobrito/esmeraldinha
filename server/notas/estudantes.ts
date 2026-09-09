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
    /** A matrícula que o material trouxe, quando ela também não era da turma. */
    readonly matricula?: string,
  ) {
    super(
      (matricula
        ? `Nem a matrícula ${matricula} nem o nome "${nome}" são de algum ` +
          'estudante da turma. '
        : `Nenhum estudante da turma se chama "${nome}". `) +
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

/** Uma matrícula comparável: sem espaço, sem pontuação, sem caixa. */
function normalizarMatricula(matricula: string): string {
  return matricula.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/**
 * A matrícula do estudante a que a nota pertence.
 *
 * A matrícula do material manda: ela é a chave do portal, e o nome que vem
 * junto erra com frequência — `ALEYF` por `ALEFY`, `IKARO` por `ICARO`.
 * Quando ela é de um estudante da turma, o nome não chega a ser conferido.
 *
 * Uma matrícula que não é de ninguém da turma não descarta a nota: o material
 * pode ter vindo de uma exportação com a numeração de outro ano, e o nome
 * ainda achar o estudante. Os dois critérios erram em ocasiões diferentes, e
 * juntos salvam a nota que qualquer um deles sozinho perderia.
 *
 * @throws {EstudanteNaoEncontradoError} quando nem a matrícula nem o nome casam.
 * @throws {EstudanteAmbiguoError} quando o nome, sem matrícula que valha, serve a mais de um.
 */
export function resolverMatriculaDaNota(
  nota: { readonly matricula?: string; readonly estudante: string },
  estudantes: readonly EstudanteConhecido[],
): string {
  const informada = normalizarMatricula(nota.matricula ?? '');

  if (informada !== '') {
    const daTurma = estudantes.find(
      (estudante) => normalizarMatricula(estudante.matricula) === informada,
    );

    if (daTurma) return daTurma.matricula;
  }

  try {
    return resolverMatricula(nota.estudante, estudantes);
  } catch (error) {
    // Quem lê o erro precisa saber que a matrícula também foi tentada, ou vai
    // procurar só pelo nome o que estava errado nos dois.
    if (informada !== '' && error instanceof EstudanteNaoEncontradoError) {
      throw new EstudanteNaoEncontradoError(
        error.nome,
        error.conhecidos,
        nota.matricula,
      );
    }

    throw error;
  }
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
