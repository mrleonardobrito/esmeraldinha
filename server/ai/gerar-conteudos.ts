import { z } from 'zod';

import { chatCompletion, type ContentPart } from './openrouter';
import { EnvioInvalidoError } from './errors';
import { buildContentParts, type ArquivoEnviado } from './interpretar-envio';
import type { CodigoCR } from '../codigos-cr/store';

/** Uma aula do escopo que ainda não tem conteúdo no portal. */
export interface AulaParaGerar {
  readonly data: string;
  readonly ordem: number | null;
}

/**
 * Uma aula que já tem conteúdo — no escopo (o que o portal já guarda) ou
 * escolhida pelo auxiliar de ensino noutro mês ou etapa. Serve de base para o
 * agente: é dela que sai o jeito de escrever do professor e a continuidade.
 */
export interface AulaDeReferencia {
  readonly etapa: string;
  readonly mes: string;
  readonly data: string;
  readonly ordem: number | null;
  readonly codigoCR: string | null;
  readonly desenvolvimento: string | null;
  readonly ferramentas: string | null;
}

export interface MensagemDaConversa {
  readonly papel: 'auxiliar' | 'assistente';
  readonly texto: string;
}

/** O conteúdo de uma aula como o agente o escreveu, antes de ir ao portal. */
export interface RascunhoDeConteudo {
  readonly data: string;
  readonly ordem: number | null;
  readonly codigoCR: string;
  readonly desenvolvimento: string;
  readonly ferramentas: string;
}

export interface GerarConteudosInput {
  readonly turma: string;
  readonly etapa: string;
  /** O mês do escopo; `null` quando a conversa é sobre a etapa inteira. */
  readonly mes: string | null;
  readonly aulasPendentes: readonly AulaParaGerar[];
  readonly aulasPreenchidas: readonly AulaDeReferencia[];
  readonly referencias: readonly AulaDeReferencia[];
  /** Os rascunhos da rodada anterior, para o agente ajustar em vez de recomeçar. */
  readonly rascunhos: readonly RascunhoDeConteudo[];
  /** A conversa inteira, terminando na mensagem do auxiliar de ensino. */
  readonly mensagens: readonly MensagemDaConversa[];
  readonly arquivos?: readonly ArquivoEnviado[];
  readonly codigosCR: readonly CodigoCR[];
  readonly signal?: AbortSignal;
  /** Injetado nos testes para não sair para a rede. */
  readonly complete?: typeof chatCompletion;
}

export interface ConteudosGerados {
  readonly resposta: string;
  readonly aulas: readonly RascunhoDeConteudo[];
}

const respostaSchema = z.object({
  resposta: z.string().trim(),
  aulas: z.array(
    z.object({
      data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'data fora de dd/mm/aaaa'),
      ordem: z.number().int().nonnegative().nullable(),
      codigoCR: z.string(),
      desenvolvimento: z.string(),
      ferramentas: z.string(),
    }),
  ),
});

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta', 'aulas'],
  properties: {
    resposta: {
      type: 'string',
      description:
        'Uma resposta curta ao auxiliar de ensino, em português: o que você ' +
        'escreveu ou mudou, e o que ficou em dúvida. Sem repetir o conteúdo ' +
        'das aulas, que já vai em "aulas".',
    },
    aulas: {
      type: 'array',
      description:
        'Uma entrada para CADA aula pendente listada, sempre todas — inclusive ' +
        'as que não mudaram nesta rodada, copiadas do rascunho atual.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'ordem', 'codigoCR', 'desenvolvimento', 'ferramentas'],
        properties: {
          data: { type: 'string', description: 'dd/mm/aaaa, copiada da lista de aulas pendentes.' },
          ordem: {
            type: ['integer', 'null'],
            description: 'A ordem da aula, copiada da lista de aulas pendentes.',
          },
          codigoCR: {
            type: 'string',
            description:
              'Só os códigos das habilidades, separados por vírgula (ex.: ' +
              '"EF03LP18, EF03LP25"), escolhidos do catálogo. String vazia ' +
              'quando o catálogo não tem código para a turma.',
          },
          desenvolvimento: { type: 'string' },
          ferramentas: { type: 'string' },
        },
      },
    },
  },
} as const;

/**
 * O ano da turma, lido do nome que o portal escreve ("3º ANO - 3º ANO A -
 * INTEGRAL" é o 3º ano). Sem ano — pré-escola, EJA — não há código CR do
 * ensino fundamental para oferecer.
 */
export function anoDaTurma(turma: string): number | null {
  const match = /(\d)\s*[ºo°]\s*ANO/i.exec(turma);
  return match ? Number(match[1]) : null;
}

