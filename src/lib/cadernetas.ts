import { requestApi } from "@/lib/api";

/** As cinco partes da caderneta, como definidas no CONTEXT.md. */
export const PARTES = [
  "conteudo",
  "frequencia",
  "boletim",
  "ficha-desempenho",
] as const;

export type ParteDaCaderneta = (typeof PARTES)[number];

export type StatusDaParte =
  | "pendente"
  | "parcial"
  | "processando"
  | "concluido";

export interface EtapaDaCaderneta {
  nome: string;
  meses: string[];
  totalDeAulas: number;
  aulasPreenchidas: number;
  conteudo: StatusDaParte;
  /** Quantas notas a etapa comporta: estudantes × avaliações. */
  totalDeNotas: number;
  notasLancadas: number;
  boletim: StatusDaParte;
}

export type SyncStatus = "pendente" | "sincronizando" | "sincronizada" | "falhou";

export interface EstudanteDaCaderneta {
  matricula: string;
  nome: string;
  situacao: string | null;
}

export interface Caderneta {
  id: string;
  professorId: string;
  turma: string;
  turmas: string[];
  /** Derivado do nome da turma pelo servidor; nulo quando o portal não o escreveu. */
  turno: string | null;
  etapas: EtapaDaCaderneta[];
  totalDeEstudantes: number;
  createdAt: string;
  /** Nulo enquanto a primeira raspagem não terminou. */
  syncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  valorRecebido?: number | null;
  valorAReceber?: number | null;
}

export interface AulaDaCaderneta {
  etapa: string;
  mes: string;
  data: string;
  ordem: number | null;
  conteudoPreenchido: boolean;
  /** O conteúdo lançado no portal; `null` quando o campo está vazio lá. */
  codigoCR: string | null;
  desenvolvimento: string | null;
  ferramentas: string | null;
}

/** Uma avaliação da etapa: uma coluna do boletim. */
export interface AvaliacaoDaCaderneta {
  nome: string;
  tipo: string | null;
  data: string | null;
  /** O valor máximo da avaliação; `null` quando o portal não o informa. */
  valor: number | null;
  media: number | null;
}

/**
 * As notas da linha do estudante que não são de nenhuma avaliação, com os
 * nomes que o portal lhes dá. O portal preenche `origem` e `calculada`; só
 * `parcial` e `personalizada` se digita.
 */
export interface NotaDoEstudanteDaCaderneta {
  matricula: string;
  origem: number | null;
  calculada: number | null;
  parcial: number | null;
  personalizada: number | null;
}

/** Uma nota já lançada no portal. */
export interface NotaDaCaderneta {
  matricula: string;
  avaliacao: string;
  valor: number;
}

/** O boletim de uma etapa numa disciplina: quem, em quê, com quanto. */
export interface BoletimDaEtapa {
  etapa: string;
  /** `null` quando a caderneta não tem disciplina — logo, sem avaliação. */
  disciplina: string | null;
  disciplinas: string[];
  /** As de `disciplinas` que já têm alguma nota lançada nesta etapa. */
  disciplinasLancadas: string[];
  estudantes: EstudanteDaCaderneta[];
  avaliacoes: AvaliacaoDaCaderneta[];
  notas: NotaDaCaderneta[];
  notasDoEstudante: NotaDoEstudanteDaCaderneta[];
}

export async function loadCadernetas(professorId: string): Promise<Caderneta[]> {
  const response = await requestApi(
    `/api/cadernetas?professorId=${encodeURIComponent(professorId)}`,
  );

  return (await response.json()) as Caderneta[];
}

export function turmaQuery(turma?: string): string {
  return turma ? `?turma=${encodeURIComponent(turma)}` : "";
}

export function turmasDaCaderneta(caderneta: Caderneta): string[] {
  return caderneta.turmas?.length ? caderneta.turmas : [caderneta.turma];
}

export async function loadCaderneta(cadernetaId: string, turma: string): Promise<Caderneta> {
  const response = await requestApi(`/api/cadernetas/${encodeURIComponent(cadernetaId)}${turmaQuery(turma)}`);
  return await response.json() as Caderneta;
}

export interface GrupoDiarioDaTurma {
  turma: string;
  grupoDiario: string | null;
}

