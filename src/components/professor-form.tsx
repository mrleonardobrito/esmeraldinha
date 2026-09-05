import * as React from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLoader,
  IconTrash,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  formatCpf,
  getInitials,
  professorSchema,
  professorUpdateSchema,
  readImageAsDataUrl,
  type Professor,
  type ProfessorField,
  type ProfessorInput,
  type ProfessorUpdateInput,
} from "@/lib/professores";
import {
  buscarTurmas,
  loadTurmas,
  nomeCurtoDaTurma,
  validarCredenciais,
  type Turma,
} from "@/lib/turmas";
import { cn } from "@/lib/utils";

type FormErrors = Partial<Record<ProfessorField, string>>;

/**
 * O cadastro do professor em três passos. Cada um só faz sentido depois do
 * anterior: sem credenciais que funcionam não há portal para ler as turmas, e
 * sem turmas não há a quem pedir estudantes.
 */
const PASSOS = ["dados-de-login", "turmas", "estudantes"] as const;

type Passo = (typeof PASSOS)[number];

const TITULOS: Record<Passo, string> = {
  "dados-de-login": "Dados de login",
  turmas: "Turmas",
  estudantes: "Estudantes",
};

const INITIAL_VALUES: ProfessorInput = {
  nome: "",
  login: "",
  senha: "",
  escola: "",
  imagem: undefined,
};

function mensagem(error: unknown, padrao: string): string {
  return error instanceof Error ? error.message : padrao;
}

