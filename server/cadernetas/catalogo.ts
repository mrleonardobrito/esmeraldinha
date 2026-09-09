import type {
  ConteudoCatalogo,
  DisciplinaOptions,
  DisciplinasDaTurma,
} from '../scrape/types';
import type { AvaliacaoDaTurma } from './store';

/**
 * O catálogo do portal mais as disciplinas e avaliações de cada turma, lidas
 * do banco.
 *
 * O portal cadastra a avaliação por turma: perguntar por uma turma só e
 * atribuir a resposta à etapa inteira dizia "esta etapa não tem avaliação
 * cadastrada" sempre que a primeira turma do professor não tinha nenhuma —
 * mesmo com as outras turmas cheias delas.
 *
 * A raspagem da caderneta já percorre o portal turma por turma e guarda o
 * resultado, então aqui não há volta ao portal nenhuma: uma turma só aparece
 * enriquecida depois que a caderneta dela é sincronizada, que é o mesmo que o
 * lançamento de notas já exige.
 */
export function comAvaliacoesDoBanco(
  catalogo: ConteudoCatalogo,
  avaliacoes: readonly AvaliacaoDaTurma[],
): ConteudoCatalogo {
  return {
    etapas: catalogo.etapas.map((etapa) => ({
      ...etapa,
      disciplinasPorTurma: etapa.turmas
        .map((turma) => ({
          turma,
          disciplinas: disciplinasDe(avaliacoes, etapa.nome, turma),
        }))
        .filter((daTurma) => daTurma.disciplinas.length > 0),
    })),
  };
}

/** As disciplinas da turma naquela etapa, cada uma com as suas avaliações. */
function disciplinasDe(
  avaliacoes: readonly AvaliacaoDaTurma[],
  etapa: string,
  turma: string,
): DisciplinasDaTurma['disciplinas'] {
  const porDisciplina = new Map<string, DisciplinaOptions['avaliacoes'][number][]>();

  for (const avaliacao of avaliacoes) {
    if (avaliacao.etapa !== etapa || avaliacao.turma !== turma) continue;

    const lista = porDisciplina.get(avaliacao.disciplina) ?? [];
    lista.push({
      nome: avaliacao.nome,
      ...(avaliacao.tipo === undefined ? {} : { tipo: avaliacao.tipo }),
      ...(avaliacao.valor === undefined ? {} : { valor: avaliacao.valor }),
      ...(avaliacao.media === undefined ? {} : { media: avaliacao.media }),
    });
    porDisciplina.set(avaliacao.disciplina, lista);
  }

  return [...porDisciplina].map(([nome, avaliacoesDaDisciplina]) => ({
    nome,
    avaliacoes: avaliacoesDaDisciplina,
  }));
}
