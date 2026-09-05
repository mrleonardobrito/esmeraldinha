import * as React from "react";
import {
  IconActivity,
  IconAlertTriangle,
  IconBook,
  IconDotsVertical,
  IconListCheck,
  IconLoader,
  IconRefresh,
  IconTrash,
  IconUserCheck,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Caderneta, StatusDaParte } from "@/lib/cadernetas";
import { nomeCurtoDaTurma } from "@/lib/turmas";

/**
 * As quatro partes que a grade mostra por etapa. Só o conteúdo abre: as outras
 * ainda são trabalho manual no portal, e a grade diz isso sem esconder que elas
 * existem.
 */
const PARTES = [
  { chave: "conteudo", rotulo: "Aulas", nome: "Conteúdo", icone: IconBook },
  { chave: "frequencia", rotulo: "Frequencia", nome: "Frequência", icone: IconUserCheck },
  { chave: "boletim", rotulo: "Nota", nome: "Boletim", icone: IconListCheck },
  {
    chave: "ficha-desempenho",
    rotulo: "Desempenho/Descritivo",
    nome: "Ficha de desempenho",
    icone: IconActivity,
  },
] as const;

const STATUS_DOT: Record<StatusDaParte, string> = {
  pendente: "bg-muted-foreground/40",
  // O parcial precisa se distinguir do concluído a um relance: fica anelado,
  // enquanto o concluído é sólido.
  parcial: "bg-background ring-2 ring-inset ring-primary",
  processando: "bg-background ring-2 ring-inset ring-primary animate-pulse",
  concluido: "bg-primary",
};

/** O ícone do conteúdo acompanha o estado: apagado, normal, cheio. */
const STATUS_ICONE: Record<StatusDaParte, string> = {
  pendente: "text-primary/45",
  parcial: "text-primary",
  processando: "text-primary",
  concluido: "text-primary",
};

export interface GradeDeCadernetasProps {
  cadernetas: Caderneta[];
  /** A etapa cujo conteúdo está sendo enviado agora, se houver. */
  processando?: { cadernetaId: string; etapa: string } | null;
  onAbrirConteudo: (caderneta: Caderneta, etapa: string) => void;
  /** Relê a turma no portal: é o que "editar" significa para uma caderneta. */
  onAtualizar: (caderneta: Caderneta) => void;
  onExcluir: (caderneta: Caderneta) => void;
}

/**
 * A grade de turmas × etapas: uma linha por caderneta, uma coluna por etapa.
 * As colunas saem das etapas que as cadernetas têm, não de um número fixo —
 * quem decide quantas etapas existem é o calendário acadêmico, no portal.
 */
