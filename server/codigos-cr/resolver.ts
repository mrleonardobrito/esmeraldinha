import type { CodigoCR } from './store';

/**
 * Um código da BNCC como ele aparece no material: EF, o ano (ou a faixa de
 * anos, como o 15 de EF15AR01), a sigla do componente e o número da habilidade.
 */
const CODIGO_BNCC = /EF\d{2}[A-Z]{2}\d{2}/gi;

/** Ignora caixa, acento e pontuação — o professor reescreve tudo isso. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O professor parafraseia a habilidade em vez de copiá-la ("Identifica e
 * compara características de lugar onde vive" para uma habilidade que a BNCC
 * escreve como "Identificar e comparar aspectos culturais dos grupos sociais").
 * Repetir isso embaixo do texto oficial só polui o campo, então o trecho do
 * professor só entra quando traz palavra que o oficial não tem.
 */
function acrescentaAlgo(trecho: string, oficial: string): boolean {
  const doOficial = new Set(normalizar(oficial).split(' '));
  const palavras = normalizar(trecho)
    .split(' ')
    .filter((palavra) => palavra.length > 3);

  if (palavras.length === 0) return false;

  const novas = palavras.filter((palavra) => !doOficial.has(palavra));
  return novas.length > palavras.length / 2;
}

/**
 * Remonta o campo Código CR com o texto oficial da habilidade: o agente copia
 * o que o professor escreveu, que vem parafraseado e com os códigos soltos no
 * meio da prosa, mas o portal guarda código e texto numa caixa só. Cada
 * habilidade vira uma linha `(CÓDIGO) texto oficial`.
 *
 * O texto oficial é a base e nunca é reescrito. O que o professor disse além
 * dele é preservado no fim, e um código fora do catálogo deixa o campo como
 * veio — inventar um texto seria pior do que manter o do professor.
 */
export function resolverCodigoCR(
  codigoCR: string,
  buscar: (codigo: string) => CodigoCR | null,
): string {
  const original = codigoCR.trim();
  if (!original) return '';

  const encontrados = original.match(CODIGO_BNCC) ?? [];
  const oficiais: CodigoCR[] = [];
  const vistos = new Set<string>();

  for (const encontrado of encontrados) {
    const codigo = encontrado.toUpperCase();
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);

    const habilidade = buscar(codigo);
    if (habilidade) oficiais.push(habilidade);
  }

  if (oficiais.length === 0) return original;

  const linhas = oficiais.map(({ codigo, texto }) => `(${codigo}) ${texto}`);

  // O que sobra depois de tirar os códigos é o que o professor escreveu por
  // conta própria: às vezes a unidade temática ("Contextos e práticas."), às
  // vezes só a paráfrase da própria habilidade.
  const resto = original.replace(CODIGO_BNCC, ' ').replace(/\s+/g, ' ').trim();
  const juntos = oficiais.map((habilidade) => habilidade.texto).join(' ');

  if (resto && acrescentaAlgo(resto, juntos)) linhas.push(resto);

  return linhas.join('\n');
}
