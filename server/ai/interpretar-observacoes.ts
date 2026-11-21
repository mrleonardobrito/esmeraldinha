import { z } from 'zod';

import type { AreaDeConhecimento, Excecao } from '../../shared/ficha-de-desempenho';
import {
  EstudanteAmbiguoError,
  resolverMatriculaDaNota,
} from '../notas/estudantes';
import { EnvioInvalidoError } from './errors';
import { buildContentParts, type ArquivoEnviado } from './interpretar-envio';
import { chatCompletion } from './openrouter';

export type ExcecaoComTrecho = Excecao & { trecho: string };

export interface ObservacoesInterpretadas {
  /** A short reply from the agent to the auxiliar de ensino. */
  resposta: string;
  estudantes: { matricula: string; nome: string; excecoes: ExcecaoComTrecho[] }[];
  /** Names that match no estudante, or more than one: never applied on their own. */
  naoResolvidos: { estudante: string; motivo: string; candidatos: string[]; excecoes: ExcecaoComTrecho[] }[];
  /** Observações about the whole turma or a whole área: suggestions for the auxiliar. */
  gerais: { trecho: string; excecoes: Excecao[] }[];
  /** Exceções that pointed outside the chosen áreas or to no habilidade. */
  descartadas: { motivo: string; trecho: string }[];
}

export interface InterpretarObservacoesInput {
  turma: string;
  etapa: string;
  /** Only the áreas the auxiliar chose. */
  areas: readonly AreaDeConhecimento[];
  estudantes: readonly { matricula: string; nome: string }[];
  texto?: string;
  arquivos?: readonly ArquivoEnviado[];
  signal?: AbortSignal;
  /** Injected by tests to stay off the network. */
  complete?: typeof chatCompletion;
}

const excecaoSchema = z.object({
  area: z.number().int(),
  habilidade: z.number().int(),
  conceito: z.enum(['RD', 'NR']),
});

const respostaSchema = z.object({
  resposta: z.string(),
  estudantes: z.array(z.object({
    estudante: z.string().trim(),
    matricula: z.string().trim(),
    excecoes: z.array(excecaoSchema.extend({ trecho: z.string() })),
  })),
  gerais: z.array(z.object({ trecho: z.string(), excecoes: z.array(excecaoSchema) })),
});

const EXCECAO_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'habilidade', 'conceito'],
  properties: {
    area: { type: 'integer', description: 'O número antes do ponto no código da habilidade.' },
    habilidade: { type: 'integer', description: 'O número depois do ponto no código da habilidade.' },
    conceito: { type: 'string', enum: ['RD', 'NR'] },
  },
} as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta', 'estudantes', 'gerais'],
  properties: {
    resposta: {
      type: 'string',
      description: 'Uma resposta curta ao auxiliar de ensino: o que você leu e o que ficou em dúvida.',
    },
    estudantes: {
      type: 'array',
      description: 'Uma entrada por estudante citado com alguma dificuldade. Quem não foi citado fica de fora.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['estudante', 'matricula', 'excecoes'],
        properties: {
          estudante: { type: 'string', description: 'O nome como a observação o escreve.' },
          matricula: { type: 'string', description: 'A matrícula, se a observação trouxer; senão string vazia.' },
          excecoes: {
            type: 'array',
            items: {
              ...EXCECAO_JSON,
              required: [...EXCECAO_JSON.required, 'trecho'],
              properties: {
                ...EXCECAO_JSON.properties,
                trecho: { type: 'string', description: 'O trecho da observação que justifica este conceito.' },
              },
            },
          },
        },
      },
    },
    gerais: {
      type: 'array',
      description: 'Observações sobre a turma inteira ou uma área inteira, sem nome de estudante.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trecho', 'excecoes'],
        properties: { trecho: { type: 'string' }, excecoes: { type: 'array', items: EXCECAO_JSON } },
      },
    },
  },
} as const;

