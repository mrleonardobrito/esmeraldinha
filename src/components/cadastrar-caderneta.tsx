import * as React from "react";
import { IconAlertTriangle, IconLoader } from "@tabler/icons-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cadastrarCadernetas,
  loadTurmas,
  type Caderneta,
  type TurmaRecusada,
} from "@/lib/cadernetas";
import { nomeCurtoDaTurma } from "@/lib/turmas";
import { cn } from "@/lib/utils";

type TurmasState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; turmas: string[] };

export interface CadastrarCadernetaProps {
  sessionId: string;
  professorId: string;
  /** As turmas que já viraram caderneta, para não oferecer duas vezes. */
  jaCadastradas: string[];
  onClose: () => void;
  onCadastrou: (cadernetas: Caderneta[]) => void;
}

export function CadastrarCaderneta({
  sessionId,
  professorId,
  jaCadastradas,
  onClose,
  onCadastrou,
}: CadastrarCadernetaProps) {
  const [turmasState, setTurmasState] = React.useState<TurmasState>({
    status: "loading",
  });
  const [selecionadas, setSelecionadas] = React.useState<string[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [recusadas, setRecusadas] = React.useState<TurmaRecusada[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    loadTurmas(sessionId)
      .then((turmas) => {
        if (!cancelled) setTurmasState({ status: "ready", turmas });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTurmasState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível ler as turmas do portal.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const disponiveis =
    turmasState.status === "ready"
      ? turmasState.turmas.filter((turma) => !jaCadastradas.includes(turma))
      : [];

  function alternar(turma: string) {
    setSelecionadas((atuais) =>
      atuais.includes(turma)
        ? atuais.filter((atual) => atual !== turma)
        : [...atuais, turma],
    );
  }

  function alternarTodas() {
    setSelecionadas((atuais) =>
      atuais.length === disponiveis.length ? [] : [...disponiveis],
    );
  }

  async function salvar() {
    if (selecionadas.length === 0) return;

    setSalvando(true);
    setErro(null);
    setRecusadas([]);

    try {
      const { cadernetas, recusadas: naoEntraram } = await cadastrarCadernetas({
        sessionId,
        professorId,
        // Na ordem em que o portal lista, não na ordem dos cliques.
        turmas: disponiveis.filter((turma) => selecionadas.includes(turma)),
      });

      toast.success(
        cadernetas.length === 1
          ? `Caderneta de ${nomeCurtoDaTurma(cadernetas[0].turma)} cadastrada.`
          : `${cadernetas.length} cadernetas cadastradas. A leitura do portal acontece uma turma de cada vez.`,
      );

      // As recusadas ficam à vista; fechar o sheet as esconderia.
      if (naoEntraram.length > 0) {
        setRecusadas(naoEntraram);
        setSelecionadas([]);
        onCadastrou(cadernetas);
        return;
      }

      onCadastrou(cadernetas);
      onClose();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar as cadernetas.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open onOpenChange={(aberto) => !aberto && !salvando && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">Nova caderneta</SheetTitle>
          <SheetDescription>
            Escolha as turmas. O sistema lê as aulas de cada uma no portal
            em segundo plano, uma turma de cada vez.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Turmas</Label>
              {disponiveis.length > 0 && (
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  role="status"
                >
                  {selecionadas.length} de {disponiveis.length}
                </span>
              )}
            </div>

            <Turmas
              state={turmasState}
              disponiveis={disponiveis}
              selecionadas={selecionadas}
              desabilitado={salvando}
              onAlternar={alternar}
              onAlternarTodas={alternarTodas}
            />
          </div>

          {recusadas.length > 0 && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
            >
              <div className="flex items-start gap-2">
                <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span className="font-medium">
                  {recusadas.length === 1
                    ? "Uma turma não entrou:"
                    : `${recusadas.length} turmas não entraram:`}
                </span>
              </div>
              <ul className="flex flex-col gap-1 pl-6 text-muted-foreground">
                {recusadas.map((recusada) => (
                  <li key={recusada.turma}>
                    <span className="font-medium text-foreground">
                      {nomeCurtoDaTurma(recusada.turma)}
                    </span>{" "}
                    — {recusada.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {erro && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            onClick={() => void salvar()}
            disabled={selecionadas.length === 0 || salvando}
          >
            {salvando && (
              <IconLoader className="animate-spin" data-icon="inline-start" />
            )}
            {salvando
              ? "Cadastrando…"
              : selecionadas.length > 1
                ? `Cadastrar ${selecionadas.length} cadernetas`
                : "Cadastrar"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            {recusadas.length > 0 ? "Fechar" : "Cancelar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Turmas({
  state,
  disponiveis,
  selecionadas,
  desabilitado,
  onAlternar,
  onAlternarTodas,
}: {
  state: TurmasState;
  disponiveis: string[];
  selecionadas: string[];
  desabilitado: boolean;
  onAlternar: (turma: string) => void;
  onAlternarTodas: () => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <IconLoader className="size-4 animate-spin" />
        Lendo as turmas no portal…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/30 bg-destructive/10 px-4 py-6 text-sm text-destructive">
        {state.message}
      </div>
    );
  }

  if (disponiveis.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
        Todas as turmas deste professor já têm caderneta.
      </div>
    );
  }

  const todas = selecionadas.length === disponiveis.length;

  return (
    <div className="flex flex-col gap-2">
      <label
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm font-medium transition-colors",
          desabilitado ? "opacity-50" : "cursor-pointer hover:bg-muted",
        )}
      >
        <Checkbox
          checked={
            todas ? true : selecionadas.length > 0 ? "indeterminate" : false
          }
          disabled={desabilitado}
          onCheckedChange={onAlternarTodas}
        />
        Todas as turmas
      </label>

      {disponiveis.map((turma) => {
        const marcada = selecionadas.includes(turma);

        return (
          <label
            key={turma}
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors",
              desabilitado ? "opacity-50" : "cursor-pointer hover:bg-muted",
              marcada && "border-primary ring-3 ring-primary/20",
            )}
          >
            <Checkbox
              checked={marcada}
              disabled={desabilitado}
              onCheckedChange={() => onAlternar(turma)}
            />
            {nomeCurtoDaTurma(turma)}
          </label>
        );
      })}
    </div>
  );
}
