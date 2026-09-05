import { requestApi } from "@/lib/api";

export interface AulaLida {
  data: string;
  ordem: number | null;
  codigoCR: string;
  desenvolvimento: string;
  ferramentas: string;
  isRecuperacao: "Sim" | "Não";
  isInteracao: "Sim" | "Não";
}

/** Uma nota como o agente a leu, antes de virar matrícula no servidor. */
export interface NotaLida {
  estudante: string;
  valor: number;
}

export interface EnvioPlan {
  parte: string;
  etapa: string;
  turma: string;
  mes: string;
  observacao: string;
  aulas: AulaLida[];
  /** A avaliação a que as notas se referem; vazia fora da parte boletim. */
  avaliacao: string;
  /** A disciplina do boletim; vazia fora da parte boletim. */
  disciplina: string;
  notas: NotaLida[];
}

/**
 * Um item da preview: uma aula de conteúdo, ou a nota de um estudante — na
 * mesma ordem de `plano.aulas`/`plano.notas`, para casar um item com o dado
 * que ele descreve pelo índice.
 */
export type ItemDoEnvio =
  | { status: "pronta"; rotulo: string }
  | { status: "falha"; rotulo: string; motivo: string };

/** Uma nota já resolvida na matrícula do estudante, pronta para o portal. */
export interface NotaResolvida {
  matricula: string;
  avaliacao: string;
  valor: number;
}

export interface PreviewDoEnvio {
  plano: EnvioPlan;
  /** A caderneta que o plano descreve, quando ela já existe. */
  cadernetaId?: string;
  itens: ItemDoEnvio[];
  /**
   * Só presente na parte boletim: as notas resolvidas, na mesma ordem de
   * `plano.notas` — `undefined` no índice cujo item é `falha`.
   */
  notasResolvidas?: (NotaResolvida | undefined)[];
}

/**
 * Manda o material do professor para a API, que descobre a turma, a etapa e o
 * mês e devolve uma preview do que leu — sem gravar nada no portal. Gravar é
 * um passo à parte, disparado item a item depois que o auxiliar de ensino
 * confere esta tela.
 */
export async function preverEnvio(
  sessionId: string,
  {
    texto,
    arquivos,
    cadernetaId,
  }: { texto: string; arquivos: File[]; cadernetaId?: string },
): Promise<PreviewDoEnvio> {
  const form = new FormData();
  form.append("texto", texto);
  for (const arquivo of arquivos) form.append("arquivos", arquivo);
  if (cadernetaId) form.append("cadernetaId", cadernetaId);

  const response = await requestApi(`/api/cadernetas/sessoes/${sessionId}/envios`, {
    method: "POST",
    body: form,
  });

  return (await response.json()) as PreviewDoEnvio;
}

/**
 * Abre a aula do plano numa janela visível do portal, com o conteúdo já
 * escrito nos campos, e para aí. Salvar é decisão do auxiliar de ensino.
 */
export async function preencherAulaDoEnvioNoPortal(
  sessionId: string,
  input: {
    professorId: string;
    cadernetaId?: string;
    etapa: string;
    mes: string;
    turma: string;
    aula: AulaLida;
  },
): Promise<void> {
  await requestApi(`/api/cadernetas/sessoes/${sessionId}/envios/aulas/preenchimentos-assistidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * Abre o boletim do plano numa janela visível do portal, com as notas
 * resolvidas já escritas nos campos — todas de uma vez, como o portal já
 * mostra a turma inteira numa grade só. Salvar continua sendo do auxiliar.
 */
export async function preencherBoletimDoEnvioNoPortal(
  sessionId: string,
  input: {
    professorId: string;
    cadernetaId?: string;
    etapa: string;
    turma: string;
    disciplina: string;
    notas: { matricula: string; avaliacao: string; valor: number }[];
  },
): Promise<void> {
  await requestApi(
    `/api/cadernetas/sessoes/${sessionId}/envios/boletim/preenchimentos-assistidos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
