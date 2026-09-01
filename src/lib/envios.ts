import { requestApi } from "@/lib/api";

export interface AulaGravada {
  data: string;
  ordem: number;
  codigoCR: string;
  desenvolvimento: string;
  ferramentas: string;
  isRecuperacao: "Sim" | "Não";
  isInteracao: "Sim" | "Não";
}

export interface EnvioPlan {
  parte: string;
  etapa: string;
  turma: string;
  mes: string;
  observacao: string;
  aulas: AulaGravada[];
}

export interface EnvioResultado {
  plano: EnvioPlan;
  resultado: {
    succeeded: string[];
    failed: { aula: string; reason: string }[];
  };
}

/**
 * Manda o material do professor para a API, que descobre a turma, a etapa e o
 * mês e grava no portal.
 */
export async function enviarMaterial(
  sessionId: string,
  { texto, arquivos }: { texto: string; arquivos: File[] },
): Promise<EnvioResultado> {
  const form = new FormData();
  form.append("texto", texto);
  for (const arquivo of arquivos) form.append("arquivos", arquivo);

  const response = await requestApi(`/api/cadernetas/sessoes/${sessionId}/envios`, {
    method: "POST",
    body: form,
  });

  return (await response.json()) as EnvioResultado;
}
