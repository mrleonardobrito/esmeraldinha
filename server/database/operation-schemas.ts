import { z } from 'zod';

import { CLASSIFICACOES } from '../../shared/classificacao-de-notas';
import { CONCEITOS } from '../../shared/ficha-de-desempenho';

const id = z.uuid();
const text = z.string().min(1).max(100_000);
const optionalText = z.string().max(100_000).nullish();
const number = z.number().finite();
const optionalNumber = number.nullish();
const estudante = z.object({
  matricula: text,
  nome: text,
  situacao: optionalText,
  dataMatricula: optionalText,
});
const nota = z.object({ matricula: text, avaliacao: text, valor: number });
const notaDoEstudante = z.object({
  matricula: text,
  origem: optionalNumber,
  calculada: optionalNumber,
  parcial: optionalNumber,
  personalizada: optionalNumber,
});
const avaliacao = z.object({
  nome: text,
  tipo: optionalText,
  data: optionalText,
  valor: optionalNumber,
  media: optionalNumber,
});
const aula = z.object({
  mes: text,
  data: text,
  ordem: z.number().int().nullish(),
  preenchida: z.boolean(),
  codigoCR: optionalText,
  desenvolvimento: optionalText,
  ferramentas: optionalText,
});
const raspagem = z.object({
  etapas: z.array(
    z.object({
      nome: text,
      meses: z.array(text),
      aulas: z.array(aula),
      boletins: z
        .array(
          z.object({
            disciplina: text,
            avaliacoes: z.array(avaliacao),
            notas: z.array(nota),
            notasDoEstudante: z.array(notaDoEstudante),
          }),
        )
        .optional(),
    }),
  ),
  estudantes: z.array(estudante),
});

/** JSON turns an omitted turma into null; stores expect undefined. */
const turma = text.nullish().transform((value) => value ?? undefined);
const turmas = z.array(text).min(1).max(4);
const classificacao = z.enum(CLASSIFICACOES);
const conceitos = z.record(
  z.string().regex(/^\d+\.\d+$/),
  z.array(z.enum(CONCEITOS).nullable()).length(4),
);
const etapaDaFicha = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const excecao = z.object({
  area: z.number().int(),
  habilidade: z.number().int(),
  conceito: z.enum(['RD', 'NR']),
  etapas: z.array(etapaDaFicha),
});
const areaDaFicha = z.object({
  indice: z.number().int(),
  titulo: z.string().max(100_000),
  habilidades: z.array(
    z.object({
      indice: z.number().int(),
      numero: z.string().max(100),
      texto: z.string().max(100_000),
    }),
  ),
});
const previa = z.object({
  areas: z.array(z.number().int()),
  etapas: z.array(etapaDaFicha),
  estudantes: z.array(
    z.object({
      matricula: text,
      nome: text,
      situacao: z.string().max(100_000).nullable(),
      trechos: z.array(z.string().max(100_000)),
      conceitos,
    }),
  ),
  gerais: z.array(
    z.object({
      trecho: z.string().max(100_000),
      estudante: z.object({ matricula: text, nome: text }).nullable(),
      excecoes: z.array(excecao),
    }),
  ),
  naoResolvidos: z.array(
    z.object({
      estudante: z.string().max(100_000),
      motivo: z.string().max(100_000),
      candidatos: z.array(z.string().max(100_000)),
      excecoes: z.array(excecao.extend({ trecho: z.string().max(100_000) })),
    }),
  ),
  descartadas: z.array(
    z.object({ motivo: z.string().max(100_000), trecho: z.string().max(100_000) }),
  ),
  resposta: z.string().max(100_000),
});
const aulaDoPortal = aula.omit({ mes: true });

