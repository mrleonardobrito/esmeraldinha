/** Um trecho do texto novo: `novo` marca o que não estava no texto anterior. */
export interface TrechoDoDiff {
  texto: string;
  novo: boolean;
}

/**
 * Separa em palavras e espaços, mantendo os espaços como tokens: assim o texto
 * remontado é idêntico ao original, e um espaço nunca aparece como mudança.
 */
function tokens(texto: string): string[] {
  return texto.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * O que mudou de um texto para outro, palavra a palavra — o suficiente para a
 * tela marcar o trecho que o agente acabou de reescrever num rascunho, em vez
 * de obrigar o auxiliar de ensino a reler o parágrafo inteiro para achá-lo.
 *
 * Só o lado novo interessa: uma palavra que sumiu não tem onde ser mostrada.
 * Trechos vizinhos com o mesmo estado saem juntos.
 */
export function diffDePalavras(anterior: string, atual: string): TrechoDoDiff[] {
  const a = tokens(anterior);
  const b = tokens(atual);

  // Maior subsequência comum, clássica: lcs[i][j] é o tamanho da LCS entre
  // a[i..] e b[j..]. Textos de aula são curtos; a tabela cabe folgada.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const trechos: TrechoDoDiff[] = [];
  const empurrar = (texto: string, novo: boolean) => {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.novo === novo) ultimo.texto += texto;
    else trechos.push({ texto, novo });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      empurrar(b[j], false);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i += 1;
    } else {
      empurrar(b[j], true);
      j += 1;
    }
  }

  while (j < b.length) {
    empurrar(b[j], true);
    j += 1;
  }

  // Um espaço só é "novo" quando está entre palavras novas: encostado num
  // trecho igual, ele pertence ao que já existia.
  return trechos.map((trecho, indice) => {
    if (!trecho.novo || trecho.texto.trim()) return trecho;
    const vizinho = trechos[indice + 1] ?? trechos[indice - 1];
    return vizinho?.novo ? trecho : { ...trecho, novo: false };
  });
}
