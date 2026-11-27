import { z } from 'zod';

import { chatCompletion } from './openrouter';
import { EnvioInvalidoError } from './errors';
import type { MensagemDaConversa } from './gerar-conteudos';
import {
  EstudanteAmbiguoError,
  resolverMatricula,
  resolverMatriculaDaNota,
  type EstudanteConhecido,
} from '../notas/estudantes';
import {
  arredondarNota,
  notaFinalDaClassificacao,
  totalDaEtapa,
  type AvaliacaoComValor,
  type Classificacao,
} from '../../shared/classificacao-de-notas';

/** An estudante as the grid shows them when the auxiliar sends a message. */
export interface EstudanteNoChat {
  readonly matricula: string;
  readonly nome: string;
  readonly notaFinal: number | null;
  readonly classificacao: Classificacao | null;
  /** Whether the professor's own notas for this row are already on the portal. */
  readonly noPortal: boolean;
}

export interface GerarNotasInput {
  readonly turma: string;
  readonly etapa: string;
  readonly disciplina: string;
  readonly avaliacoes: readonly AvaliacaoComValor[];
  readonly estudantes: readonly EstudanteNoChat[];
  /** The whole conversation, ending on the auxiliar's message. */
  readonly mensagens: readonly MensagemDaConversa[];
  readonly signal?: AbortSignal;
  /** Injected in tests so they stay off the network. */
  readonly complete?: typeof chatCompletion;
}

export interface NotaFinalGerada {
  readonly matricula: string;
  readonly notaFinal: number;
}

export interface FalhaNoChat {
  readonly estudante: string;
  readonly motivo: string;
}

export interface NotasGeradas {
  readonly resposta: string;
  readonly notas: readonly NotaFinalGerada[];
  readonly falhas: readonly FalhaNoChat[];
}

const respostaSchema = z.object({
  resposta: z.string().trim(),
  notas: z.array(
    z.object({
      matricula: z.string(),
      estudante: z.string(),
      notaFinal: z.number(),
    }),
  ),
});

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta', 'notas'],
  properties: {
    resposta: {
      type: 'string',
      description:
        'Uma resposta curta ao auxiliar de ensino, em português: que notas você ' +
        'deu e a quem, e o que ficou em dúvida.',
    },
    notas: {
      type: 'array',
      description:
        'Só os estudantes cuja nota final muda nesta rodada. Quem não está aqui ' +
        'mantém a nota que já tem.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['matricula', 'estudante', 'notaFinal'],
        properties: {
          matricula: {
            type: 'string',
            description: 'Copiada da lista de estudantes; vazia se você não tiver certeza.',
          },
          estudante: { type: 'string', description: 'O nome, como está na lista.' },
          notaFinal: { type: 'number', description: 'A nota final da etapa, em passos de 0,5.' },
        },
      },
    },
  },
} as const;

function numero(valor: number): string {
  return String(valor).replace('.', ',');
}

/** Every nota from `de` to `ate` in steps of 0,5, as the prompt lists them. */
function faixa(de: number, ate: number): string {
  const notas: string[] = [];
  for (let nota = de; nota <= ate + 1e-9; nota += 0.5) notas.push(numero(nota));
  return notas.join('; ');
}

function buildSystemPrompt(input: GerarNotasInput): string {
  const total = totalDaEtapa(input.avaliacoes);
  const acima = Math.ceil(0.8 * total * 2) / 2;
  const media = Math.ceil(0.6 * total * 2) / 2;

  const avaliacoes = input.avaliacoes
    .map(({ nome, valor }) => `- ${nome}${valor === null ? '' : ` (vale ${numero(valor)})`}`)
    .join('\n');

  return [
    'Você lança as notas de uma etapa no boletim de um professor, no portal do',
    'professor de Limoeiro de Anadia, a pedido do auxiliar de ensino. O auxiliar',
    'descreve como a turma e cada estudante foram, e você decide a nota final da',
    'etapa de cada estudante. A divisão da nota final entre as avaliações é feita',
    'depois, pelo sistema; você não precisa dela.',
    '',
    `Turma: ${input.turma}. Etapa: ${input.etapa}. Disciplina: ${input.disciplina}.`,
    '',
    `Avaliações da etapa (a nota final vai de 0 a ${numero(total)}):`,
    avaliacoes,
    '',
    'Classificações:',
    `- Acima da média: de ${numero(acima)} a ${numero(total)}.`,
    `- Na média: de ${numero(media)} a menos de ${numero(acima)}.`,
    `- Abaixo da média: menos de ${numero(media)}.`,
    '',
    'Regras:',
    '- Notas finais sempre em passos de 0,5.',
    `- "Excelente", "ótima" ou "todos foram muito bem", sem mais detalhes: ${numero(total)} para todos.`,
    `- "Acima da média" sem mais detalhes: varie entre ${numero(acima)} e ${numero(total)}, com notas diferentes entre os estudantes — espalhe pela faixa (${faixa(acima, total)}); nunca a mesma nota para todos.`,
    `- "Na média" ou "abaixo da média" sem mais detalhes: varie dentro da faixa, com notas diferentes entre os estudantes (ex.: ${faixa(Math.max(media - 1.5, 0), media - 0.5)} para abaixo da média).`,
    `- "Não alcançou a média", "não conseguiu média suficiente", "ficou sem média" ou "reprovou": Abaixo da média, menos de ${numero(media)}. Nunca Na média.`,
    `- Quando o auxiliar disser exatamente a nota, use-a. Sem faixa nem variação pedida, use o topo da classificação (${numero(total)}, ${numero(notaFinalDaClassificacao('Na média', total))} ou ${numero(notaFinalDaClassificacao('Abaixo da média', total))}).`,
    '- Quando o auxiliar descrever a turma inteira, liste TODOS os estudantes em "notas" com a nota que a descrição pede, mesmo quem já está na faixa — as notas atuais são só o ponto de partida da tela.',
    '- Estudantes marcados "já lançada no portal" têm notas que o professor já lançou: deixe-os de fora, mesmo quando o auxiliar descrever a turma inteira, a menos que ele os cite pelo nome ou peça para mudar também as notas já lançadas.',
    '- Quando o pedido for sobre estudantes específicos ("agora dê 9 à Maria"), liste só esses. Quem você não listar fica como está.',
    '- Copie a matrícula exatamente da lista de estudantes. Nunca invente estudante.',
    '- Se o auxiliar só fizer uma pergunta, responda em "resposta" e devolva "notas" vazio.',
    '',
    'Responda só o JSON do schema.',
  ].join('\n');
}