export interface TurmasDoPortal {
  turmas: string[];
  gruposDiariosPorTurma: GrupoDiarioDaTurma[];
}

export async function loadTurmasDoPortal(sessionId: string): Promise<TurmasDoPortal> {
  const response = await requestApi(`/api/cadernetas/turmas?sessionId=${encodeURIComponent(sessionId)}`);
  const body = await response.json() as Partial<TurmasDoPortal>;
  return { turmas: body.turmas ?? [], gruposDiariosPorTurma: body.gruposDiariosPorTurma ?? [] };
}

/** As turmas que o professor da sessão tem no portal. */
export async function loadTurmas(sessionId: string): Promise<string[]> {
  return (await loadTurmasDoPortal(sessionId)).turmas;
}

/** Uma turma que o cadastro não aceitou, e o porquê. */
export interface TurmaRecusada {
  turma: string;
  motivo: string;
}

export interface CadastroDeCadernetas {
  cadernetas: Caderneta[];
  recusadas: TurmaRecusada[];
}

/**
 * Creates cadernetas for selected turmas. The server combines turmas de redução
 * automatically and returns existing cadernetas when their membership expands.
 * Portal reads run in the background and appear in each caderneta's syncStatus.
 */
export async function cadastrarCadernetas(input: {
  sessionId: string;
  professorId: string;
  turmas: string[];
}): Promise<CadastroDeCadernetas> {
  const response = await requestApi("/api/cadernetas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return (await response.json()) as CadastroDeCadernetas;
}

export async function loadAulasDaEtapa(
  cadernetaId: string,
  etapa: string,
  turma?: string,
): Promise<AulaDaCaderneta[]> {
  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/aulas${turmaQuery(turma)}`,
  );
  const body = (await response.json()) as { aulas: AulaDaCaderneta[] };

  return body.aulas;
}

/** Os estudantes matriculados na turma da caderneta. */
export async function loadEstudantes(
  cadernetaId: string,
  turma?: string,
): Promise<EstudanteDaCaderneta[]> {
  const response = await requestApi(`/api/cadernetas/${cadernetaId}/estudantes${turmaQuery(turma)}`);
  const body = (await response.json()) as { estudantes: EstudanteDaCaderneta[] };

  return body.estudantes;
}

/** Relê a turma no portal, para o caso de alguém ter preenchido por fora. */
export async function sincronizarCaderneta(
  cadernetaId: string,
  sessionId: string,
): Promise<Caderneta> {
  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/sincronizacoes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    },
  );

  return (await response.json()) as Caderneta;
}

export async function excluirCaderneta(cadernetaId: string): Promise<void> {
  await requestApi(`/api/cadernetas/${cadernetaId}`, { method: "DELETE" });
}

/** O boletim de uma etapa: os estudantes, as avaliações e as notas. */
export async function loadBoletimDaEtapa(
  cadernetaId: string,
  etapa: string,
  disciplina?: string,
  turma?: string,
): Promise<BoletimDaEtapa> {
  const query = new URLSearchParams();
  if (disciplina) query.set("disciplina", disciplina);
  if (turma) query.set("turma", turma);
  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/boletim${query.size ? `?${query}` : ""}`,
  );

  return (await response.json()) as BoletimDaEtapa;
}

/**
 * Abre o boletim numa janela visível do portal, com as notas editadas já
 * escritas nos campos. A automação para antes de salvar: conferir e gravar é
 * do auxiliar de ensino, na janela que fica aberta.
 */
export async function preencherNotasNoPortal(
  cadernetaId: string,
  etapa: string,
  notas: readonly NotaDaCaderneta[],
  opcoes: {
    turma?: string;
    disciplina?: string | null;
    notasDoEstudante?: readonly {
      matricula: string;
      parcial?: number | null;
      personalizada?: number | null;
    }[];
  } = {},
): Promise<void> {
  await requestApi(`/api/cadernetas/${cadernetaId}/boletim/preenchimentos-assistidos${turmaQuery(opcoes.turma)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      etapa,
      notas,
      ...(opcoes.disciplina ? { disciplina: opcoes.disciplina } : {}),
      ...(opcoes.notasDoEstudante?.length
        ? { notasDoEstudante: opcoes.notasDoEstudante }
        : {}),
    }),
  });
}