/** Validate the network boundary before invoking stores that also serve trusted portal jobs. */
export const operationSchemas = new Map<string, z.ZodType<unknown[]>>([
  ...[
    'professores.getProfessor',
    'professores.getProfessorCredenciais',
    'turmas.listTurmas',
    'turmas.getTurma',
    'turmas.listEstudantes',
    'cadernetas.listCadernetas',
    'cadernetas.marcarSincronizando',
    'cadernetas.deleteCaderneta',
    'cadernetas.listAvaliacoesDoProfessor',
    'cadernetas.reconcileCadernetasDeReducao',
  ].map((name) => [name, z.tuple([id])] as const),
  ...[
    'cadernetas.getCaderneta',
    'cadernetas.listEstudantes',
    'cadernetas.listDisciplinasDaCaderneta',
  ].map((name) => [name, z.tuple([id, turma])] as const),
  ...[
    'professores.listProfessores',
    'cadernetas.listTodas',
    'codigos-cr.listCodigosCR',
    'codigos-cr.garantirCatalogoDeCodigosCR',
  ].map((name) => [name, z.tuple([])] as const),
  [
    'turmas.replaceTurmas',
    z.tuple([
      id,
      z.array(
        z.object({
          nome: text,
          periodoLetivo: optionalText,
          grupoDiario: optionalText,
        }),
      ),
    ]),
  ],
  ['turmas.periodoLetivoDaTurma', z.tuple([id, text])],
  ['turmas.replaceEstudantes', z.tuple([id, z.array(estudante)])],
  [
    'turmas.updateTurma',
    z.tuple([
      id,
      z.object({
        nome: text,
        turno: optionalText,
        periodoLetivo: optionalText,
      }),
    ]),
  ],
  ['turmas.updateEstudante', z.tuple([id, text, estudante])],
  [
    'cadernetas.createCaderneta',
    z.tuple([
      z
        .object({ professorId: id, turma: text.optional(), turmas: turmas.optional() })
        .refine((input) => input.turma !== undefined || input.turmas !== undefined),
    ]),
  ],
  ['cadernetas.findCadernetaDaTurma', z.tuple([id, text])],
  ['cadernetas.listAulasDaEtapa', z.tuple([id, text, turma])],
  ['cadernetas.marcarFalhaNaSincronizacao', z.tuple([id, text])],
  ['cadernetas.syncCaderneta', z.tuple([id, raspagem, turma])],
  [
    'cadernetas.syncCadernetaTurmas',
    z.tuple([id, z.array(z.object({ turma: text, raspagem })).min(1).max(4)]),
  ],
  [
    'cadernetas.atualizarConteudosDoMes',
    z.tuple([id, text, text, z.array(aulaDoPortal), turma]),
  ],
  [
    'cadernetas.marcarConteudoPreenchido',
    z.tuple([
      id,
      z.array(
        z.object({
          etapa: text,
          data: text,
          ordem: z.number().int().nullish(),
        }),
      ),
      turma,
    ]),
  ],
  ['cadernetas.getBoletimDaEtapa', z.tuple([id, text, turma, turma])],
  [
    'cadernetas.marcarNotasLancadas',
    z.tuple([
      id,
      z.array(nota.extend({ etapa: text, disciplina: text })),
      z.array(
        notaDoEstudante
          .omit({ origem: true, calculada: true })
          .extend({ etapa: text, disciplina: text }),
      ),
      turma,
    ]),
  ],
  [
    'cadernetas.updateValores',
    z.tuple([
      id,
      z.object({
        valorRecebido: number.nonnegative().nullable(),
        valorAReceber: number.nonnegative().nullable(),
      }),
    ]),
  ],
  ['notas.getClassificacaoPadrao', z.tuple([id, text])],
  ['notas.listClassificacoes', z.tuple([id, text])],
  ['notas.setClassificacaoPadrao', z.tuple([id, text, classificacao])],
  [
    'notas.salvarClassificacoes',
    z.tuple([id, text, z.array(z.object({ matricula: text, classificacao }))]),
  ],
  ['fichas.getEstruturaDaFicha', z.tuple([id, text])],
  [
    'fichas.salvarEstruturaDaFicha',
    z.tuple([id, text, z.object({ ficha: z.string().max(100_000), areas: z.array(areaDaFicha) })]),
  ],
  ['fichas.getPrevia', z.tuple([id, text])],
  ['fichas.salvarPrevia', z.tuple([id, text, previa])],
  ['fichas.apagarPrevia', z.tuple([id, text])],
  ['codigos-cr.findCodigoCR', z.tuple([text])],
  [
    'codigos-cr.replaceCodigosCR',
    z.tuple([z.array(z.object({ codigo: text, texto: text }))]),
  ],
]);