export function ProfessorForm({
  open,
  onOpenChange,
  professor,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professor?: Professor | null;
  /** Devolve o professor gravado: é o id dele que os passos seguintes usam. */
  onSubmit: (values: ProfessorInput | ProfessorUpdateInput) => Promise<Professor>;
  isSubmitting?: boolean;
}) {
  const [passo, setPasso] = React.useState<Passo>("dados-de-login");
  const [values, setValues] = React.useState<ProfessorInput>(INITIAL_VALUES);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [showSenha, setShowSenha] = React.useState(false);
  const [validando, setValidando] = React.useState(false);
  /** O professor gravado no passo 1, dono das turmas dos passos seguintes. */
  const [salvo, setSalvo] = React.useState<Professor | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isEditing = Boolean(professor);

  React.useEffect(() => {
    if (!open) return;
    setValues(
      professor
        ? {
            nome: professor.nome,
            login: formatCpf(professor.login),
            // A senha não volta da API: editar deixa o campo em branco, e
            // em branco significa "manter a senha atual".
            senha: "",
            escola: professor.escola,
            imagem: professor.imagem ?? undefined,
          }
        : INITIAL_VALUES,
    );
    setPasso("dados-de-login");
    setErrors({});
    setSubmitError(null);
    setShowSenha(false);
    setSalvo(professor ?? null);
  }, [open, professor]);

  function updateField(field: ProfessorField, value: string | undefined) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      updateField("imagem", await readImageAsDataUrl(file));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        imagem: mensagem(error, "Imagem inválida."),
      }));
    }
  }

  /**
   * Passo 1: as credenciais são conferidas no portal antes de virarem
   * cadastro. Guardar credenciais que não logam é guardar um problema para
   * descobrir só na hora de preencher uma caderneta.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Editando, uma senha em branco mantém a senha atual; a validação
    // completa (mínimo de 4 caracteres) só se aplica ao cadastro.
    const schema = isEditing ? professorUpdateSchema : professorSchema;
    const candidate =
      isEditing && !values.senha ? { ...values, senha: undefined } : values;
    const result = schema.safeParse(candidate);

    if (!result.success) {
      const nextErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as ProfessorField | undefined;
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitError(null);

    // Sem senha nova não há o que conferir no portal: a que está guardada já
    // passou por aqui quando foi cadastrada.
    if (result.data.senha) {
      setValidando(true);
      try {
        await validarCredenciais({
          login: result.data.login,
          senha: result.data.senha,
          escola: result.data.escola,
        });
      } catch (error) {
        setSubmitError(
          mensagem(error, "Não foi possível conferir as credenciais no portal."),
        );
        return;
      } finally {
        setValidando(false);
      }
    }

    try {
      setSalvo(await onSubmit(result.data));
      setPasso("turmas");
    } catch (error) {
      setSubmitError(mensagem(error, "Não foi possível salvar o professor."));
    }
  }

  const ocupado = Boolean(isSubmitting) || validando;

  return (
    <Sheet open={open} onOpenChange={(aberto) => !aberto && !ocupado && onOpenChange(false)}>
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar professor" : "Novo professor"}
          </SheetTitle>
          <SheetDescription>
            {passo === "dados-de-login"
              ? "A Esmeraldinha confere no portal se as credenciais funcionam antes de guardá-las."
              : passo === "turmas"
                ? "As turmas vêm do portal: nome e turno saem do jeito que ele as escreve."
                : "Os estudantes de cada turma, com matrícula, situação e data da matrícula."}
          </SheetDescription>
        </SheetHeader>

        <Passos atual={passo} />

        {passo === "dados-de-login" && (
          <>
            <form
              id="professor-form"
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4 px-6"
            >
              <div className="flex items-center gap-4">
                <Avatar size="lg" className="size-16">
                  {values.imagem && (
                    <AvatarImage src={values.imagem} alt={values.nome} />
                  )}
                  <AvatarFallback className="text-base">
                    {getInitials(values.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground">
                    Imagem de perfil (opcional)
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <IconUpload data-icon="inline-start" />
                      Escolher
                    </Button>
                    {values.imagem && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateField("imagem", undefined)}
                      >
                        <IconTrash data-icon="inline-start" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              </div>
              {errors.imagem && <ErrorMessage>{errors.imagem}</ErrorMessage>}

              <Field label="Nome" error={errors.nome} htmlFor="professor-nome">
                <Input
                  id="professor-nome"
                  value={values.nome}
                  onChange={(event) => updateField("nome", event.target.value)}
                  placeholder="Maria Esmeralda da Silva"
                  autoComplete="name"
                  aria-invalid={Boolean(errors.nome)}
                />
              </Field>

              <Field
                label="Login (CPF)"
                error={errors.login}
                htmlFor="professor-login"
              >
                <Input
                  id="professor-login"
                  value={values.login}
                  onChange={(event) =>
                    updateField("login", formatCpf(event.target.value))
                  }
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                  autoComplete="username"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.login)}
                />
              </Field>

              <Field label="Senha" error={errors.senha} htmlFor="professor-senha">
                <div className="relative">
                  <Input
                    id="professor-senha"
                    type={showSenha ? "text" : "password"}
                    value={values.senha}
                    onChange={(event) => updateField("senha", event.target.value)}
                    placeholder={
                      isEditing
                        ? "Deixe em branco para manter a senha atual"
                        : "Mínimo de 4 caracteres"
                    }
                    autoComplete="new-password"
                    className="pr-9"
                    aria-invalid={Boolean(errors.senha)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-0.5 -translate-y-1/2"
                    onClick={() => setShowSenha((current) => !current)}
                    aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showSenha ? <IconEyeOff /> : <IconEye />}
                  </Button>
                </div>
              </Field>

              <Field
                label="Escola"
                error={errors.escola}
                htmlFor="professor-escola"
              >
                <Input
                  id="professor-escola"
                  value={values.escola}
                  onChange={(event) => updateField("escola", event.target.value)}
                  placeholder="E.M. Esmeralda"
                  aria-invalid={Boolean(errors.escola)}
                />
              </Field>

              {submitError && <ErrorMessage>{submitError}</ErrorMessage>}
            </form>

            <SheetFooter className="flex-row justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={ocupado}
              >
                Cancelar
              </Button>
              <Button type="submit" form="professor-form" disabled={ocupado}>
                {validando && (
                  <IconLoader className="animate-spin" data-icon="inline-start" />
                )}
                {validando ? "Conferindo no portal…" : "Continuar"}
              </Button>
            </SheetFooter>
          </>
        )}

        {passo === "turmas" && salvo && (
          <BuscarTurmas
            professor={salvo}
            onVoltar={() => setPasso("dados-de-login")}
            onContinuar={() => setPasso("estudantes")}
          />
        )}

        {passo === "estudantes" && salvo && (
          <BuscarEstudantes
            professor={salvo}
            onVoltar={() => setPasso("turmas")}
            onConcluir={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Passos({ atual }: { atual: Passo }) {
  const indiceAtual = PASSOS.indexOf(atual);

  return (
    <ol className="flex items-center gap-2 px-6 pb-4 text-xs">
      {PASSOS.map((passo, indice) => {
        const concluido = indice < indiceAtual;
        const ativo = indice === indiceAtual;

        return (
          <li key={passo} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border tabular-nums",
                ativo && "border-primary bg-primary text-primary-foreground",
                concluido && "border-primary text-primary",
              )}
            >
              {concluido ? <IconCheck className="size-3" /> : indice + 1}
            </span>
            <span
              className={cn(
                "text-muted-foreground",
                ativo && "font-medium text-foreground",
              )}
            >
              {TITULOS[passo]}
            </span>
            {indice < PASSOS.length - 1 && (
              <span aria-hidden className="text-muted-foreground">
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type TurmasState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; turmas: Turma[] };

/**
 * Passo 2: as turmas do professor, lidas do portal. Não há nada para escolher
 * aqui — o professor trabalha nas turmas em que trabalha, e a Esmeraldinha só
 * precisa saber quais são.
 */
