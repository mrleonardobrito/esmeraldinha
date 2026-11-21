import * as React from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import {
  alterarConceito,
  chaveDaHabilidade,
  contarExcecoes,
  ETAPAS_DA_FICHA,
  nomeDaArea,
  proximoConceito,
  type AreaDeConhecimento,
  type Conceito,
  type EstudanteDaPrevia,
  type IndiceDaEtapa,
  type PreviaDaFicha,
} from "@/lib/fichas-de-desempenho";
import { cn } from "@/lib/utils";

const COR: Record<Conceito, string> = {
  R: "bg-primary/10 text-primary",
  RD: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  NR: "bg-destructive/15 text-destructive",
};

const ativo = (situacao: string | null) => !situacao || situacao.toUpperCase() === "ATIVO";

/** How many cells below R an estudante has in one área. */
function excecoesNaArea(estudante: EstudanteDaPrevia, area: AreaDeConhecimento): number {
  const chaves = new Set(area.habilidades.map((h) => chaveDaHabilidade(area.indice, h.indice)));
  return contarExcecoes(Object.fromEntries(Object.entries(estudante.conceitos).filter(([chave]) => chaves.has(chave))));
}

function Contador({ valor }: { valor: number }) {
  return (
    <span className={cn("rounded px-1.5 text-xs tabular-nums", valor > 0 ? COR.RD : "bg-muted text-muted-foreground")}>
      {valor}
    </span>
  );
}

/**
 * The prévia as a tree: every estudante collapsible; opened, their áreas de
 * conhecimento, each collapsible; opened, the habilidades with one column per
 * etapa. A click on a cell moves its conceito R → RD → NR, keeping the row
 * from decreasing across etapas.
 */
export function PreviaDaFichaView({
  previa,
  areas,
  disabled,
  onChange,
  className,
}: {
  className?: string;
  previa: PreviaDaFicha;
  /** The structure's áreas, for titles and habilidades. */
  areas: AreaDeConhecimento[];
  disabled?: boolean;
  onChange: (previa: PreviaDaFicha) => void;
}) {
  const [estudantesAbertos, setEstudantesAbertos] = React.useState<Set<string>>(() => new Set());
  const [areasAbertas, setAreasAbertas] = React.useState<Set<string>>(() => new Set());
  const areasDaPrevia = areas.filter((area) => previa.areas.includes(area.indice));

  const alternar = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, chave: string) =>
    setter((atuais) => {
      const novas = new Set(atuais);
      if (novas.has(chave)) novas.delete(chave); else novas.add(chave);
      return novas;
    });

  function clicar(estudante: EstudanteDaPrevia, chave: string, etapa: IndiceDaEtapa) {
    const linha = estudante.conceitos[chave];
    const atual = linha?.[etapa - 1];
    if (!linha || !atual) return;
    const nova = alterarConceito(linha, etapa, proximoConceito(atual), previa.etapas);
    onChange({
      ...previa,
      estudantes: previa.estudantes.map((e) =>
        e.matricula === estudante.matricula ? { ...e, conceitos: { ...e.conceitos, [chave]: nova } } : e),
    });
  }

  return (
    <ul className={cn("flex min-h-[24rem] flex-col overflow-y-auto rounded-xl border", className)} aria-label="Estudantes da turma">
      {previa.estudantes.map((estudante) => {
        const aberto = estudantesAbertos.has(estudante.matricula);
        const preenchido = ativo(estudante.situacao);
        return (
          <li key={estudante.matricula} className="border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={aberto}
              onClick={() => alternar(setEstudantesAbertos, estudante.matricula)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50",
                !preenchido && "text-muted-foreground",
              )}
            >
              {aberto ? <IconChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <IconChevronRight className="size-4 shrink-0" aria-hidden="true" />}
              <span className="font-medium">{estudante.nome}</span>
              <span className="ml-auto flex items-center gap-2">
                {preenchido ? <Contador valor={contarExcecoes(estudante.conceitos)} /> : (
                  <span className="text-xs">não será preenchido</span>
                )}
              </span>
            </button>

            {aberto && (
              <div className="flex flex-col gap-1 pb-2 pl-9 pr-3">
                {!preenchido && (
                  <p className="text-xs text-muted-foreground">Situação {estudante.situacao}: a ficha deste estudante não será preenchida.</p>
                )}
                {estudante.trechos.map((trecho) => (
                  <p key={trecho} className="text-xs text-muted-foreground">“{trecho}”</p>
                ))}

                {areasDaPrevia.map((area) => {
                  const chaveDaArea = `${estudante.matricula}|${area.indice}`;
                  const areaAberta = areasAbertas.has(chaveDaArea);
                  return (
                    <section key={area.indice} className="flex flex-col">
                      <button
                        type="button"
                        aria-expanded={areaAberta}
                        onClick={() => alternar(setAreasAbertas, chaveDaArea)}
                        className="flex items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted/50"
                      >
                        {areaAberta ? <IconChevronDown className="size-4 shrink-0" aria-hidden="true" /> : <IconChevronRight className="size-4 shrink-0" aria-hidden="true" />}
                        {nomeDaArea(area.titulo)}
                        <span className="text-xs text-muted-foreground">{area.habilidades.length} habilidades</span>
                        {preenchido && <span className="ml-auto"><Contador valor={excecoesNaArea(estudante, area)} /></span>}
                      </button>

                      {areaAberta && (
                        <table className="mb-2 ml-6 w-[calc(100%-1.5rem)] text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="py-1 text-left font-normal">Habilidade</th>
                              {previa.etapas.map((etapa) => (
                                <th key={etapa} className="w-14 py-1 text-center font-normal">
                                  {ETAPAS_DA_FICHA[etapa - 1].replace(" ETAPA", "")}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {area.habilidades.map((habilidade) => {
                              const chave = chaveDaHabilidade(area.indice, habilidade.indice);
                              const linha = estudante.conceitos[chave];
                              return (
                                <tr key={chave} className="border-t">
                                  <td className="py-1 pr-2">{habilidade.numero} {habilidade.texto}</td>
                                  {previa.etapas.map((etapa) => {
                                    const conceito = linha?.[etapa - 1];
                                    return (
                                      <td key={etapa} className="py-1 text-center">
                                        {conceito && (
                                          <button
                                            type="button"
                                            disabled={disabled || !preenchido}
                                            onClick={() => clicar(estudante, chave, etapa)}
                                            aria-label={`${estudante.nome}, ${habilidade.numero} ${nomeDaArea(area.titulo)}, ${ETAPAS_DA_FICHA[etapa - 1]}: ${conceito}. Clique para mudar.`}
                                            className={cn("w-11 rounded-md py-1 font-semibold tabular-nums disabled:cursor-not-allowed", COR[conceito])}
                                          >
                                            {conceito}
                                          </button>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
