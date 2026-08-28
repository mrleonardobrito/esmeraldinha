import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconLoader,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
} from "@tabler/icons-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { ProfessorPicker } from "@/components/professor-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  closePortalSession,
  openPortalSession,
  type PortalSession,
} from "@/lib/portal-session";
import {
  loadProfessores,
  maskCpf,
  type Professor,
} from "@/lib/professores";

type Status = "idle" | "connecting" | "connected" | "error";

export function Cadernetas() {
  const [professores] = React.useState<Professor[]>(() => loadProfessores());
  const [selected, setSelected] = React.useState<Professor | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [session, setSession] = React.useState<PortalSession | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  /**
   * A conexão parte do clique, não de um efeito: com StrictMode um efeito
   * rodaria duas vezes em dev e abriria duas sessões no portal.
   */
  async function connect(professor: Professor) {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      const opened = await openPortalSession(professor);
      setSession(opened);
      setStatus("connected");
      toast.success(`Conectado ao portal como ${professor.nome}.`);
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar ao portal.",
      );
    }
  }

  function selectProfessor(professor: Professor) {
    setSelected(professor);
    void connect(professor);
  }

  function backToPicker() {
    if (session) void closePortalSession(session.sessionId);
    setSelected(null);
    setSession(null);
    setErrorMessage(null);
    setStatus("idle");
  }

  async function disconnect() {
    if (!session) return;

    await closePortalSession(session.sessionId);
    setSession(null);
    setStatus("idle");
    setErrorMessage(null);
    toast.success("Sessão encerrada.");
  }

  if (professores.length === 0) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Cadernetas</CardTitle>
            <CardDescription>
              Escolha o professor para abrir uma sessão no portal com o login
              dele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
              <IconBook2 className="size-8 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  Nenhum professor cadastrado
                </p>
                <p className="text-sm text-muted-foreground">
                  É preciso cadastrar um professor antes de acessar as
                  cadernetas.
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/professores">Ir para Professores</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!selected) {
    return (
      <Shell>
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-lg font-medium">
            Selecione um professor
          </h1>
          <ProfessorPicker professores={professores} onSelect={selectProfessor} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={backToPicker}
              aria-label="Trocar de professor"
            >
              <IconArrowLeft />
            </Button>
            <div className="flex flex-col">
              <h1 className="font-heading text-lg font-medium">
                {selected.nome}
              </h1>
              <p className="text-sm text-muted-foreground">
                <span className="tabular-nums">
                  Login: {maskCpf(selected.login)}
                </span>
                <span aria-hidden="true"> • </span>
                {selected.escola}
              </p>
            </div>
          </div>

          <ConnectionStatus
            status={status}
            onRetry={() => void connect(selected)}
            onDisconnect={() => void disconnect()}
          />
        </div>

        {status === "error" && errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ConnectionStatus({
  status,
  onRetry,
  onDisconnect,
}: {
  status: Status;
  onRetry: () => void;
  onDisconnect: () => void;
}) {
  if (status === "connecting") {
    return (
      <Badge variant="outline" className="h-8 gap-1.5 px-3">
        <IconLoader className="animate-spin" />
        Conectando…
      </Badge>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-8 gap-1.5 px-3">
          <IconPlugConnected className="text-primary" />
          Conectado
        </Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDisconnect}
          aria-label="Encerrar sessão"
        >
          <IconPlugConnectedX />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" onClick={onRetry}>
      <IconRefresh data-icon="inline-start" />
      Conectar ao portal
    </Button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-full flex-1 bg-zinc-50 p-4 font-sans lg:p-6 dark:bg-black">
      {children}
    </div>
  );
}