function BuscarTurmas({
  professor,
  onVoltar,
  onContinuar,
}: {
  professor: Professor;
  onVoltar: () => void;
  onContinuar: () => void;
}) {
  const [estado, setEstado] = React.useState<TurmasState>({ status: "loading" });
  const [tentativa, setTentativa] = React.useState(0);

  function tentarDeNovo() {
    setEstado({ status: "loading" });
    setTentativa((atual) => atual + 1);
  }

  React.useEffect(() => {
    let cancelled = false;

    buscarTurmas(professor.id)
      .then((turmas) => {
        if (!cancelled) setEstado({ status: "ready", turmas });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEstado({
          status: "error",
          message: mensagem(error, "Não foi possível ler as turmas no portal."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [professor.id, tentativa]);

  return (
    <>
      <div className="flex flex-col gap-3 px-6">
        {estado.status === "loading" && (
          <Aviso>
            <IconLoader className="size-4 animate-spin" />
            Lendo as turmas no portal…
          </Aviso>
        )}

        {estado.status === "error" && (
          <>
            <ErrorMessage>{estado.message}</ErrorMessage>
            <Button variant="outline" onClick={tentarDeNovo}>
              Tentar novamente
            </Button>
          </>
        )}

        {estado.status === "ready" && estado.turmas.length === 0 && (
          <Aviso>O portal não devolveu nenhuma turma para este professor.</Aviso>
        )}

        {estado.status === "ready" &&
          estado.turmas.map((turma) => (
            <div
              key={turma.id}
              className="flex flex-col gap-1 rounded-2xl border bg-card px-4 py-3"
            >
              <span className="font-heading text-sm font-medium">
                {nomeCurtoDaTurma(turma.nome)}
              </span>
              <span>
                {turma.turno ? (
                  <Badge variant="outline">{turma.turno}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    O portal não escreveu o turno desta turma.
                  </span>
                )}
              </span>
            </div>
          ))}
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <Button onClick={onContinuar} disabled={estado.status === "loading"}>
          Continuar
        </Button>
      </SheetFooter>
    </>
  );
}

/**
 * Passo 3: os estudantes de cada turma.
 *
 * TODO: o esqueleto está de pé — a tela lista as turmas e sabe pedir os
 * estudantes de cada uma — mas a leitura do portal ainda devolve lista vazia.
 * Falta ler matrícula, nome, situação e data da matrícula da tela de
 * Lançamento de Presença. Ver `server/turmas/busca.ts`.
 */
function BuscarEstudantes({
  professor,
  onVoltar,
  onConcluir,
}: {
  professor: Professor;
  onVoltar: () => void;
  onConcluir: () => void;
}) {
  const [estado, setEstado] = React.useState<TurmasState>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    loadTurmas(professor.id)
      .then((turmas) => {
        if (!cancelled) setEstado({ status: "ready", turmas });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEstado({
          status: "error",
          message: mensagem(error, "Não foi possível carregar as turmas."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [professor.id]);

  return (
    <>
      <div className="flex flex-col gap-3 px-6">
        <Aviso>
          <IconUsers className="size-4 shrink-0" />
          A busca dos estudantes ainda não lê o portal. As turmas já estão
          guardadas — os estudantes de cada uma entram depois.
        </Aviso>

        {estado.status === "error" && <ErrorMessage>{estado.message}</ErrorMessage>}

        {estado.status === "ready" &&
          estado.turmas.map((turma) => (
            <div
              key={turma.id}
              className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
            >
              <span className="text-sm font-medium">{nomeCurtoDaTurma(turma.nome)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {turma.totalDeEstudantes} estudante(s)
              </span>
            </div>
          ))}
      </div>

      <SheetFooter className="flex-row justify-end">
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <Button onClick={onConcluir}>Concluir</Button>
      </SheetFooter>
    </>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 text-xs text-destructive"
    >
      <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
