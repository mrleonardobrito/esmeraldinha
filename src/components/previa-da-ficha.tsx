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

/**
 * The prévia, estudante by estudante: the turma on the left, the chosen
 * estudante's whole ficha on the right, área by área, one column per etapa.
 * A click on a cell moves its conceito R → RD → NR, keeping the row from
 * decreasing across etapas.
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
  const primeiro = previa.estudantes.find((e) => ativo(e.situacao)) ?? previa.estudantes[0];
  const [selecionada, setSelecionada] = React.useState(primeiro?.matricula ?? "");
  const [fechadas, setFechadas] = React.useState<Set<number>>(() => new Set());
  const estudante = previa.estudantes.find((e) => e.matricula === selecionada) ?? primeiro;
  const areasDaPrevia = areas.filter((area) => previa.areas.includes(area.indice));

  function clicar(chave: string, etapa: IndiceDaEtapa) {
    if (!estudante) return;
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
    <div className={cn("flex min-h-[24rem] gap-3 rounded-xl border", className)}>
      <ul className="flex w-56 shrink-0 flex-col overflow-y-auto border-r p-1.5" aria-label="Estudantes da turma">
        {previa.estudantes.map((e) => {
          const excecoes = contarExcecoes(e.conceitos);
          return (
            <li key={e.matricula}>
              <button
                type="button"
                onClick={() => setSelecionada(e.matricula)}
                aria-pressed={e.matricula === estudante?.matricula}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                  e.matricula === estudante?.matricula && "bg-primary/10 font-medium",
                  !ativo(e.situacao) && "text-muted-foreground",
                )}
              >
                <span className="truncate">{e.nome}</span>
                {ativo(e.situacao) ? (
                  <span className={cn("rounded px-1.5 tabular-nums", excecoes > 0 ? COR.RD : "bg-muted text-muted-foreground")}>
                    {excecoes}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px]">não será preenchido</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {estudante && (
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto py-2 pr-3">
          <div>
            <p className="text-sm font-medium">{estudante.nome}</p>
            {!ativo(estudante.situacao) && (
              <p className="text-xs text-muted-foreground">Situação {estudante.situacao}: a ficha deste estudante não será preenchida.</p>
            )}
            {estudante.trechos.map((trecho) => (
              <p key={trecho} className="text-xs text-muted-foreground">“{trecho}”</p>
            ))}
          </div>

          {areasDaPrevia.map((area) => {
            const fechada = fechadas.has(area.indice);
            return (
              <section key={area.indice} className="flex flex-col gap-1">
                <button
                  type="button"
                  className="flex items-center gap-1 text-left text-sm font-medium"
                  aria-expanded={!fechada}
                  onClick={() => setFechadas((atuais) => {
                    const novas = new Set(atuais);
                    if (fechada) novas.delete(area.indice); else novas.add(area.indice);
                    return novas;
                  })}
                >
                  {fechada ? <IconChevronRight className="size-4" aria-hidden="true" /> : <IconChevronDown className="size-4" aria-hidden="true" />}
                  {nomeDaArea(area.titulo)}
                  <span className="text-xs font-normal text-muted-foreground">
                    {area.habilidades.length} habilidades
                  </span>
                </button>
                {!fechada && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 text-left font-normal">Habilidade</th>
                        {previa.etapas.map((etapa) => (
                          <th key={etapa} className="w-14 py-1 text-center font-normal">{ETAPAS_DA_FICHA[etapa - 1].replace(" ETAPA", "")}</th>
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
                                      disabled={disabled || !ativo(estudante.situacao)}
                                      onClick={() => clicar(chave, etapa)}
                                      aria-label={`${habilidade.numero} ${nomeDaArea(area.titulo)}, ${ETAPAS_DA_FICHA[etapa - 1]}: ${conceito}. Clique para mudar.`}
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
    </div>
  );
}
