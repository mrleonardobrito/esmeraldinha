import { requestApi } from "@/lib/api";
import type { AulaDaCaderneta } from "@/lib/cadernetas";

/** Quem falou no chat de conteúdos. */
export type PapelNaConversa = "auxiliar" | "assistente";

export interface MensagemDaConversa {
  papel: PapelNaConversa;
  texto: string;
}

/** O conteúdo de uma aula como o agente o escreveu, antes de ir ao portal. */
export interface RascunhoDeConteudo {
  data: string;
  ordem: number | null;
  codigoCR: string;
  desenvolvimento: string;
  ferramentas: string;
}

/** O endereço de uma aula escolhida como base para o agente. */
export interface ReferenciaDeAula {
  etapa: string;
  data: string;
  ordem: number | null;
}

export interface ConteudosGerados {
  resposta: string;
  aulas: RascunhoDeConteudo[];
}

/** A chave de uma aula dentro da etapa: a data, e a ordem quando há mais de uma no dia. */
export function chaveDaAula(aula: { data: string; ordem: number | null }): string {
  return `${aula.data}#${aula.ordem ?? ""}`;
}

export function mesmaAula(
  a: { data: string; ordem: number | null },
  b: { data: string; ordem: number | null },
): boolean {
  return a.data === b.data && a.ordem === b.ordem;
}

/** As aulas de outros meses ou etapas que já têm conteúdo, para servir de referência. */
export function aulasComConteudo(aulas: readonly AulaDaCaderneta[]): AulaDaCaderneta[] {
  return aulas.filter((aula) => aula.conteudoPreenchido && aula.desenvolvimento !== null);
}

/**
 * Pede ao agente um rascunho para cada aula pendente do escopo — um mês, ou a
 * etapa inteira quando `mes` é nulo. Toda a conversa vai junto: o servidor
 * não guarda nada entre uma rodada e outra, e é isso que deixa o auxiliar de
 * ensino fechar a janela sem deixar rastro.
 */
export async function gerarRascunhos(
  cadernetaId: string,
  etapa: string,
  {
    mes,
    mensagens,
    rascunhos,
    referencias,
    arquivos,
  }: {
    mes: string | null;
    mensagens: MensagemDaConversa[];
    rascunhos: RascunhoDeConteudo[];
    referencias: ReferenciaDeAula[];
    arquivos: File[];
  },
  signal?: AbortSignal,
): Promise<ConteudosGerados> {
  const form = new FormData();
  if (mes) form.append("mes", mes);
  form.append("mensagens", JSON.stringify(mensagens));
  form.append("rascunhos", JSON.stringify(rascunhos));
  form.append("referencias", JSON.stringify(referencias));
  for (const arquivo of arquivos) form.append("arquivos", arquivo);

  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/conteudos/rascunhos`,
    { method: "POST", body: form, signal },
  );

  return (await response.json()) as ConteudosGerados;
}

/**
 * O Código CR como o portal o guarda — `1. (EF03LP18) Ler e compreender
 * fábulas.`, uma habilidade por linha, numerada ou não — separado em código e
 * texto para a tela mostrar o código em destaque. Uma linha sem código fica
 * inteira no texto.
 */
export function habilidadesDoCodigoCR(codigoCR: string): { codigo: string | null; texto: string }[] {
  return codigoCR
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const match = /^(?:\d+\.\s*)?\(\s*([A-Z0-9]+)\s*\)\s*(.*)$/.exec(linha);
      return match ? { codigo: match[1], texto: match[2] } : { codigo: null, texto: linha };
    });
}
