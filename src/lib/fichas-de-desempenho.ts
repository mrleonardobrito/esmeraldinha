import { requestApi } from "@/lib/api";
import { turmaQuery } from "@/lib/cadernetas";
import type {
  EstruturaDaFicha,
  Excecao,
  PreenchimentoDaFicha,
} from "@shared/ficha-de-desempenho";

export type { AreaDeConhecimento, EstruturaDaFicha, Excecao } from "@shared/ficha-de-desempenho";

export type ExcecaoComTrecho = Excecao & { trecho: string };

/** The agent's reading of the observações, checked against the turma. */
export interface ObservacoesInterpretadas {
  resposta: string;
  estudantes: { matricula: string; nome: string; escrito: string; excecoes: ExcecaoComTrecho[] }[];
  naoResolvidos: { estudante: string; motivo: string; candidatos: string[]; excecoes: ExcecaoComTrecho[] }[];
  gerais: { trecho: string; estudante: { matricula: string; nome: string } | null; excecoes: Excecao[] }[];
  descartadas: { motivo: string; trecho: string }[];
  turma: { matricula: string; nome: string; situacao: string | null }[];
}

export interface EstadoDoPreenchimento {
  status: "abrindo" | "preenchendo" | "aguardando-auxiliar" | "concluido" | "interrompido" | "falhou";
  etapa: string;
  total: number;
  atual: { matricula: string; nome: string } | null;
  preenchidos: {
    matricula: string;
    nome: string;
    escritas: number;
    mantidos: { area: number; habilidade: number; planejado: string; escrito: string; etapaDoPiso: number }[];
    jaPreenchidos: number;
  }[];
  pulados: { matricula: string; nome: string; motivo: string }[];
  erro: string | null;
}

const base = (cadernetaId: string) => `/api/cadernetas/${encodeURIComponent(cadernetaId)}`;

export async function loadEstruturaDaFicha(cadernetaId: string, turma?: string): Promise<EstruturaDaFicha | null> {
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/estrutura${turmaQuery(turma)}`);
  return ((await response.json()) as { estrutura: EstruturaDaFicha | null }).estrutura;
}

/** Reads the ficha's áreas and habilidades on the portal (opens one estudante, ~10 s). */
export async function lerEstruturaDaFicha(cadernetaId: string, turma?: string): Promise<EstruturaDaFicha> {
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/estrutura/leituras${turmaQuery(turma)}`, { method: "POST" });
  return ((await response.json()) as { estrutura: EstruturaDaFicha }).estrutura;
}

export async function interpretarObservacoes(
  cadernetaId: string,
  etapa: string,
  { areas, texto, arquivos }: { areas: number[]; texto: string; arquivos: File[] },
  signal?: AbortSignal,
  turma?: string,
): Promise<ObservacoesInterpretadas> {
  const form = new FormData();
  form.append("areas", JSON.stringify(areas));
  form.append("texto", texto);
  for (const arquivo of arquivos) form.append("arquivos", arquivo);
  const response = await requestApi(
    `${base(cadernetaId)}/etapas/${encodeURIComponent(etapa)}/ficha-de-desempenho/observacoes${turmaQuery(turma)}`,
    { method: "POST", body: form, signal },
  );
  return (await response.json()) as ObservacoesInterpretadas;
}

export async function iniciarPreenchimentoDaFicha(
  cadernetaId: string,
  etapa: string,
  body: PreenchimentoDaFicha,
  turma?: string,
): Promise<EstadoDoPreenchimento> {
  const response = await requestApi(
    `${base(cadernetaId)}/etapas/${encodeURIComponent(etapa)}/ficha-de-desempenho/preenchimentos-assistidos${turmaQuery(turma)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  return ((await response.json()) as { estado: EstadoDoPreenchimento }).estado;
}

export async function loadEstadoDoPreenchimento(cadernetaId: string, turma?: string): Promise<EstadoDoPreenchimento | null> {
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/preenchimentos-assistidos/atual${turmaQuery(turma)}`);
  return ((await response.json()) as { estado: EstadoDoPreenchimento | null }).estado;
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em"]);

function tituloLegivel(texto: string): string {
  return texto
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((palavra, indice) => {
      if (/^\(.*\)$/.test(palavra)) return palavra.toLocaleUpperCase("pt-BR");
      if (indice > 0 && MINUSCULAS.has(palavra.replace(/,$/, ""))) return palavra;
      return palavra.replace(/(^|-)(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

/**
 * How an área is called on screen. The portal repeats the série and the
 * "descritores de habilidades" prefix, and in educação infantil appends the
 * age range; only the área itself identifies it. Display only.
 */
export function nomeDaArea(titulo: string): string {
  const nome = titulo
    .replace(/^.*?DESCRITORES DE HABILIDADES\s+(DO COMPONENTE CURRICULAR:?\s*)?/i, "")
    .replace(/\s*-?\s*(CRECHE|PR[ÉE]-?ESCOLA)\b.*$/i, "")
    .trim();
  return tituloLegivel(nome);
}

/** The reviewed exceções as the start route takes them; a repeated habilidade keeps its last conceito. */
export function excecoesParaEnviar(
  revisao: readonly { matricula: string; excecoes: readonly Excecao[] }[],
): PreenchimentoDaFicha["excecoes"] {
  const porChave = new Map<string, PreenchimentoDaFicha["excecoes"][number]>();
  for (const { matricula, excecoes } of revisao) {
    for (const { area, habilidade, conceito } of excecoes) {
      porChave.set(`${matricula}|${area}|${habilidade}`, { matricula, area, habilidade, conceito });
    }
  }
  return [...porChave.values()].sort((a, b) =>
    a.matricula.localeCompare(b.matricula) || a.area - b.area || a.habilidade - b.habilidade);
}

/**
 * Adds exceções to one estudante's review. A habilidade the estudante
 * already has keeps its conceito: what was said about them specifically
 * outweighs what was said about the whole turma.
 */
export function aplicarExcecoes(
  revisao: Readonly<Record<string, ExcecaoComTrecho[]>>,
  matricula: string,
  novas: readonly (Excecao & { trecho?: string })[],
  trecho: string,
): Record<string, ExcecaoComTrecho[]> {
  const atuais = [...(revisao[matricula] ?? [])];
  for (const { area, habilidade, conceito, trecho: proprio } of novas) {
    if (atuais.some((e) => e.area === area && e.habilidade === habilidade)) continue;
    atuais.push({ area, habilidade, conceito, trecho: proprio ?? trecho });
  }
  return { ...revisao, [matricula]: atuais };
}

/** How many unresolved names still carry exceções; only those block opening the portal. */
export function pendenciasAntesDeAbrir(naoResolvidos: readonly { excecoes: readonly unknown[] }[]): number {
  return naoResolvidos.filter((item) => item.excecoes.length > 0).length;
}
