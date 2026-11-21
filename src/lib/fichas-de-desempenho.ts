import { requestApi } from "@/lib/api";
import { turmaQuery } from "@/lib/cadernetas";
import type {
  Conceito,
  EstruturaDaFicha,
  IndiceDaEtapa,
  PreviaDaFicha,
  PreviaEditada,
} from "@shared/ficha-de-desempenho";

export type {
  AreaDeConhecimento,
  Conceito,
  EstruturaDaFicha,
  EstudanteDaPrevia,
  Excecao,
  FichaPlanejada,
  IndiceDaEtapa,
  PreviaDaFicha,
} from "@shared/ficha-de-desempenho";
export {
  alterarConceito,
  aplicarNaFicha,
  chaveDaHabilidade,
  contarExcecoes,
  ETAPAS_DA_FICHA,
  TODAS_AS_ETAPAS,
} from "@shared/ficha-de-desempenho";

export interface EstadoDoPreenchimento {
  status: "abrindo" | "preenchendo" | "aguardando-auxiliar" | "concluido" | "interrompido" | "falhou";
  etapa: string;
  total: number;
  atual: { matricula: string; nome: string } | null;
  preenchidos: {
    matricula: string;
    nome: string;
    escritas: number;
    mantidos: { area: number; habilidade: number; etapa: number; planejado: string; escrito: string; etapaDeReferencia: number }[];
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

/** Reads the observações with the agent and saves the prévia of the turma. */
export async function gerarPrevia(
  cadernetaId: string,
  { areas, etapas, texto, arquivos }: { areas: number[]; etapas: IndiceDaEtapa[]; texto: string; arquivos: File[] },
  signal?: AbortSignal,
  turma?: string,
): Promise<PreviaDaFicha> {
  const form = new FormData();
  form.append("areas", JSON.stringify(areas));
  form.append("etapas", JSON.stringify(etapas));
  form.append("texto", texto);
  for (const arquivo of arquivos) form.append("arquivos", arquivo);
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/previas${turmaQuery(turma)}`, { method: "POST", body: form, signal });
  return ((await response.json()) as { previa: PreviaDaFicha }).previa;
}

export async function loadPrevia(cadernetaId: string, turma?: string): Promise<PreviaDaFicha | null> {
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/previas/atual${turmaQuery(turma)}`);
  return ((await response.json()) as { previa: PreviaDaFicha | null }).previa;
}

export async function descartarPrevia(cadernetaId: string, turma?: string): Promise<void> {
  await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/previas/atual${turmaQuery(turma)}`, { method: "DELETE" });
}

/**
 * Starts filling the portal from the prévia as it is on screen — the edits
 * are not saved, they travel with this request — one estudante at a time.
 */
export async function iniciarPreenchimentoDaFicha(cadernetaId: string, previa: PreviaDaFicha, turma?: string): Promise<EstadoDoPreenchimento> {
  const body: PreviaEditada = {
    versao: previa.atualizadaEm,
    estudantes: previa.estudantes.map(({ matricula, conceitos }) => ({ matricula, conceitos })),
    gerais: previa.gerais,
    naoResolvidos: previa.naoResolvidos,
  };
  const response = await requestApi(`${base(cadernetaId)}/ficha-de-desempenho/preenchimentos-assistidos${turmaQuery(turma)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
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

/** The conceito a click on a cell of the prévia moves to: R → RD → NR → R. */
export function proximoConceito(conceito: Conceito): Conceito {
  return conceito === "R" ? "RD" : conceito === "RD" ? "NR" : "R";
}

/** How many unresolved names still carry exceções; only those block opening the portal. */
export function pendenciasAntesDeAbrir(naoResolvidos: readonly { excecoes: readonly unknown[] }[]): number {
  return naoResolvidos.filter((item) => item.excecoes.length > 0).length;
}

/** Are the checked etapas and áreas the ones the prévia was generated with? */
export function previaConfere(
  previa: { etapas: readonly number[]; areas: readonly number[] },
  etapas: readonly number[],
  areas: readonly number[],
): boolean {
  const iguais = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && [...a].sort((x, y) => x - y).every((valor, i) => valor === [...b].sort((x, y) => x - y)[i]);
  return iguais(previa.etapas, etapas) && iguais(previa.areas, areas);
}
