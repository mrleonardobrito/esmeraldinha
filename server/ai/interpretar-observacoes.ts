import { z } from 'zod';

import { ETAPAS_DA_FICHA, type AreaDeConhecimento, type Excecao, type IndiceDaEtapa } from '../../shared/ficha-de-desempenho';
import { EstudanteAmbiguoError, resolverMatricula } from '../notas/estudantes';
import { EnvioInvalidoError } from './errors';
import { buildContentParts, type ArquivoEnviado } from './interpretar-envio';
import { chatCompletion } from './openrouter';

export type ExcecaoComTrecho = Excecao & { trecho: string };

export interface ObservacoesInterpretadas {
  /** A short reply from the agent to the auxiliar de ensino. */
  resposta: string;
  /** `escrito` is the name as the observação wrote it. */
  estudantes: { matricula: string; nome: string; escrito: string; excecoes: ExcecaoComTrecho[] }[];
  /** Names that match no estudante, or more than one: never applied on their own. */
  naoResolvidos: { estudante: string; motivo: string; candidatos: string[]; excecoes: ExcecaoComTrecho[] }[];
  /**
   * Observações about the whole turma or a whole área, possibly of one named
   * estudante: suggestions the auxiliar applies or dismisses.
   */
  gerais: { trecho: string; estudante: { matricula: string; nome: string } | null; excecoes: Excecao[] }[];
  /** Exceções that pointed outside the chosen áreas or to no habilidade. */
  descartadas: { motivo: string; trecho: string }[];
}

export interface InterpretarObservacoesInput {
  turma: string;
  /** The etapas being filled; an observação without etapa applies to all of them. */
  etapas: readonly IndiceDaEtapa[];
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
  etapas: z.array(z.number().int()).default([]),
  tipo: z.enum(['dificuldade', 'melhoria']).default('dificuldade'),
  etapaDaMelhoria: z.number().int().default(0),
  gradual: z.boolean().default(false),
});

const respostaSchema = z.object({
  resposta: z.string(),
  estudantes: z.array(z.object({
    estudante: z.string().trim(),
    matricula: z.string().trim(),
    excecoes: z.array(excecaoSchema.extend({ trecho: z.string() })),
  })),
  gerais: z.array(z.object({ trecho: z.string(), estudante: z.string().trim().default(''), excecoes: z.array(excecaoSchema) })),
});

const EXCECAO_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['area', 'habilidade', 'tipo', 'conceito', 'etapas', 'etapaDaMelhoria', 'gradual'],
  properties: {
    area: {
      type: 'integer',
      description: 'O número antes do ponto no código da habilidade; -1 para todas as áreas da lista.',
    },
    habilidade: {
      type: 'integer',
      description: 'O número da habilidade como a ficha o mostra (o 13 de "13°"); -1 para todas as habilidades da área.',
    },
    tipo: {
      type: 'string',
      enum: ['dificuldade', 'melhoria'],
      description: '"dificuldade" usa conceito e etapas; "melhoria" usa etapaDaMelhoria e gradual.',
    },
    etapaDaMelhoria: {
      type: 'integer',
      description: 'Só em melhoria: a etapa (1 a 4) a partir da qual o estudante passou a realizar (R). 0 em dificuldade.',
    },
    gradual: {
      type: 'boolean',
      description: 'Só em melhoria: true quando a melhora foi gradual (começou sem realizar e passou por dificuldade).',
    },
    conceito: { type: 'string', enum: ['RD', 'NR'] },
    etapas: {
      type: 'array',
      items: { type: 'integer', enum: [1, 2, 3, 4] },
      description:
        'As etapas (1 a 4) em que o estudante teve esta dificuldade. Lista vazia quando ' +
        'a observação não diz a etapa: aí ela vale para todas as etapas sendo preenchidas.',
    },
  },
} as const;

/** The habilidade's number as the ficha shows it ("13°" → 13). */
function numeroDa(habilidade: { indice: number; numero: string }): number {
  const numero = Number.parseInt(habilidade.numero, 10);
  return Number.isNaN(numero) ? habilidade.indice + 1 : numero;
}

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
          matricula: {
            type: 'string',
            description: 'A matrícula só se ela estiver escrita na observação; nunca a copie da lista de estudantes. Senão string vazia.',
          },
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
      description:
        'Observações sobre a turma inteira, ou sobre uma área inteira de um estudante ' +
        '("João tem dificuldade em Matemática"), em vez de habilidades específicas.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['trecho', 'estudante', 'excecoes'],
        properties: {
          trecho: { type: 'string' },
          estudante: {
            type: 'string',
            description: 'O nome do estudante como a observação o escreve; string vazia quando é sobre a turma inteira.',
          },
          excecoes: { type: 'array', items: EXCECAO_JSON },
        },
      },
    },
  },
} as const;

