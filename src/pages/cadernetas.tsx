import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBook2,
  IconPlugConnected,
  IconPlugConnectedX,
  IconPlus,
  IconRefresh,
  IconSparkles,
} from "@tabler/icons-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { AnalisarDocumentos } from "@/components/analisar-documentos";
import { CadastrarCaderneta } from "@/components/cadastrar-caderneta";
import { ExcluirCaderneta } from "@/components/excluir-caderneta";
import {
  GradeDeCadernetas,
  GradeDeCadernetasSkeleton,
} from "@/components/grade-de-cadernetas";
import { LancarConteudo } from "@/components/lancar-conteudo";
import { LancarNotas } from "@/components/lancar-notas";
import {
  ProfessorPicker,
  ProfessorPickerSkeleton,
} from "@/components/professor-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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
import {
  loadCadernetas,
  sincronizarCaderneta,
  type Caderneta,
} from "@/lib/cadernetas";
import {
  esquecerSessaoDeTrabalho,
  guardarSessaoDeTrabalho,
  lerSessaoDeTrabalho,
} from "@/lib/sessao-de-trabalho";

type Status = "idle" | "connecting" | "connected" | "error";

type ProfessoresState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; professores: Professor[] };

export function Cadernetas() {
  // Voltar para esta tela deve cair onde se estava, não no começo: o que a
  // visita anterior deixou em aberto é o estado inicial desta.
  const retomada = React.useMemo(() => lerSessaoDeTrabalho(), []);

  const [professoresState, setProfessoresState] =
    React.useState<ProfessoresState>({ status: "loading" });
  const [selected, setSelected] = React.useState<Professor | null>(
    retomada?.professor ?? null,
  );
  const [status, setStatus] = React.useState<Status>(
    retomada?.session ? "connected" : "idle",
  );
  const [session, setSession] = React.useState<PortalSession | null>(
    retomada?.session ?? null,
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [cadernetas, setCadernetas] = React.useState<Caderneta[]>(
    retomada?.cadernetas ?? [],
  );
  const [cadernetasToken, setCadernetasToken] = React.useState(0);
  /** Falso só depois da primeira leitura: antes dela a grade é um esqueleto. */
  const [carregandoCadernetas, setCarregandoCadernetas] = React.useState(
    retomada === null,
  );
  const [cadastrando, setCadastrando] = React.useState(false);
  const [analisando, setAnalisando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState<Caderneta | null>(null);
  const [lancando, setLancando] = React.useState<{
    caderneta: Caderneta;
    etapa: string;
  } | null>(null);
  const [lancandoNotas, setLancandoNotas] = React.useState<{
    caderneta: Caderneta;
    etapa: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    loadProfessores()
      .then((professores) => {
        if (cancelled) return;
        setProfessoresState({ status: "ready", professores });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProfessoresState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os professores.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // O que a próxima visita retoma. Fica fora do React porque precisa
  // sobreviver ao desmonte que a troca de página provoca.
  React.useEffect(() => {
    if (!selected) return;
    guardarSessaoDeTrabalho({ professor: selected, session, cadernetas });
  }, [selected, session, cadernetas]);

  /** Sobe a cada envio gravado, para a grade refletir o portal. */
  const recarregarCadernetas = React.useCallback(() => {
    setCadernetasToken((atual) => atual + 1);
  }, []);

  React.useEffect(() => {
    const professorId = selected?.id;
    if (!professorId) return;

    let cancelled = false;

    loadCadernetas(professorId)
      .then((carregadas) => {
        if (!cancelled) setCadernetas(carregadas);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as cadernetas.",
        );
      })
      .finally(() => {
        if (!cancelled) setCarregandoCadernetas(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected?.id, cadernetasToken]);

  /**
   * A raspagem roda no servidor, em segundo plano, e não tem como avisar a
   * tela quando termina. Enquanto alguma caderneta estiver sincronizando, a
   * grade se recarrega sozinha; quando nenhuma estiver, o efeito para.
   */
  const sincronizando = cadernetas.some(
    (caderneta) => caderneta.syncStatus === "sincronizando",
  );

  React.useEffect(() => {
    if (!sincronizando) return;

    const timer = setTimeout(recarregarCadernetas, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [sincronizando, cadernetasToken, recarregarCadernetas]);

  function retryFetchProfessores() {
    setProfessoresState({ status: "loading" });
    setReloadToken((current) => current + 1);
  }

  /**
   * A conexão parte do clique, não de um efeito: com StrictMode um efeito
   * rodaria duas vezes em dev e abriria duas sessões no portal.
   */
  async function connect(professor: Professor) {
    setStatus("connecting");
    setErrorMessage(null);

    try {
      const opened = await openPortalSession(professor.id);
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

  /**
   * A sessão sumiu do servidor sem a tela saber — um restart do processo em
   * dev é o caso comum, mas ociosidade de verdade também some assim. Não há
   * o que recuperar dela no id velho, mas a tela não pode ficar sem `session`
   * nem por um instante: é ele que mantém o modal de envio montado, com o
   * texto e os anexos que o auxiliar de ensino já tinha preenchido — zerar
   * primeiro descartaria tudo isso antes da sessão nova chegar.
   */
  async function reabrirSessao() {
    if (!selected) return;

    try {
      const reaberta = await openPortalSession(selected.id);
      setSession(reaberta);
      toast.info("A sessão com o portal caiu; reconectado automaticamente.");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "A sessão com o portal caiu, e não foi possível abrir outra.",
      );
    }
  }

  /**
   * O que há para editar numa caderneta é o que o portal diz sobre ela: turma,
   * aulas e estudantes vêm todos de lá, e nenhum é nosso para reescrever.
   * Atualizar é reler — a raspagem roda em segundo plano e a grade acompanha.
   */
  async function atualizarCaderneta(caderneta: Caderneta) {
    if (!session) return;

    try {
      const atualizada = await sincronizarCaderneta(
        caderneta.id,
        session.sessionId,
      );
      setCadernetas((atuais) =>
        atuais.map((atual) => (atual.id === atualizada.id ? atualizada : atual)),
      );
      toast.success(`Relendo ${caderneta.turma} no portal…`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reler a caderneta no portal.",
      );
    }
  }

  function selectProfessor(professor: Professor) {
    setCarregandoCadernetas(true);
    setSelected(professor);
    void connect(professor);
  }

  function backToPicker() {
    if (session) void closePortalSession(session.sessionId);
    esquecerSessaoDeTrabalho();
    setSelected(null);
    setSession(null);
    setErrorMessage(null);
    setStatus("idle");
    setLancando(null);
    setLancandoNotas(null);
    setCadastrando(false);
    setAnalisando(false);
    setExcluindo(null);
    setCadernetas([]);
    setCarregandoCadernetas(true);
  }

  async function disconnect() {
    if (!session) return;

    await closePortalSession(session.sessionId);
    setSession(null);
    setStatus("idle");
    setErrorMessage(null);
    toast.success("Sessão encerrada.");
  }

  if (professoresState.status === "loading") {
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
            <ProfessorPickerSkeleton />
            <span className="sr-only" role="status">
              Carregando professores…
            </span>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (professoresState.status === "error") {
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
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/10 px-6 py-12 text-center">
              <IconAlertTriangle className="size-8 text-destructive" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-destructive">
                  Não foi possível carregar os professores
                </p>
                <p className="text-sm text-muted-foreground">
                  {professoresState.message}
                </p>
              </div>
              <Button variant="outline" onClick={retryFetchProfessores}>
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const professores = professoresState.professores;

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
        <Card>
          <CardHeader>
            <CardTitle>Selecione um professor</CardTitle>
            <CardDescription>
              A sessão no portal é aberta com o login do professor escolhido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfessorPicker
              professores={professores}
              onSelect={selectProfessor}
            />
          </CardContent>
        </Card>
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

        {status === "connecting" && <ConectandoAoPortal nome={selected.nome} />}

        {status === "connected" && session && (
          <>
            <Card>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <CardTitle>Cadernetas</CardTitle>
                  <CardDescription>
                    Uma linha por turma, uma coluna por etapa do ano letivo.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setAnalisando(true)}>
                    <IconSparkles data-icon="inline-start" />
                    Upload Inteligente
                  </Button>
                  <Button onClick={() => setCadastrando(true)}>
                    <IconPlus data-icon="inline-start" />
                    Nova caderneta
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {carregandoCadernetas ? (
                  <GradeDeCadernetasSkeleton />
                ) : cadernetas.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
                    <IconBook2 className="size-8 text-muted-foreground" />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        Nenhuma caderneta ainda
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Cadastre a caderneta de uma turma para o sistema
                        ler as aulas dela no portal.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setCadastrando(true)}>
                      <IconPlus data-icon="inline-start" />
                      Nova caderneta
                    </Button>
                  </div>
                ) : (
                  <GradeDeCadernetas
                    cadernetas={cadernetas}
                    onAbrirConteudo={(caderneta, etapa) =>
                      setLancando({ caderneta, etapa })
                    }
                    onAbrirBoletim={(caderneta, etapa) =>
                      setLancandoNotas({ caderneta, etapa })
                    }
                    onAtualizar={(caderneta) => void atualizarCaderneta(caderneta)}
                    onExcluir={setExcluindo}
                  />
                )}
              </CardContent>
            </Card>

            {analisando && (
              <AnalisarDocumentos
                sessionId={session.sessionId}
                professorId={selected.id}
                onClose={() => setAnalisando(false)}
                onGravou={recarregarCadernetas}
                onSessaoExpirada={() => void reabrirSessao()}
              />
            )}

            {excluindo && (
              <ExcluirCaderneta
                caderneta={excluindo}
                onClose={() => setExcluindo(null)}
                onExcluiu={(caderneta) => {
                  setCadernetas((atuais) =>
                    atuais.filter((atual) => atual.id !== caderneta.id),
                  );
                  setExcluindo(null);
                  toast.success(`Caderneta de ${caderneta.turma} excluída.`);
                }}
              />
            )}

            {cadastrando && (
              <CadastrarCaderneta
                sessionId={session.sessionId}
                professorId={selected.id}
                jaCadastradas={cadernetas.map((caderneta) => caderneta.turma)}
                onClose={() => setCadastrando(false)}
                onCadastrou={(novas) => {
                  setCadernetas((atuais) => [...atuais, ...novas]);
                }}
              />
            )}

            {lancando && (
              <LancarConteudo
                caderneta={lancando.caderneta}
                etapa={lancando.etapa}
                sessionId={session.sessionId}
                onClose={() => setLancando(null)}
                onGravou={recarregarCadernetas}
              />
            )}

            {lancandoNotas && (
              <LancarNotas
                caderneta={lancandoNotas.caderneta}
                etapa={lancandoNotas.etapa}
                sessionId={session.sessionId}
                onClose={() => setLancandoNotas(null)}
                onGravou={recarregarCadernetas}
              />
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

/**
 * O portal demora para responder ao login, então a espera mostra o que vem
 * depois — o cabeçalho e a grade em cinza — em vez de uma tela vazia.
 */
function ConectandoAoPortal({ nome }: { nome: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PulsoDeConexao />
          <div className="flex flex-col gap-0.5">
            <CardTitle>Abrindo a sessão no portal…</CardTitle>
            <CardDescription>
              Sistema entrando com o login de {nome}.
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
          <Skeleton className="h-8 w-44 rounded-2xl" />
          <Skeleton className="h-8 w-36 rounded-2xl" />
        </div>
      </CardHeader>

      <CardContent>
        <GradeDeCadernetasSkeleton />
      </CardContent>
    </Card>
  );
}

/** Um ponto que respira, com um anel que sai dele: a sessão está sendo aberta. */
function PulsoDeConexao({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9 items-center justify-center", className)}>
      <span
        className="absolute inline-flex size-9 rounded-full bg-primary/30 animate-ping-ring"
        aria-hidden="true"
      />
      <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <IconPlugConnected className="size-4.5 animate-pulse" aria-hidden="true" />
      </span>
    </span>
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
      <Badge
        variant="outline"
        className="h-8 gap-2 px-3"
        role="status"
        aria-live="polite"
      >
        <span className="relative inline-flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-2 rounded-full bg-primary/50 animate-ping-ring" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Conectando…
      </Badge>
    );
  }

  if (status === "connected") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="h-8 gap-2 px-3" role="status">
          <span
            className="inline-flex size-2 rounded-full bg-primary"
            aria-hidden="true"
          />
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