function descreveConversa(input: GerarNotasInput): string {
  const estudantes = input.estudantes
    .map(
      ({ matricula, nome, notaFinal, classificacao, noPortal }) =>
        `- ${matricula} | ${nome} | nota final atual: ${notaFinal === null ? '—' : numero(notaFinal)} | ${classificacao ?? '—'}${noPortal ? ' | já lançada no portal' : ''}`,
    )
    .join('\n');

  const conversa = input.mensagens
    .map(
      (mensagem) =>
        `${mensagem.papel === 'auxiliar' ? 'Auxiliar de ensino' : 'Você'}: ${mensagem.texto}`,
    )
    .join('\n\n');

  return `Estudantes (matrícula | nome | nota final atual | classificação):\n${estudantes}\n\nConversa:\n\n${conversa}`;
}

/**
 * The estudante a nota from the agent belongs to. The model copies both the
 * matrícula and the name, and a classic slip is the right name next to the
 * neighbouring row's matrícula — so when the name points somewhere else, the
 * nota goes nowhere instead of to the wrong estudante. A nickname that matches
 * nobody leaves the matrícula in charge.
 *
 * @throws {Error} when the matrícula and the name disagree.
 */
function resolverEstudanteDoChat(
  nota: { readonly matricula: string; readonly estudante: string },
  estudantes: readonly EstudanteConhecido[],
): string {
  const matricula = resolverMatriculaDaNota(nota, estudantes);
  if (nota.matricula.trim() === '') return matricula;

  let candidatos: readonly string[];
  try {
    candidatos = [resolverMatricula(nota.estudante, estudantes)];
  } catch (error) {
    if (!(error instanceof EstudanteAmbiguoError)) return matricula;
    candidatos = estudantes
      .filter((estudante) => error.candidatos.includes(estudante.nome))
      .map((estudante) => estudante.matricula);
  }

  if (!candidatos.includes(matricula)) {
    throw new Error(
      `A matrícula ${nota.matricula} não é de "${nota.estudante}". Nenhuma nota foi dada; ` +
        'peça de novo citando o estudante pelo nome completo.',
    );
  }

  return matricula;
}

/**
 * Turns the chat de notas into notas finais. Never touches the portal: the
 * result lands on the grid as screen edits for the auxiliar to review.
 *
 * Each estudante the agent names is checked against the turma the same way a
 * notas sheet is; one that matches nobody, or more than one, is reported
 * instead of guessed.
 */
export async function gerarNotas(input: GerarNotasInput): Promise<NotasGeradas> {
  const complete = input.complete ?? chatCompletion;

  const raw = await complete({
    system: buildSystemPrompt(input),
    content: [{ type: 'text', text: descreveConversa(input) }],
    format: { name: 'notas_geradas', schema: RESPONSE_SCHEMA },
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

  const total = totalDaEtapa(input.avaliacoes);
  const porMatricula = new Map<string, number>();
  const falhas: FalhaNoChat[] = [];

  for (const nota of parsed.notas) {
    try {
      const matricula = resolverEstudanteDoChat(nota, input.estudantes);
      porMatricula.set(matricula, arredondarNota(nota.notaFinal, total));
    } catch (error) {
      falhas.push({
        estudante: nota.estudante,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    resposta: parsed.resposta,
    notas: [...porMatricula].map(([matricula, notaFinal]) => ({ matricula, notaFinal })),
    falhas,
  };
}
