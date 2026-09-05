/**
 * Os turnos que o portal usa. Ele não tem campo de turno: escreve o turno no
 * fim do nome da turma, como em `PRÉ-ESCOLA I - PRÉ-ESCOLA I - B - INTEGRAL`.
 */
const TURNOS = ['MATUTINO', 'VESPERTINO', 'INTEGRAL'] as const;

export type Turno = (typeof TURNOS)[number];

/**
 * O turno escrito no fim do nome da turma, ou `null` quando o portal não o
 * escreveu — nem toda turma segue o padrão, e inventar um turno é pior do que
 * não ter nenhum.
 */
export function turnoDaTurma(turma: string): Turno | null {
  const sufixo = turma.split('-').at(-1)?.trim().toUpperCase();

  return TURNOS.find((turno) => turno === sufixo) ?? null;
}

/**
 * O nome curto da turma: o que a distingue das outras da mesma série.
 *
 * O portal escreve o nome inteiro como `<série> - <turma> - <turno>`, e tanto
 * a série quanto o turno já aparecem em volta na tela — repetir os três é ler
 * `9º ANO` duas vezes para saber que a turma é a B. Sobra o miolo:
 * `9º ANO - 9º ANO B - MATUTINO` vira `9º ANO B`, e
 * `PRÉ-ESCOLA II - PRÉ-ESCOLA II - C - INTEGRAL` vira `PRÉ-ESCOLA II - C`,
 * porque a série que abre o nome é retirada inteira, com hífens e tudo.
 *
 * Nomes fora do padrão voltam como estão: um nome que não é `série - turma -
 * turno` não tem miolo para tirar, e encurtar no chute é pior do que não
 * encurtar.
 */
export function nomeCurtoDaTurma(turma: string): string {
  const nome = turma.trim();
  const semTurno = turnoDaTurma(nome)
    ? nome.slice(0, nome.lastIndexOf('-')).trim()
    : nome;

  // A série abre o nome e se repete no começo da turma: achá-la partindo o
  // nome no primeiro hífen não serve, porque a própria série pode ter um
  // (`PRÉ-ESCOLA`). Ela é o prefixo que o portal escreve duas vezes.
  const repetido = semTurno.match(/^(.+?)\s+-\s+\1\b/u);
  if (!repetido) return semTurno;

  return semTurno.slice(repetido[1].length).replace(/^\s*-\s*/u, '');
}