/**
 * O catálogo é do ensino fundamental inteiro; para a turma só interessa o que
 * vale para o ano dela. O código diz isso: EF03 é do 3º ano, EF15 vale do 1º
 * ao 5º, EF35 do 3º ao 5º.
 */
export function codigosDoAno(codigos: readonly CodigoCR[], ano: number | null): CodigoCR[] {
  if (ano === null) return [];

  return codigos.filter(({ codigo }) => {
    const match = /^EF(\d)(\d)/i.exec(codigo);
    if (!match) return false;

    const [, primeiro, segundo] = match.map(Number);
    return primeiro === 0 ? segundo === ano : primeiro <= ano && ano <= segundo;
  });
}

function rotulo(aula: { data: string; ordem: number | null }): string {
  return aula.ordem === null ? aula.data : `${aula.data} (ordem ${aula.ordem})`;
}

function descreveReferencia(aula: AulaDeReferencia): string {
  return [
    `- Aula de ${rotulo(aula)} — ${aula.etapa}, ${aula.mes}`,
    `  Código CR: ${aula.codigoCR ?? '(vazio)'}`,
    `  Desenvolvimento / Metodologia: ${aula.desenvolvimento ?? '(vazio)'}`,
    `  Ferramentas utilizadas: ${aula.ferramentas ?? '(vazio)'}`,
  ].join('\n');
}

function buildSystemPrompt(input: GerarConteudosInput, codigos: readonly CodigoCR[]): string {
  const escopo = input.mes ? `o mês de ${input.mes} da ${input.etapa}` : `a ${input.etapa} inteira`;

  const pendentes =
    input.aulasPendentes.length === 0
      ? '(nenhuma — todas as aulas do escopo já estão no portal)'
      : input.aulasPendentes.map((aula) => `- ${rotulo(aula)}`).join('\n');

  const preenchidas =
    input.aulasPreenchidas.length === 0
      ? '(nenhuma ainda)'
      : input.aulasPreenchidas.map(descreveReferencia).join('\n');

  const referencias =
    input.referencias.length === 0
      ? '(nenhuma escolhida)'
      : input.referencias.map(descreveReferencia).join('\n');

  const catalogo =
    codigos.length === 0
      ? '(sem catálogo para esta turma — deixe codigoCR vazio, a menos que o ' +
        'material traga um código explicitamente)'
      : codigos.map(({ codigo, texto }) => `- ${codigo}: ${texto}`).join('\n');

  return [
    'Você escreve o conteúdo das aulas de um professor na caderneta dele, no',
    'portal do professor de Limoeiro de Anadia, a pedido do auxiliar de ensino.',
    'O auxiliar conversa com você: descreve o que foi dado, anexa planos de',
    'aula e escolhe aulas já escritas como base. Você devolve um rascunho por',
    'aula pendente, e ele revisa antes de levar ao portal.',
    '',
    `Turma: ${input.turma}. Escopo da conversa: ${escopo}.`,
    '',
    'Aulas pendentes (escreva UMA entrada em "aulas" para cada uma, sempre',
    'todas, com data e ordem copiadas exatamente daqui):',
    pendentes,
    '',
    'Aulas do escopo que o portal já tem. Não as reescreva: elas mostram o',
    'jeito de escrever do professor e o que já foi dado, para você continuar',
    'de onde parou sem repetir:',
    preenchidas,
    '',
    'Aulas de outros meses ou etapas que o auxiliar escolheu como referência.',
    'Siga o estilo, o tamanho e o nível de detalhe delas; retome os assuntos',
    'quando fizer sentido:',
    referencias,
    '',
    'Cada aula tem três campos, como o portal os chama:',
    '- Código CR: as habilidades trabalhadas. Devolva SÓ os códigos, separados',
    '  por vírgula, escolhidos do catálogo abaixo. Nunca invente um código.',
    '- Desenvolvimento / Metodologia: o que foi feito na aula, em prosa',
    '  corrida, na voz de quem registra a aula (ex.: "Leitura compartilhada',
    '  da fábula..."). Um parágrafo; sem títulos, listas ou markdown.',
    '- Ferramentas utilizadas: os recursos, separados por vírgula (ex.:',
    '  "Livro didático, quadro, caderno").',
    '',
    'Regras:',
    '- Escreva em português do Brasil, no registro das aulas de referência.',
    '- Use o que o auxiliar disse e o que os arquivos trazem; não invente',
    '  conteúdo que nada no material sustente. Se faltar informação para',
    '  alguma aula, escreva o que dá e diga em "resposta" o que ficou faltando.',
    '- As aulas seguem em ordem cronológica: uma continua a anterior.',
    '- Quando houver rascunho atual e o auxiliar pedir uma mudança, mude só o',
    '  que ele pediu e copie o resto do rascunho sem alterar uma palavra.',
    '- Se o auxiliar só fizer uma pergunta, responda em "resposta" e devolva',
    '  os rascunhos atuais como estão.',
    '',
    'Catálogo de códigos CR para esta turma:',
    catalogo,
    '',
    'Responda só o JSON do schema.',
  ].join('\n');
}

