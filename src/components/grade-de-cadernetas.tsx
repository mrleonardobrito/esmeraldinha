import * as React from "react";
import {
  IconActivity,
  IconAlertTriangle,
  IconBook,
  IconChevronDown,
  IconDotsVertical,
  IconListCheck,
  IconLoader,
  IconRefresh,
  IconPencil,
  IconTrash,
  IconUserCheck,
} from "@tabler/icons-react";

import { useConta } from "@/components/conta-provider";
import { EditarValoresDaCaderneta } from "@/components/editar-valores-da-caderneta";
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
import { loadAulasDaEtapa, type AulaDaCaderneta, type Caderneta, type StatusDaParte } from "@/lib/cadernetas";
import { nomeCurtoDaTurma } from "@/lib/turmas";

/** Uma das partes da caderneta, como a grade a mostra em cada etapa. */
interface ParteDaGrade {
  chave: string;
  rotulo: string;
  nome: string;
  icone: typeof IconBook;
  disabled?: boolean;
}

/**
 * As quatro partes que a grade mostra por etapa. Conteúdo e boletim abrem; as
 * marcadas com `disabled` ainda são trabalho manual no portal, e a grade diz
 * isso sem esconder que elas existem.
 */
const PARTES: readonly ParteDaGrade[] = [
  { chave: "conteudo", rotulo: "Aulas", nome: "Conteúdo", icone: IconBook },
  { chave: "boletim", rotulo: "Boletim", nome: "Boletim", icone: IconListCheck },
  {
    chave: "frequencia",
    rotulo: "Frequencia",
    nome: "Frequência",
    icone: IconUserCheck,
    disabled: true,
  },
  {
    chave: "ficha-desempenho",
    rotulo: "Desempenho/Descritivo",
    nome: "Ficha de desempenho",
    icone: IconActivity,
    disabled: true,
  },
];

const STATUS_DOT: Record<StatusDaParte, string> = {
  pendente: "bg-red-500",
  parcial: "bg-yellow-500",
  processando: "bg-yellow-500 animate-pulse",
  concluido: "bg-green-500",
};

/**
 * As partes que já funcionam ficam na cor cheia em qualquer estado: quem
 * distingue pendente de concluído é o ponto, não a intensidade do ícone.
 * Apagar o ícone por opacidade some com ele no tema escuro, então a cor não
 * varia — varia o ponto.
 */
const STATUS_ICONE: Record<StatusDaParte, string> = {
  pendente: "text-caderneta-parte",
  parcial: "text-caderneta-parte",
  processando: "text-caderneta-parte",
  concluido: "text-caderneta-parte",
};

/**
 * As partes que ainda não existem ficam neutras de propósito: a cor separa o
 * que a Esmeraldinha já preenche do que continua sendo trabalho manual no
 * portal, antes mesmo de o auxiliar passar o mouse pelo ícone.
 */
const ICONE_INDISPONIVEL = "text-caderneta-parte-futura";

export interface GradeDeCadernetasProps {
  cadernetas: Caderneta[];
  /** A etapa cujo conteúdo está sendo enviado agora, se houver. */
  processando?: { cadernetaId: string; etapa: string } | null;
  onAbrirConteudo: (caderneta: Caderneta, etapa: string) => void;
  onAbrirBoletim: (caderneta: Caderneta, etapa: string) => void;
  /** Relê a turma no portal: é o que "editar" significa para uma caderneta. */
  onAtualizar: (caderneta: Caderneta) => void;
  onExcluir: (caderneta: Caderneta) => void;
  onValoresSalvos?: (caderneta: Caderneta) => void;
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
  onAbrirBoletim,
  onAtualizar,
  onExcluir,
  onValoresSalvos,
}: GradeDeCadernetasProps) {
  const { conta } = useConta();
  const showValores = conta?.papel === "auxiliar de ensino";
  const [editedCaderneta, setEditedCaderneta] = React.useState<Caderneta | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
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
          <Cabecalho etapas={etapas} showValores={showValores} />
          <tbody>
            {cadernetas.map((caderneta) => (
              <React.Fragment key={caderneta.id}>
              <tr className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-4 py-3 text-left align-middle font-heading font-medium whitespace-nowrap"
                >
                  <span className="flex items-center gap-2">
                    <button type="button" aria-expanded={expanded.has(caderneta.id)}
                      aria-label={`${expanded.has(caderneta.id) ? "Recolher" : "Expandir"} detalhes de ${nomeCurtoDaTurma(caderneta.turma)}`}
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(caderneta.id)) next.delete(caderneta.id);
                        else next.add(caderneta.id);
                        return next;
                      })}
                      className="inline-flex items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <IconChevronDown className={cn("size-4 shrink-0 transition-transform", expanded.has(caderneta.id) && "rotate-180")} aria-hidden="true" />
                      {nomeCurtoDaTurma(caderneta.turma)}
                    </button>
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
                          onAbrirBoletim={onAbrirBoletim}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}

                {showValores && <td className="px-4 py-3 align-middle text-sm tabular-nums">
                  <span className="whitespace-nowrap">{formatMoney(caderneta.valorRecebido)}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="whitespace-nowrap">{formatMoney(caderneta.valorAReceber)}</span>
                </td>}
                <td className="px-4 py-3 align-middle">
                  <AcoesDaCaderneta
                    caderneta={caderneta}
                    onAtualizar={onAtualizar}
                    onExcluir={onExcluir}
                    onEditarValores={showValores && onValoresSalvos ? () => setEditedCaderneta(caderneta) : undefined}
                  />
                </td>
              </tr>
              {expanded.has(caderneta.id) && (
                <tr className="border-b last:border-b-0">
                  <td colSpan={etapas.length + (showValores ? 3 : 2)} className="bg-muted/20">
                    <DetalhesDaCaderneta caderneta={caderneta} processando={processando?.cadernetaId === caderneta.id} onAbrirConteudo={onAbrirConteudo} onAbrirBoletim={onAbrirBoletim} />
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {showValores && editedCaderneta && onValoresSalvos && <EditarValoresDaCaderneta key={editedCaderneta.id} caderneta={editedCaderneta} onClose={() => setEditedCaderneta(null)} onSaved={onValoresSalvos} />}
    </div>
  );
}