export function GradeDeCadernetas({
  cadernetas,
  processando,
  onAbrirConteudo,
  onAtualizar,
  onExcluir,
}: GradeDeCadernetasProps) {
  const etapas = React.useMemo(() => {
    const nomes = new Set<string>();
    for (const caderneta of cadernetas) {
      for (const etapa of caderneta.etapas) nomes.add(etapa.nome);
    }
    return [...nomes];
  }, [cadernetas]);

  return (
    <div className="flex flex-col gap-3">
      <Legenda />

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <Cabecalho etapas={etapas} />
          <tbody>
            {cadernetas.map((caderneta) => (
              <tr key={caderneta.id} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-4 py-3 text-left align-middle font-heading font-medium whitespace-nowrap"
                >
                  <span className="flex items-center gap-2">
                    {nomeCurtoDaTurma(caderneta.turma)}
                    <StatusDaRaspagem caderneta={caderneta} />
                  </span>
                </th>

                {etapas.map((nome) => {
                  const etapa = caderneta.etapas.find((atual) => atual.nome === nome);

                  return (
                    <td key={nome} className="px-4 py-3 align-middle">
                      {etapa ? (
                        <CelulaDaEtapa
                          caderneta={caderneta}
                          etapa={etapa}
                          processando={
                            processando?.cadernetaId === caderneta.id &&
                            processando.etapa === nome
                          }
                          onAbrirConteudo={onAbrirConteudo}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}

                <td className="px-4 py-3 align-middle">
                  <AcoesDaCaderneta
                    caderneta={caderneta}
                    onAtualizar={onAtualizar}
                    onExcluir={onExcluir}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A raspagem só aparece quando tem algo a dizer: uma caderneta sincronizada é
 * o caso normal, e um selo em toda linha seria ruído.
 */
function StatusDaRaspagem({ caderneta }: { caderneta: Caderneta }) {
  if (caderneta.syncStatus === "sincronizando" || caderneta.syncStatus === "pendente") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex text-muted-foreground">
            <IconLoader className="size-4 animate-spin" aria-hidden="true" />
            <span className="sr-only">Lendo o portal</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>A Esmeraldinha está lendo esta turma no portal.</TooltipContent>
      </Tooltip>
    );
  }

  if (caderneta.syncStatus === "falhou") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex text-destructive">
            <IconAlertTriangle className="size-4" aria-hidden="true" />
            <span className="sr-only">A leitura do portal falhou</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {caderneta.syncError ?? "A leitura do portal falhou."}
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

function AcoesDaCaderneta({
  caderneta,
  onAtualizar,
  onExcluir,
}: {
  caderneta: Caderneta;
  onAtualizar: GradeDeCadernetasProps["onAtualizar"];
  onExcluir: GradeDeCadernetasProps["onExcluir"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ações da caderneta de ${caderneta.turma}`}
        >
          <IconDotsVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => onAtualizar(caderneta)}
          disabled={caderneta.syncStatus === "sincronizando"}
        >
          <IconRefresh />
          Atualizar pelo portal
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onExcluir(caderneta)}>
          <IconTrash />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CelulaDaEtapa({
  caderneta,
  etapa,
  processando,
  onAbrirConteudo,
}: {
  caderneta: Caderneta;
  etapa: Caderneta["etapas"][number];
  processando: boolean;
  onAbrirConteudo: GradeDeCadernetasProps["onAbrirConteudo"];
}) {
  const semAulas = etapa.totalDeAulas === 0;
  const statusConteudo: StatusDaParte = processando ? "processando" : etapa.conteudo;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-colors",
        statusConteudo === "pendente" || semAulas
          ? "border-transparent"
          : "border-primary/30 bg-primary/5",
      )}
    >
      {PARTES.map(({ chave, nome, icone: Icone }) => {
        const conteudo = chave === "conteudo";
        const status: StatusDaParte = conteudo ? statusConteudo : "pendente";

        // Só o conteúdo é acionável, e só quando a etapa tem aulas.
        if (!conteudo || semAulas) {
          return (
            <Tooltip key={chave}>
              <TooltipTrigger asChild>
                <span className="relative inline-flex text-muted-foreground/35">
                  <Icone className="size-4.5" aria-hidden="true" />
                  <span className="sr-only">
                    {nome}: {semAulas && conteudo ? "sem aulas" : "pendente"}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {nome} —{" "}
                {semAulas && conteudo
                  ? "esta etapa não tem aulas para a turma"
                  : "ainda preenchido à mão no portal"}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Tooltip key={chave}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onAbrirConteudo(caderneta, etapa.nome)}
                aria-label={`Lançar conteúdo de ${caderneta.turma}, ${etapa.nome}`}
                className={cn(
                  "relative inline-flex rounded-md transition-opacity hover:opacity-70 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
                  STATUS_ICONE[status],
                )}
              >
                <Icone className="size-4.5" aria-hidden="true" />
                <span
                  className={cn(
                    "absolute -top-1 -right-1 size-2 rounded-full",
                    STATUS_DOT[status],
                  )}
                  aria-hidden="true"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {nome} — {etapa.aulasPreenchidas} de {etapa.totalDeAulas} aula(s)
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Enquanto o portal não responde, a grade mostra a própria forma em vez de
 * sumir: o mesmo cabeçalho, o mesmo número de colunas, linhas em cinza.
 */
export function GradeDeCadernetasSkeleton({
  linhas = 3,
  etapas = ["I ETAPA", "II ETAPA", "III ETAPA", "IV ETAPA"],
}: {
  linhas?: number;
  etapas?: string[];
}) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Legenda />

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <Cabecalho etapas={etapas} />
          <tbody>
            {Array.from({ length: linhas }, (_, linha) => (
              <tr key={linha} className="border-b last:border-b-0">
                <td className="px-4 py-3 align-middle">
                  <Skeleton className="h-4 w-32 rounded-md" />
                </td>
                {etapas.map((etapa) => (
                  <td key={etapa} className="px-4 py-3 align-middle">
                    <Skeleton className="h-8 w-36 rounded-xl" />
                  </td>
                ))}
                <td className="px-4 py-3 align-middle">
                  <Skeleton className="size-7 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cabecalho({ etapas }: { etapas: string[] }) {
  return (
    <thead>
      <tr className="border-b bg-muted/40">
        <th className="px-4 py-3 text-left font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Turma
        </th>
        {etapas.map((etapa) => (
          <th
            key={etapa}
            className="px-4 py-3 text-left font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {etapa}
          </th>
        ))}
        <th className="w-10 px-4 py-3">
          <span className="sr-only">Ações</span>
        </th>
      </tr>
    </thead>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        {(
          [
            ["pendente", "Pendente"],
            ["parcial", "Em andamento"],
            ["concluido", "Concluído"],
          ] as const
        ).map(([status, rotulo]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
            {rotulo}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3 sm:ml-auto">
        {PARTES.map(({ chave, rotulo, icone: Icone }) => (
          <span key={chave} className="flex items-center gap-1.5">
            <Icone className="size-4" aria-hidden="true" />
            {rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}
