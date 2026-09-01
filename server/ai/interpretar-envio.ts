import { z } from 'zod';

import { chatCompletion, type ContentPart } from './openrouter';
import { EnvioInvalidoError, ParteNaoSuportadaError } from './errors';
import type { Aula, ConteudoCatalogo } from '../scrape/types';

/** As cinco partes da caderneta, como definidas no CONTEXT.md. */
export const PARTES = [
  'conteudo',
  'frequencia',
  'ficha-desempenho',
  'ficha-descritiva',
  'boletim',
] as const;

export type ParteDaCaderneta = (typeof PARTES)[number];

const PARTE_LABEL: Record<ParteDaCaderneta, string> = {
  conteudo: 'conteúdo',
  frequencia: 'frequência',
  'ficha-desempenho': 'ficha de desempenho',
  'ficha-descritiva': 'ficha descritiva',
  boletim: 'boletim',
};

const simNao = z.enum(['Sim', 'Não']);

const planSchema = z.object({
  parte: z.enum(PARTES),
  identificado: z.boolean(),
  etapa: z.string().trim(),
  turma: z.string().trim(),
  mes: z.string().trim(),
  observacao: z.string().trim(),
  aulas: z.array(
    z.object({
      data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'data fora de dd/mm/aaaa'),
      ordem: z.number().int().positive().nullable(),
      codigoCR: z.string(),
      desenvolvimento: z.string(),
      ferramentas: z.string(),
      isRecuperacao: simNao,
      isInteracao: simNao,
    }),
  ),
});

export interface EnvioPlan {
  readonly parte: ParteDaCaderneta;
  readonly identificado: boolean;
  readonly etapa: string;
  readonly turma: string;
  readonly mes: string;
  readonly observacao: string;
  readonly aulas: readonly Aula[];
}

export interface ArquivoEnviado {
  readonly filename: string;
  readonly mimeType: string;
  readonly data: Uint8Array;
}

export interface InterpretarEnvioInput {
  readonly texto?: string;
  readonly arquivos?: readonly ArquivoEnviado[];
  readonly catalogo: ConteudoCatalogo;
  readonly signal?: AbortSignal;
  /** Injetado nos testes para não sair para a rede. */
  readonly complete?: typeof chatCompletion;
}

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['parte', 'identificado', 'etapa', 'turma', 'mes', 'observacao', 'aulas'],
  properties: {
    parte: { type: 'string', enum: [...PARTES] },
    identificado: {
      type: 'boolean',
      description:
        'true só se a etapa, a turma e o mês do material forem realmente ' +
        'uma das combinações listadas. false se o material for de outra turma.',
    },
    etapa: { type: 'string' },
    turma: { type: 'string' },
    mes: { type: 'string' },
    observacao: {
      type: 'string',
      description: 'O que ficou ambíguo no material, ou string vazia.',
    },
    aulas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'data',
          'ordem',
          'codigoCR',
          'desenvolvimento',
          'ferramentas',
          'isRecuperacao',
          'isInteracao',
        ],
        properties: {
          data: { type: 'string', description: 'dd/mm/aaaa' },
          ordem: {
            type: ['integer', 'null'],
            description:
              'Só preencha se o material disser explicitamente a ordem da ' +
              'aula no dia. Caso contrário, null: quem define a ordem é o ' +
              'portal, não o professor.',
          },
          codigoCR: { type: 'string' },
          desenvolvimento: { type: 'string' },
          ferramentas: { type: 'string' },
          isRecuperacao: { type: 'string', enum: ['Sim', 'Não'] },
          isInteracao: { type: 'string', enum: ['Sim', 'Não'] },
        },
      },
    },
  },
} as const;

function buildSystemPrompt(catalogo: ConteudoCatalogo): string {
  const opcoes = catalogo.etapas
    .map(
      (etapa) =>
        `- Etapa "${etapa.nome}"\n` +
        `  turmas: ${etapa.turmas.join(' | ') || '(nenhuma)'}\n` +
        `  meses: ${etapa.meses.join(' | ') || '(nenhum)'}`,
    )
    .join('\n');

  return [
    'Você lê o material que um professor mandou para preencher a caderneta dele',
    'no portal do professor de Limoeiro de Anadia, e devolve esse material',
    'estruturado. Quem vai usar sua resposta é o auxiliar de ensino.',
    '',
    'Descubra, a partir do próprio material:',
    '1. Qual parte da caderneta ele preenche — conteudo (o que foi ensinado em',
    '   cada aula), frequencia (presença), ficha-desempenho, ficha-descritiva',
    '   ou boletim (notas).',
    '2. A qual etapa, turma e mês ele se refere.',
    '',
    'Etapa, turma e mês DEVEM ser copiados exatamente de uma das combinações',
    'abaixo, que são as únicas que existem para este professor. A turma e o mês',
    'precisam pertencer à etapa escolhida. Nunca invente um valor.',
    '',
    'Se o material não for de nenhuma dessas turmas — por exemplo, ele fala de',
    'um "5º ano" e este professor só tem turmas de pré-escola —, devolva',
    'identificado: false, deixe etapa, turma e mês vazios e diga em observacao',
    'de que turma o material parece ser. NUNCA escolha a turma mais parecida:',
    'preencher a caderneta errada é pior do que não preencher nenhuma.',
    '',
    opcoes,
    '',
    'Para a parte "conteudo", devolva uma entrada por aula datada. Preserve o',
    'texto do professor no desenvolvimento — corrija ortografia e pontuação, e',
    'nada além disso. Deixe campos como string vazia quando o material não',
    'disser, e use "Não" para recuperação e interação quando não houver menção.',
    'Para as outras partes, devolva a lista de aulas vazia.',
    '',
    'Se algo ficou ambíguo, diga em observacao. Responda só o JSON do schema.',
  ].join('\n');
}

