import { z } from 'zod';

import { chatCompletion, type ContentPart } from './openrouter';
import { EnvioInvalidoError, ParteNaoSuportadaError } from './errors';
import { ehArquivoDePlanilha, ehArquivoWord, extrairTexto } from './extrair-texto';
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
  /** A disciplina do boletim; vazia quando a turma só tem uma. */
  disciplina: z.string().trim().default(''),
  /** A avaliação a que as notas se referem; vazia fora da parte boletim. */
  avaliacao: z.string().trim().default(''),
  notas: z
    .array(
      z.object({
        estudante: z.string().trim(),
        valor: z.number(),
      }),
    )
    .default([]),
});

/** Uma nota como o agente a leu: o estudante pelo nome, ainda sem matrícula. */
export interface NotaLida {
  readonly estudante: string;
  readonly valor: number;
}

export interface EnvioPlan {
  readonly parte: ParteDaCaderneta;
  readonly identificado: boolean;
  readonly etapa: string;
  readonly turma: string;
  readonly mes: string;
  readonly observacao: string;
  readonly aulas: readonly Aula[];
  /** A disciplina do boletim; vazia quando a turma só tem uma. */
  readonly disciplina: string;
  /** A avaliação a que as notas se referem; vazia fora da parte boletim. */
  readonly avaliacao: string;
  readonly notas: readonly NotaLida[];
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
  required: [
    'parte',
    'identificado',
    'etapa',
    'turma',
    'mes',
    'observacao',
    'aulas',
    'disciplina',
    'avaliacao',
    'notas',
  ],
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
    disciplina: {
      type: 'string',
      description:
        'Só para a parte "boletim": a disciplina do boletim, copiada ' +
        'exatamente da lista da etapa. String vazia quando a etapa só tem ' +
        'uma disciplina ou nas outras partes.',
    },
    avaliacao: {
      type: 'string',
      description:
        'Só para a parte "boletim": o nome da avaliação a que as notas se ' +
        'referem, copiado exatamente da lista de avaliações da etapa. ' +
        'String vazia nas outras partes.',
    },
    notas: {
      type: 'array',
      description:
        'Só para a parte "boletim": uma entrada por estudante com nota no ' +
        'material. Lista vazia nas outras partes.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['estudante', 'valor'],
        properties: {
          estudante: {
            type: 'string',
            description:
              'O nome do estudante como o material o escreve. Não invente ' +
              'nem corrija para um nome que você acha parecido.',
          },
          valor: { type: 'number', description: 'A nota, com ponto decimal.' },
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
        `  meses: ${etapa.meses.join(' | ') || '(nenhum)'}\n` +
        `  disciplinas e avaliações:\n` +
        ((etapa.disciplinas ?? []).length === 0
          ? '    (nenhuma avaliação cadastrada)'
          : (etapa.disciplinas ?? [])
              .map(
                (disciplina) =>
                  `    ${disciplina.nome}: ${
                    disciplina.avaliacoes.map((a) => a.nome).join(' | ') || '(nenhuma)'
                  }`,
              )
              .join('\n')),
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
    'O mês é sempre só o nome do mês (ex.: "MARÇO"), nunca o ano — mesmo que a',
    'data no material inclua o ano (ex.: 10/02/2026 é o mês "FEVEREIRO"; o ano',
    'não entra nessa comparação e não é motivo para não identificar a turma).',
    '',
    'O nome da turma no material costuma vir abreviado (ex.: "3º ano A"),',
    'enquanto a lista abaixo traz o nome completo do portal (ex.:',
    '"3º ANO - 3º ANO A - MATUTINO"). Case pela série e letra da turma, não',
    'pela igualdade literal do texto — copie o nome completo da lista, nunca o',
    'nome abreviado do material.',
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
    'Para a parte "boletim", devolva uma entrada em notas por estudante com',
    'nota no material, e em avaliacao o nome da avaliação a que elas se',
    'referem — copiado exatamente da lista de avaliações da etapa escolhida.',
    'Escreva o nome do estudante como o material o escreve: quem casa o nome',
    'com a matrícula é o sistema, não você. Se o material não disser a qual',
    'avaliação as notas pertencem e a etapa tiver mais de uma, devolva',
    'identificado: false e diga isso em observacao — lançar a nota na',
    'avaliação errada é tão ruim quanto lançá-la no estudante errado.',
    'Para as outras partes, devolva avaliacao vazia e a lista de notas vazia.',
    '',
    'Se algo ficou ambíguo, diga em observacao. Responda só o JSON do schema.',
  ].join('\n');
}

function toDataUrl(arquivo: ArquivoEnviado): string {
  return `data:${arquivo.mimeType};base64,${Buffer.from(arquivo.data).toString('base64')}`;
}

export async function buildContentParts({
  texto,
  arquivos = [],
}: {
  texto?: string;
  arquivos?: readonly ArquivoEnviado[];
}): Promise<ContentPart[]> {
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

    // Word e Excel viram texto; o resto (.txt, .md, o que o professor colar)
    // já é texto puro e só precisa ser decodificado.
    const conteudo = ehArquivoWord(arquivo) || ehArquivoDePlanilha(arquivo)
      ? await extrairTexto(arquivo)
      : Buffer.from(arquivo.data).toString('utf8');

    parts.push({ type: 'text', text: `Arquivo ${arquivo.filename}:\n${conteudo}` });
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

  if (plan.parte !== 'boletim') return;

  const disciplinas = etapa.disciplinas ?? [];
  if (disciplinas.length === 0) {
    throw new EnvioInvalidoError(
      `A etapa "${etapa.nome}" não tem nenhuma avaliação cadastrada no portal. ` +
        'Cadastre a avaliação em Cadastro de Avaliação antes de lançar notas.',
    );
  }

  // Sem disciplina escolhida vale a única que existe; com várias, o agente
  // precisa ter dito qual — a nota iria para o boletim errado.
  const disciplina = plan.disciplina
    ? disciplinas.find((candidata) => candidata.nome === plan.disciplina)
    : disciplinas.length === 1
      ? disciplinas[0]
      : undefined;

  if (!disciplina) {
    throw new EnvioInvalidoError(
      plan.disciplina
        ? `A disciplina "${plan.disciplina}" não existe na etapa "${etapa.nome}". ` +
          `Disciplinas disponíveis: ${disciplinas.map((d) => d.nome).join(', ')}.`
        : `A etapa "${etapa.nome}" tem mais de uma disciplina e o material não ` +
          `diz de qual é. Disciplinas: ${disciplinas.map((d) => d.nome).join(', ')}.`,
    );
  }

  const avaliacoes = disciplina.avaliacoes;
  const avaliacao = avaliacoes.find((candidata) => candidata.nome === plan.avaliacao);

  if (!avaliacao) {
    throw new EnvioInvalidoError(
      `A avaliação "${plan.avaliacao}" não existe em ${disciplina.nome} na ` +
        `etapa "${etapa.nome}". ` +
        `Avaliações disponíveis: ${avaliacoes.map((a) => a.nome).join(', ')}.`,
    );
  }

  // Uma nota fora do valor da avaliação é erro de leitura do material, e o
  // portal a recusaria de qualquer jeito.
  for (const nota of plan.notas) {
    if (nota.valor < 0) {
      throw new EnvioInvalidoError(
        `A nota de ${nota.estudante} veio negativa (${nota.valor}).`,
      );
    }

    if (avaliacao.valor !== undefined && nota.valor > avaliacao.valor) {
      throw new EnvioInvalidoError(
        `A nota de ${nota.estudante} (${nota.valor}) passa do valor da ` +
          `avaliação "${avaliacao.nome}", que vale ${avaliacao.valor}.`,
      );
    }
  }
}

export async function interpretarEnvio({
  texto,
  arquivos = [],
  catalogo,
  signal,
  complete = chatCompletion,
}: InterpretarEnvioInput): Promise<EnvioPlan> {
  const content = await buildContentParts({ texto, arquivos });

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

  if (plan.data.parte !== 'conteudo' && plan.data.parte !== 'boletim') {
    throw new ParteNaoSuportadaError(PARTE_LABEL[plan.data.parte]);
  }

  assertNoCatalogo(plan.data, catalogo);

  if (plan.data.parte === 'boletim' && plan.data.notas.length === 0) {
    throw new EnvioInvalidoError(
      'O agente não encontrou nenhuma nota no material enviado.',
    );
  }

  if (plan.data.parte === 'conteudo' && plan.data.aulas.length === 0) {
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