function formatMoney(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DetalhesDaCaderneta({ caderneta, processando, onAbrirConteudo, onAbrirBoletim }: {
  caderneta: Caderneta;
  processando: boolean;
  onAbrirConteudo: GradeDeCadernetasProps["onAbrirConteudo"];
  onAbrirBoletim: GradeDeCadernetasProps["onAbrirBoletim"];
}) {
  const [aulas, setAulas] = React.useState<AulaDaCaderneta[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    Promise.all(caderneta.etapas.map((etapa) => loadAulasDaEtapa(caderneta.id, etapa.nome)))
      .then((groups) => { if (active) setAulas(groups.flat()); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [caderneta.id, caderneta.etapas, caderneta.syncedAt]);

  const totalAulas = caderneta.etapas.reduce((sum, etapa) => sum + etapa.totalDeAulas, 0);
  const aulasPreenchidas = caderneta.etapas.reduce((sum, etapa) => sum + etapa.aulasPreenchidas, 0);
  const totalNotas = caderneta.etapas.reduce((sum, etapa) => sum + etapa.totalDeNotas, 0);
  const notasLancadas = caderneta.etapas.reduce((sum, etapa) => sum + etapa.notasLancadas, 0);
  const latest = aulas?.filter((aula) => aula.conteudoPreenchido).sort((a, b) => dateKey(b.data).localeCompare(dateKey(a.data)))[0];
  const status = (done: number, total: number): StatusDaParte => total > 0 && done >= total ? "concluido" : done > 0 ? "parcial" : "pendente";
  const rows: { nome: string; status?: StatusDaParte; badges: string[]; action?: "conteudo" | "boletim" }[] = [
    { nome: "Conteúdo", action: "conteudo", status: processando ? "processando" : status(aulasPreenchidas, totalAulas), badges: [
      `${aulasPreenchidas} de ${totalAulas} aulas preenchidas`,
      ...(latest ? [`Última aula: ${latest.data}`, latest.etapa] : failed ? ["Última aula indisponível"] : aulas === null ? ["Buscando última aula…"] : []),
    ] },
    { nome: "Boletim", action: "boletim", status: status(notasLancadas, totalNotas), badges: [
      totalNotas ? `${notasLancadas} de ${totalNotas} notas lançadas` : "Nenhuma avaliação cadastrada",
      `${caderneta.etapas.filter((etapa) => etapa.totalDeNotas > 0 && etapa.notasLancadas >= etapa.totalDeNotas).length} de ${caderneta.etapas.length} etapas concluídas`,
    ] },
    { nome: "Frequência", badges: ["Acompanhamento em breve"] },
    { nome: "Ficha de desempenho e ficha descritiva", badges: ["Acompanhamento em breve"] },
  ];
  const labels: Record<StatusDaParte, string> = { pendente: "Pendente", parcial: "Em andamento", processando: "Processando", concluido: "Concluído" };
  return (
    <ul className="divide-y">
      {rows.map((row) => {
        const etapasDisponiveis = caderneta.etapas.filter((etapa) =>
          row.action === "conteudo" ? etapa.totalDeAulas > 0 : row.action === "boletim" && etapa.totalDeNotas > 0,
        );
        const content = (
          <>
            <span className={cn("size-2.5 shrink-0 rounded-full", row.status ? STATUS_DOT[row.status] : "bg-muted-foreground/30")} aria-hidden="true" />
            <span className="min-w-40 font-medium">{row.nome}</span>
            <span className="text-xs text-muted-foreground">{row.status ? labels[row.status] : "Não acompanhado"}</span>
            <span className="flex flex-wrap gap-1.5 sm:ml-auto">
              {row.badges.map((badge) => <span key={badge} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{badge}</span>)}
            </span>
          </>
        );
        const rowClass = "flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left text-sm";
        return (
          <li key={row.nome}>
            {row.action && etapasDisponiveis.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={cn(rowClass, "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring")} aria-label={`Abrir ${row.nome}: escolher etapa`}>
                    {content}
                    <IconChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {etapasDisponiveis.map((etapa) => (
                    <DropdownMenuItem key={etapa.nome} onSelect={() => {
                      if (row.action === "conteudo") onAbrirConteudo(caderneta, etapa.nome);
                      else onAbrirBoletim(caderneta, etapa.nome);
                    }}>
                      {etapa.nome}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : <div className={rowClass}>{content}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function dateKey(data: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(data);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : data;
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
        <TooltipContent>O sistema está lendo esta turma no portal.</TooltipContent>
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
  onEditarValores,
}: {
  caderneta: Caderneta;
  onAtualizar: GradeDeCadernetasProps["onAtualizar"];
  onExcluir: GradeDeCadernetasProps["onExcluir"];
  onEditarValores?: () => void;
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
        {onEditarValores && <DropdownMenuItem onSelect={onEditarValores}><IconPencil />Editar valores</DropdownMenuItem>}
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
  onAbrirBoletim,
}: {
  caderneta: Caderneta;
  etapa: Caderneta["etapas"][number];
  processando: boolean;
  onAbrirConteudo: GradeDeCadernetasProps["onAbrirConteudo"];
  onAbrirBoletim: GradeDeCadernetasProps["onAbrirBoletim"];
}) {
  const semAulas = etapa.totalDeAulas === 0;
  const statusConteudo: StatusDaParte = processando ? "processando" : etapa.conteudo;

  return (
    <div className="inline-flex items-center gap-2.5">
      {PARTES.map(({ chave, nome, icone: Icone, disabled }) => {
        const conteudo = chave === "conteudo";
        const boletim = chave === "boletim";
        const semNotas = etapa.totalDeNotas === 0;
        // Uma etapa sem aula não tem conteúdo a lançar; uma sem avaliação
        // cadastrada não tem boletim a lançar — as avaliações nascem no
        // portal, então até lá o botão fica inabilitado.
        const vazia = (conteudo && semAulas) || (boletim && semNotas);
        const acionavel = !disabled && !vazia;

        if (!acionavel) {
          return (
            <Tooltip key={chave}>
              <TooltipTrigger asChild>
                <span
                  aria-disabled="true"
                  className={cn(
                    "relative inline-flex cursor-not-allowed",
                    // Uma etapa sem aula é um conteúdo que existe e está vazio:
                    // continua verde, apenas apagado. O que ainda não existe é
                    // que fica neutro.
                    disabled
                      ? ICONE_INDISPONIVEL
                      : "text-caderneta-parte-vazia",
                  )}
                >
                  <Icone className="size-4.5" aria-hidden="true" />
                  <span className="sr-only">
                    {nome}: {vazia ? "sem lançamentos" : "indisponível"}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {nome} —{" "}
                {conteudo && vazia
                  ? "esta etapa não tem aulas para a turma"
                  : boletim && vazia
                    ? "esta etapa não tem avaliação cadastrada no portal"
                    : "ainda preenchido à mão no portal"}
              </TooltipContent>
            </Tooltip>
          );
        }

        const status: StatusDaParte = conteudo
          ? statusConteudo
          : etapa.boletim;

        return (
          <Tooltip key={chave}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  conteudo
                    ? onAbrirConteudo(caderneta, etapa.nome)
                    : onAbrirBoletim(caderneta, etapa.nome)
                }
                aria-label={
                  conteudo
                    ? `Lançar conteúdo de ${caderneta.turma}, ${etapa.nome}`
                    : `Lançar notas de ${caderneta.turma}, ${etapa.nome}`
                }
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
              {conteudo
                ? `${nome} — ${etapa.aulasPreenchidas} de ${etapa.totalDeAulas} aula(s)`
                : `${nome} — ${etapa.notasLancadas} de ${etapa.totalDeNotas} nota(s)`}
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
  const { conta } = useConta();
  const showValores = conta?.papel === "auxiliar de ensino";
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Legenda />

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <Cabecalho etapas={etapas} showValores={showValores} />
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
                {showValores && <td className="px-4 py-3 align-middle"><Skeleton className="h-4 w-32 rounded-md" /></td>}
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

function Cabecalho({ etapas, showValores }: { etapas: string[]; showValores: boolean }) {
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
        {showValores && <th className="px-4 py-3 text-left font-heading text-xs font-semibold text-muted-foreground uppercase">
          Valores (R$)
        </th>}
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
        {PARTES.map(({ chave, rotulo, icone: Icone, disabled }) => (
          <span
            key={chave}
            className={cn(
              "flex items-center gap-1.5",
              disabled && "text-muted-foreground/60",
            )}
            title={disabled ? `${rotulo} — em breve` : undefined}
          >
            <Icone
              className={cn(
                "size-4",
                disabled ? ICONE_INDISPONIVEL : "text-caderneta-parte",
              )}
              aria-hidden="true"
            />
            {rotulo}
            {disabled && (
              <span className="text-[10px] tracking-wide uppercase opacity-70">
                em breve
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