function toDataUrl(arquivo: ArquivoEnviado): string {
  return `data:${arquivo.mimeType};base64,${Buffer.from(arquivo.data).toString('base64')}`;
}

export function buildContentParts({
  texto,
  arquivos = [],
}: {
  texto?: string;
  arquivos?: readonly ArquivoEnviado[];
}): ContentPart[] {
  const parts: ContentPart[] = [];

  if (texto?.trim()) {
    parts.push({ type: 'text', text: texto.trim() });
  }

  for (const arquivo of arquivos) {
    if (arquivo.mimeType.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: toDataUrl(arquivo) } });
      continue;
    }

    if (arquivo.mimeType === 'application/pdf') {
      parts.push({
        type: 'file',
        file: { filename: arquivo.filename, file_data: toDataUrl(arquivo) },
      });
      continue;
    }

    // Qualquer outra coisa é tratada como texto: .txt, .md, o que o professor colar.
    parts.push({
      type: 'text',
      text: `Arquivo ${arquivo.filename}:\n${Buffer.from(arquivo.data).toString('utf8')}`,
    });
  }

  return parts;
}

/** Confere o plano contra o catálogo: é o que impede uma turma inventada. */
function assertNoCatalogo(plan: z.infer<typeof planSchema>, catalogo: ConteudoCatalogo): void {
  const etapa = catalogo.etapas.find((candidate) => candidate.nome === plan.etapa);

  if (!etapa) {
    throw new EnvioInvalidoError(
      `A etapa "${plan.etapa}" não existe para este professor. ` +
        `Etapas disponíveis: ${catalogo.etapas.map((e) => e.nome).join(', ')}.`,
    );
  }

  if (!etapa.turmas.includes(plan.turma)) {
    throw new EnvioInvalidoError(
      `A turma "${plan.turma}" não existe na etapa "${etapa.nome}". ` +
        `Turmas disponíveis: ${etapa.turmas.join(', ')}.`,
    );
  }

  if (!etapa.meses.includes(plan.mes)) {
    throw new EnvioInvalidoError(
      `O mês "${plan.mes}" não existe na etapa "${etapa.nome}". ` +
        `Meses disponíveis: ${etapa.meses.join(', ')}.`,
    );
  }
}

export async function interpretarEnvio({
  texto,
  arquivos = [],
  catalogo,
  signal,
  complete = chatCompletion,
}: InterpretarEnvioInput): Promise<EnvioPlan> {
  const content = buildContentParts({ texto, arquivos });

  if (content.length === 0) {
    throw new EnvioInvalidoError('Envie um texto ou pelo menos um arquivo.');
  }

  const raw = await complete({
    system: buildSystemPrompt(catalogo),
    content,
    format: { name: 'envio_de_caderneta', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> },
    parsePdf: arquivos.some((arquivo) => arquivo.mimeType === 'application/pdf'),
    signal,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EnvioInvalidoError('O agente não devolveu um JSON válido.');
  }

  const plan = planSchema.safeParse(parsed);

  if (!plan.success) {
    throw new EnvioInvalidoError(
      `O agente devolveu um plano fora do formato esperado: ${plan.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}.`,
    );
  }

  if (!plan.data.identificado) {
    throw new EnvioInvalidoError(
      'O material não corresponde a nenhuma turma deste professor. ' +
        (plan.data.observacao || 'Confira se o professor selecionado está certo.'),
    );
  }

  if (plan.data.parte !== 'conteudo') {
    throw new ParteNaoSuportadaError(PARTE_LABEL[plan.data.parte]);
  }

  assertNoCatalogo(plan.data, catalogo);

  if (plan.data.aulas.length === 0) {
    throw new EnvioInvalidoError(
      'O agente não encontrou nenhuma aula datada no material enviado.',
    );
  }

  return {
    ...plan.data,
    aulas: plan.data.aulas.map(({ ordem, ...aula }) => ({
      ...aula,
      ...(ordem === null ? {} : { ordem }),
    })),
  };
}