function buildSystemPrompt({ turma, etapa, areas, estudantes }: InterpretarObservacoesInput): string {
  const habilidades = areas
    .map((area) =>
      `Área ${area.indice} — ${area.titulo}\n` +
      area.habilidades.map((h) => `  ${area.indice}.${h.indice} ${h.numero} ${h.texto}`).join('\n'),
    )
    .join('\n');

  return [
    'Você lê as observações que um professor mandou sobre o desempenho dos',
    `estudantes da turma ${turma} na ${etapa}, para preencher a ficha de`,
    'desempenho no portal do professor de Limoeiro de Anadia. Quem usa sua',
    'resposta é o auxiliar de ensino, que confere tudo antes de ir ao portal.',
    '',
    'Cada habilidade recebe um conceito: R (realiza), RD (realiza com',
    'dificuldades) ou NR (não realiza). Um estudante que o professor não cita',
    'foi bem: fica R em tudo, e você não o devolve. Devolva só as exceções —',
    'RD ou NR —, cada uma com o trecho da observação que a justifica.',
    '',
    'Use só as habilidades abaixo, pelo código <área>.<habilidade>. Uma',
    'dificuldade que não corresponde a nenhuma delas não vira exceção: diga',
    'isso na resposta. Escolha as habilidades a que a observação realmente se',
    'refere; não espalhe uma dificuldade por habilidades que ela não menciona.',
    'Use NR só quando a observação disser que o estudante não faz; dificuldade,',
    'ajuda, "ainda está aprendendo" são RD.',
    '',
    habilidades,
    '',
    'Estudantes da turma (nome e matrícula):',
    estudantes.map((e) => `- ${e.nome} (${e.matricula})`).join('\n'),
    '',
    'Escreva o nome do estudante como a observação o escreve; quem casa o nome',
    'com a matrícula é o sistema. Nunca invente um estudante.',
    'Observações sobre a turma inteira ou uma área inteira, sem nome, vão em',
    '"gerais" — nunca as copie para cada estudante.',
    'Responda só o JSON do schema.',
  ].join('\n');
}

export async function interpretarObservacoes(input: InterpretarObservacoesInput): Promise<ObservacoesInterpretadas> {
  const { texto, arquivos = [], estudantes, areas, signal, complete = chatCompletion } = input;
  const content = await buildContentParts({ texto, arquivos });
  if (content.length === 0) {
    throw new EnvioInvalidoError('Envie as observações do professor em texto ou em arquivo.');
  }

  const raw = await complete({
    system: buildSystemPrompt(input),
    content,
    format: { name: 'observacoes_da_ficha', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> },
    parsePdf: arquivos.some((arquivo) => arquivo.mimeType === 'application/pdf'),
    signal,
  });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnvioInvalidoError('O agente não devolveu um JSON válido.');
  }
  const parsed = respostaSchema.safeParse(json);
  if (!parsed.success) {
    throw new EnvioInvalidoError('O agente devolveu as observações fora do formato esperado.');
  }

  const descartadas: ObservacoesInterpretadas['descartadas'] = [];
  const valida = (excecao: Excecao, trecho: string): boolean => {
    const area = areas.find((candidata) => candidata.indice === excecao.area);
    if (!area) {
      descartadas.push({ trecho, motivo: `A área ${excecao.area} não está entre as escolhidas.` });
      return false;
    }
    if (!area.habilidades.some((h) => h.indice === excecao.habilidade)) {
      descartadas.push({ trecho, motivo: `A área "${area.titulo}" não tem a habilidade ${excecao.habilidade}.` });
      return false;
    }
    return true;
  };

  const resultado: ObservacoesInterpretadas = {
    resposta: parsed.data.resposta,
    estudantes: [],
    naoResolvidos: [],
    gerais: [],
    descartadas,
  };

  for (const lido of parsed.data.estudantes) {
    const excecoes = lido.excecoes
      .filter((excecao) => valida(excecao, excecao.trecho))
      .map(({ area, habilidade, conceito, trecho }) => ({ area, habilidade, conceito, trecho }));

    try {
      const matricula = resolverMatriculaDaNota({ estudante: lido.estudante, matricula: lido.matricula }, estudantes);
      const nome = estudantes.find((e) => e.matricula === matricula)!.nome;
      const existente = resultado.estudantes.find((e) => e.matricula === matricula);
      if (existente) existente.excecoes.push(...excecoes);
      else resultado.estudantes.push({ matricula, nome, excecoes });
    } catch (error) {
      const candidatos = error instanceof EstudanteAmbiguoError
        ? estudantes.filter((e) => error.candidatos.includes(e.nome)).map((e) => e.matricula)
        : [];
      resultado.naoResolvidos.push({
        estudante: lido.estudante,
        motivo: error instanceof Error ? error.message : String(error),
        candidatos,
        excecoes,
      });
    }
  }

  for (const geral of parsed.data.gerais) {
    const excecoes = geral.excecoes.filter((excecao) => valida(excecao, geral.trecho));
    if (excecoes.length > 0) resultado.gerais.push({ trecho: geral.trecho, excecoes });
  }

  return resultado;
}
