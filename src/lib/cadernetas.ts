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
  /** Derivado do nome da turma pelo servidor; nulo quando o portal não o escreveu. */
  turno: string | null;
  etapas: EtapaDaCaderneta[];
  totalDeEstudantes: number;
  createdAt: string;
  /** Nulo enquanto a primeira raspagem não terminou. */
  syncedAt: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
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
 * As notas da linha do estudante que não são de nenhuma avaliação. O portal
 * calcula `calculada` e `parcial`; só `personalizada` e `final` se preenche.
 */
export interface NotaDoEstudanteDaCaderneta {
  matricula: string;
  personalizada: number | null;
  final: number | null;
  calculada: number | null;
  parcial: number | null;
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

/** As turmas que o professor da sessão tem no portal. */
export async function loadTurmas(sessionId: string): Promise<string[]> {
  const response = await requestApi(
    `/api/cadernetas/turmas?sessionId=${encodeURIComponent(sessionId)}`,
  );
  const body = (await response.json()) as { turmas: string[] };

  return body.turmas;
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
 * Cadastra a caderneta de uma ou mais turmas. Responde na hora: cada turma
 * ganha seu job de leitura do portal, que roda em segundo plano e aparece no
 * `syncStatus` da caderneta.
 *
 * Uma turma recusada — já cadastrada, por exemplo — não impede as outras: ela
 * volta em `recusadas` com o motivo. Só quando nenhuma entra é que a chamada
 * falha.
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
): Promise<AulaDaCaderneta[]> {
  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/aulas`,
  );
  const body = (await response.json()) as { aulas: AulaDaCaderneta[] };

  return body.aulas;
}

/** Os estudantes matriculados na turma da caderneta. */
export async function loadEstudantes(
  cadernetaId: string,
): Promise<EstudanteDaCaderneta[]> {
  const response = await requestApi(`/api/cadernetas/${cadernetaId}/estudantes`);
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

/** O conteúdo de uma aula como a tela o edita. */
export interface ConteudoEditado {
  codigoCR: string;
  desenvolvimento: string;
  ferramentas: string;
  isRecuperacao: "Sim" | "Não" | null;
  isInteracao: "Sim" | "Não" | null;
}

/**
 * Abre a aula numa janela visível do portal, com o conteúdo editado já escrito
 * nos campos. A automação para antes de salvar: conferir e gravar é do
 * auxiliar de ensino, na janela que fica aberta.
 */
export async function preencherAulaNoPortal(
  cadernetaId: string,
  aula: Pick<AulaDaCaderneta, "etapa" | "mes" | "data" | "ordem">,
  conteudo: ConteudoEditado,
): Promise<void> {
  await requestApi(`/api/cadernetas/${cadernetaId}/aulas/preenchimentos-assistidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      etapa: aula.etapa,
      mes: aula.mes,
      data: aula.data,
      ordem: aula.ordem,
      // Um campo em branco é deixado de fora: o portal não deve receber uma
      // string vazia onde a tela apenas não tinha nada a dizer.
      ...(conteudo.codigoCR.trim() ? { codigoCR: conteudo.codigoCR } : {}),
      ...(conteudo.desenvolvimento.trim()
        ? { desenvolvimento: conteudo.desenvolvimento }
        : {}),
      ...(conteudo.ferramentas.trim() ? { ferramentas: conteudo.ferramentas } : {}),
      ...(conteudo.isRecuperacao ? { isRecuperacao: conteudo.isRecuperacao } : {}),
      ...(conteudo.isInteracao ? { isInteracao: conteudo.isInteracao } : {}),
    }),
  });
}

export async function excluirCaderneta(cadernetaId: string): Promise<void> {
  await requestApi(`/api/cadernetas/${cadernetaId}`, { method: "DELETE" });
}

/** O boletim de uma etapa: os estudantes, as avaliações e as notas. */
export async function loadBoletimDaEtapa(
  cadernetaId: string,
  etapa: string,
  disciplina?: string,
): Promise<BoletimDaEtapa> {
  const query = disciplina ? `?disciplina=${encodeURIComponent(disciplina)}` : "";
  const response = await requestApi(
    `/api/cadernetas/${cadernetaId}/etapas/${encodeURIComponent(etapa)}/boletim${query}`,
  );

  return (await response.json()) as BoletimDaEtapa;
}

/**
 * Abre o boletim numa janela visível do portal, com as notas editadas já
 * escritas nos campos. Como no preenchimento de uma aula, a automação para
 * antes de salvar: conferir e gravar é do auxiliar de ensino.
 */
export async function preencherNotasNoPortal(
  cadernetaId: string,
  etapa: string,
  notas: readonly NotaDaCaderneta[],
  opcoes: {
    disciplina?: string | null;
    notasDoEstudante?: readonly {
      matricula: string;
      personalizada?: number | null;
      final?: number | null;
    }[];
  } = {},
): Promise<void> {
  await requestApi(`/api/cadernetas/${cadernetaId}/boletim/preenchimentos-assistidos`, {
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