function descreveConversa(input: GerarConteudosInput): string {
  const conversa = input.mensagens
    .map((mensagem) =>
      `${mensagem.papel === 'auxiliar' ? 'Auxiliar de ensino' : 'Você'}: ${mensagem.texto}`,
    )
    .join('\n\n');

  const rascunhos =
    input.rascunhos.length === 0
      ? 'Rascunhos atuais: nenhum ainda.'
      : `Rascunhos atuais (JSON):\n${JSON.stringify(input.rascunhos, null, 2)}`;

  return `${rascunhos}\n\nConversa:\n\n${conversa}`;
}

/** Um código da BNCC como o agente o devolve: EF, o ano ou a faixa, a sigla e o número. */
const CODIGO_BNCC = /EF\d{2}[A-Z]{2}\d{2}/gi;

/**
 * O campo Código CR como o portal o guarda: uma habilidade por linha, numerada,
 * com o código entre parênteses e o texto oficial ao lado — o mesmo formato em
 * que as aulas já lançadas à mão aparecem. O agente só devolve os códigos;
 * o texto vem do catálogo. Um código fora dele fica só com o código, e um
 * campo sem código nenhum fica como veio.
 */
export function montarCodigoCR(
  codigoCR: string,
  buscar: (codigo: string) => CodigoCR | null,
): string {
  const encontrados = [...new Set((codigoCR.match(CODIGO_BNCC) ?? []).map((c) => c.toUpperCase()))];
  if (encontrados.length === 0) return codigoCR.trim();

  return encontrados
    .map((codigo, indice) => {
      const habilidade = buscar(codigo);
      return `${indice + 1}. (${codigo})${habilidade ? ` ${habilidade.texto}` : ''}`;
    })
    .join('\n');
}

const mesmaAula = (a: { data: string; ordem: number | null }, b: { data: string; ordem: number | null }) =>
  a.data === b.data && a.ordem === b.ordem;

/**
 * Gera (ou ajusta) o conteúdo das aulas pendentes do escopo a partir da
 * conversa, dos arquivos e das aulas de referência. Não toca no portal: o
 * resultado é um rascunho para o auxiliar de ensino revisar.
 *
 * Toda rodada devolve o conjunto inteiro de rascunhos: quando o agente deixa
 * uma aula de fora, o rascunho anterior dela é mantido — pedir "muda a aula de
 * 23/09" não pode apagar a de 16/09.
 */
export async function gerarConteudos(input: GerarConteudosInput): Promise<ConteudosGerados> {
  const complete = input.complete ?? chatCompletion;
  const codigos = codigosDoAno(input.codigosCR, anoDaTurma(input.turma));

  const content: ContentPart[] = [
    { type: 'text', text: descreveConversa(input) },
    ...(await buildContentParts({ arquivos: input.arquivos ?? [] })),
  ];

  const raw = await complete({
    system: buildSystemPrompt(input, codigos),
    content,
    format: { name: 'conteudos_gerados', schema: RESPONSE_SCHEMA },
    parsePdf: (input.arquivos ?? []).some((arquivo) => arquivo.mimeType === 'application/pdf'),
    signal: input.signal,
  });

  let parsed: z.infer<typeof respostaSchema>;
  try {
    parsed = respostaSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new EnvioInvalidoError(
      `O agente respondeu num formato inesperado: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const buscar = (codigo: string) =>
    codigos.find((candidato) => candidato.codigo.toUpperCase() === codigo.toUpperCase()) ?? null;

  const aulas = input.aulasPendentes.flatMap((pendente) => {
    const gerada = parsed.aulas.find((aula) => mesmaAula(aula, pendente));
    if (gerada) {
      return [{ ...gerada, codigoCR: montarCodigoCR(gerada.codigoCR, buscar) }];
    }

    const anterior = input.rascunhos.find((rascunho) => mesmaAula(rascunho, pendente));
    return anterior ? [anterior] : [];
  });

  return { resposta: parsed.resposta, aulas };
}