function listarEtapas(etapas: readonly IndiceDaEtapa[]): string {
  const nomes = [...etapas].sort((a, b) => a - b).map((etapa) => ETAPAS_DA_FICHA[etapa - 1]);
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

function buildSystemPrompt({ turma, etapas, areas, estudantes }: InterpretarObservacoesInput): string {
  const habilidades = areas
    .map((area) =>
      `Área ${area.indice} — ${area.titulo}\n` +
      area.habilidades.map((h) => `  ${area.indice}.${numeroDa(h)} — ${h.texto}`).join('\n'),
    )
    .join('\n');

  return [
    'Você lê as observações que um professor mandou sobre o desempenho dos',
    `estudantes da turma ${turma}, para preencher a ficha de desempenho no`,
    `portal do professor de Limoeiro de Anadia nas etapas ${listarEtapas(etapas)}.`,
    'Quem usa sua resposta é o auxiliar de ensino, que confere tudo antes de ir',
    'ao portal.',
    '',
    'Cada exceção diz em quais etapas vale. Uma observação que não diz a etapa',
    'vale para todas: devolva etapas vazio. Uma observação que diz a etapa ou a',
    'evolução vale só para as etapas que descreve: "melhorou na III etapa" é a',
    'dificuldade nas etapas antes da III, e R da III em diante. Um conceito',
    'nunca piora de uma etapa para a seguinte.',
    '',
    'Quando a observação diz que o estudante melhorou, devolva tipo "melhoria"',
    'com etapaDaMelhoria = a etapa a partir da qual ele realiza (R), e gradual',
    'true se a melhora foi gradual. O sistema calcula os conceitos: gradual é NR',
    'na I ETAPA, RD nas etapas seguintes e R a partir da etapa da melhoria;',
    'sem ser gradual, RD antes da etapa da melhoria e R a partir dela. Ninguém',
    'termina sem realizar uma habilidade em que melhorou. Exemplo: "melhoria',
    'gradual até o final da IV etapa" é etapaDaMelhoria 4 e gradual true, ou',
    'seja NR na I ETAPA, RD na II e na III ETAPA e R na IV ETAPA.',
    '',
    'Quando a observação fala de todas as habilidades de uma área, use',
    'habilidade -1 naquela área; de todas as habilidades de todas as áreas,',
    'use área -1 e habilidade -1. Não liste as habilidades uma a uma.',
    'Uma observação sobre a turma, "a maioria" ou "os alunos" vale para a',
    'turma inteira: devolva-a em "gerais" com estudante vazio — o auxiliar',
    'corrige depois quem foge dela.',
    '',
    'Cada habilidade recebe um conceito: R (realiza), RD (realiza com',
    'dificuldades) ou NR (não realiza). Um estudante que o professor não cita',
    'foi bem: fica R em tudo, e você não o devolve. Devolva só as exceções —',
    'RD ou NR —, cada uma com o trecho da observação que a justifica.',
    '',
    'Use só as habilidades abaixo, pelo código <área>.<número>, em que o número',
    'é o que a ficha mostra: "a habilidade 13 de Arte" é o código <área de',
    'Arte>.13. Uma',
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
    'Nunca copie uma observação sobre a turma para cada estudante.',
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
  /**
   * The exceção with its etapas narrowed to the run and "todas" (-1) expanded
   * into one exceção per habilidade; empty (and why, in descartadas) when it
   * points nowhere.
   */
  const valida = (
    excecao: z.infer<typeof excecaoSchema>,
    trecho: string,
  ): Excecao[] => {
    // A melhoria is turned into conceitos here, not by the model: gradual is
    // NR in I and RD up to the etapa it improved; otherwise RD before it.
    const partes: { conceito: 'RD' | 'NR'; etapas: number[]; explicita: boolean }[] = [];
    if (excecao.tipo === 'melhoria') {
      const a = Math.min(Math.max(excecao.etapaDaMelhoria, 1), 5);
      const antes = [1, 2, 3, 4].filter((etapa) => etapa < a);
      if (excecao.gradual) {
        if (antes.includes(1)) partes.push({ conceito: 'NR', etapas: [1], explicita: false });
        if (antes.length > 1) partes.push({ conceito: 'RD', etapas: antes.slice(1), explicita: false });
      } else if (antes.length > 0) {
        partes.push({ conceito: 'RD', etapas: antes, explicita: false });
      }
    } else {
      partes.push({ conceito: excecao.conceito, etapas: excecao.etapas, explicita: true });
    }

    const alvo = excecao.area === -1 ? areas : areas.filter((candidata) => candidata.indice === excecao.area);
    if (alvo.length === 0) {
      descartadas.push({ trecho, motivo: `A área ${excecao.area} não está entre as escolhidas.` });
      return [];
    }
    const todas = excecao.area === -1 || excecao.habilidade === -1;
    if (!todas && !alvo[0].habilidades.some((h) => numeroDa(h) === excecao.habilidade)) {
      descartadas.push({ trecho, motivo: `A área "${alvo[0].titulo}" não tem a habilidade ${excecao.habilidade}.` });
      return [];
    }
    const habilidades = alvo.flatMap((area) => area.habilidades
      .filter((h) => todas || numeroDa(h) === excecao.habilidade)
      .map((h) => ({ area: area.indice, habilidade: h.indice })));

    return partes.flatMap(({ conceito, etapas: pedidas, explicita }) => {
      const daExecucao = explicita && pedidas.length === 0
        ? [...input.etapas]
        : input.etapas.filter((etapa) => pedidas.includes(etapa));
      if (daExecucao.length === 0) {
        if (explicita) descartadas.push({ trecho, motivo: 'A observação fala de uma etapa que não está sendo preenchida.' });
        return [];
      }
      const etapas = [...daExecucao].sort((x, y) => x - y);
      return habilidades.map((h) => ({ ...h, conceito, etapas }));
    });
  };

  /**
   * The estudante a name designates. A matrícula from the agent only counts
   * when the observação itself wrote it: copied from the turma's list, it
   * would skip the check that a name designates exactly one estudante.
   */
  const textoDoEnvio = texto ?? '';
  const resolver = (nome: string, matricula: string):
    | { matricula: string; nome: string }
    | { motivo: string; candidatos: string[] } => {
    const escrita = /^\d+$/.test(matricula) && new RegExp(`(^|\\D)${matricula}(\\D|$)`).test(textoDoEnvio)
      ? estudantes.find((e) => e.matricula === matricula)
      : undefined;
    if (escrita) return { matricula: escrita.matricula, nome: escrita.nome };
    try {
      const encontrada = resolverMatricula(nome, estudantes);
      return { matricula: encontrada, nome: estudantes.find((e) => e.matricula === encontrada)!.nome };
    } catch (error) {
      const candidatos = error instanceof EstudanteAmbiguoError
        ? estudantes.filter((e) => error.candidatos.includes(e.nome)).map((e) => e.matricula)
        : [];
      return { motivo: error instanceof Error ? error.message : String(error), candidatos };
    }
  };

  const resultado: ObservacoesInterpretadas = {
    resposta: parsed.data.resposta,
    estudantes: [],
    naoResolvidos: [],
    gerais: [],
    descartadas,
  };

  for (const lido of parsed.data.estudantes) {
    const excecoes = lido.excecoes.flatMap((excecao) =>
      valida(excecao, excecao.trecho).map((validada) => ({ ...validada, trecho: excecao.trecho })));

    const resolvido = resolver(lido.estudante, lido.matricula);
    if ('matricula' in resolvido) {
      const existente = resultado.estudantes.find((e) => e.matricula === resolvido.matricula);
      if (existente) existente.excecoes.push(...excecoes);
      else resultado.estudantes.push({ ...resolvido, escrito: lido.estudante, excecoes });
    } else {
      resultado.naoResolvidos.push({ estudante: lido.estudante, ...resolvido, excecoes });
    }
  }

  for (const geral of parsed.data.gerais) {
    const excecoes = geral.excecoes.flatMap((excecao) => valida(excecao, geral.trecho));
    if (excecoes.length === 0) continue;
    if (!geral.estudante) {
      resultado.gerais.push({ trecho: geral.trecho, estudante: null, excecoes });
      continue;
    }
    const resolvido = resolver(geral.estudante, '');
    if ('matricula' in resolvido) resultado.gerais.push({ trecho: geral.trecho, estudante: resolvido, excecoes });
    else resultado.naoResolvidos.push({ estudante: geral.estudante, ...resolvido, excecoes: excecoes.map((e) => ({ ...e, trecho: geral.trecho })) });
  }

  return resultado;
}
