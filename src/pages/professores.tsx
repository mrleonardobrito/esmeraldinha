import * as React from "react";
import {
  IconAlertTriangle,
  IconChalkboardTeacher,
  IconLock,
  IconLockOpen,
  IconDotsVertical,
  IconLoader,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ProfessorDetails } from "@/components/professor-details";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfessorForm } from "@/components/professor-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createProfessor,
  deleteProfessor,
  getInitials,
  loadProfessores,
  maskCpf,
  updateProfessor,
  setProfessorAcesso,
  createProfessorInvitation,
  type Professor,
  type ProfessorInput,
  type ProfessorUpdateInput,
} from "@/lib/professores";
import { buscarTurmas } from "@/lib/turmas";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

export function Professores() {
  const [invited, setInvited] = React.useState<Professor | null>(null);
  const [invitationEmail, setInvitationEmail] = React.useState("");
  const [invitationLink, setInvitationLink] = React.useState("");
  const [invitationBusy, setInvitationBusy] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [professores, setProfessores] = React.useState<Professor[]>([]);
  const [listState, setListState] = React.useState<ListState>({
    status: "loading",
  });
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editedProfessor, setEditedProfessor] = React.useState<Professor | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [relendo, setRelendo] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    loadProfessores()
      .then((list) => {
        if (cancelled) return;
        setProfessores(list);
        setListState({ status: "ready" });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListState({
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

  function retryFetchProfessores() {
    setListState({ status: "loading" });
    setReloadToken((current) => current + 1);
  }

  function openCreateForm() {
    setEditedProfessor(null);
    setIsFormOpen(true);
  }

  function openEditForm(professor: Professor) {
    setEditedProfessor(professor);
    setIsFormOpen(true);
  }

  /** Devolve o professor gravado: os passos de turmas e estudantes usam o id dele. */
  async function handleSubmit(
    values: ProfessorInput | ProfessorUpdateInput,
  ): Promise<Professor> {
    setIsSubmitting(true);
    try {
      if (editedProfessor) {
        const updated = await updateProfessor(
          editedProfessor.id,
          values as ProfessorUpdateInput,
        );
        setProfessores((current) =>
          current.map((professor) =>
            professor.id === updated.id ? updated : professor,
          ),
        );
        toast.success("Professor atualizado.");
        return updated;
      }

      const created = await createProfessor(values as ProfessorInput);
      setProfessores((current) => [...current, created]);
      toast.success("Professor cadastrado.");
      return created;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function relerDoPortal(professor: Professor) {
    setRelendo(professor.id);

    try {
      const turmas = await buscarTurmas(professor.id);
      const estudantes = turmas.reduce(
        (total, turma) => total + turma.totalDeEstudantes,
        0,
      );

      toast.success(
        `${professor.nome}: ${turmas.length} turma(s) e ${estudantes} estudante(s) lidos do portal.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível reler as turmas no portal.",
      );
    } finally {
      setRelendo(null);
    }
  }

  async function handleDelete(professor: Professor) {
    try {
      await deleteProfessor(professor.id);
      setProfessores((current) =>
        current.filter((item) => item.id !== professor.id),
      );
      toast.success(`${professor.nome} foi removido.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o professor.",
      );
    }
  }

  function openInvitation(professor: Professor) {
    setInvited(professor);
    setInvitationEmail("");
    setInvitationLink("");
  }

  async function issueInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invited || invitationBusy) return;
    setInvitationBusy(true);
    try {
      const result = await createProfessorInvitation(invited.id, invitationEmail.trim());
      const link = new URL(window.location.href);
      link.pathname = "/";
      link.search = "";
      link.hash = `primeiro-acesso=${result.token}`;
      setInvitationLink(link.toString());
      setProfessores((current) => current.map((item) => item.id === invited.id ? { ...item, acessoLiberado: false } : item));
      toast.success("Link gerado. Envie-o somente ao professor.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o link.");
    } finally {
      setInvitationBusy(false);
    }
  }

  const invitationDialog = (
    <Dialog open={invited !== null} onOpenChange={(open) => {
      if (!open && !invitationBusy) { setInvited(null); setInvitationLink(""); }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de primeiro acesso</DialogTitle>
          <DialogDescription>
            {invited?.nome}: o link vale por 24 horas e só pode ser usado uma vez. Gerar outro link cancela o anterior e suspende a conta até a definição da nova senha.
          </DialogDescription>
        </DialogHeader>
        {invitationLink ? (
          <div className="space-y-3">
            <Label htmlFor="invitation-link">Link privado</Label>
            <Input id="invitation-link" readOnly value={invitationLink} onFocus={(event) => event.target.select()} />
            <p className="text-sm text-muted-foreground">Envie por um canal privado. Nesta versão local, o professor precisa abrir o link ou colá-lo na tela de entrada da mesma instalação. O envio não é automático.</p>
            <DialogFooter>
              <Button onClick={async () => {
                try { await navigator.clipboard.writeText(invitationLink); toast.success("Link copiado."); }
                catch { toast.error("Selecione e copie o link manualmente."); }
              }}>Copiar link</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => void issueInvitation(event)}>
            <Label htmlFor="invitation-email">E-mail do professor</Label>
            <Input id="invitation-email" type="email" required maxLength={254} value={invitationEmail} onChange={(event) => setInvitationEmail(event.target.value)} />
            <DialogFooter><Button type="submit" disabled={invitationBusy}>{invitationBusy ? "Gerando…" : "Gerar link"}</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  async function handleAcesso(professor: Professor) {
    try {
      const updated = await setProfessorAcesso(professor.id, false);
      setProfessores((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(
        updated.acessoLiberado
          ? "Acesso ao sistema liberado."
          : "Acesso ao sistema revogado.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o acesso.",
      );
    }
  }

  const selected = professores.find((professor) => professor.id === selectedId);
  if (selected) return <>
    <ProfessorDetails professor={selected} onBack={() => setSelectedId(null)} onEdit={() => openEditForm(selected)} onAccess={() => openInvitation(selected)} />
    {invitationDialog}
    <ProfessorForm open={isFormOpen} onOpenChange={setIsFormOpen} professor={editedProfessor} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
  </>;

  return (
    <div className="min-w-full flex-1 bg-zinc-50 p-4 font-sans lg:p-6 dark:bg-black">
      <Card>
        <CardHeader>
          <CardTitle>Professores</CardTitle>
          <CardDescription>
            Cadastre os professores que terão acesso à Esmeraldinha.
          </CardDescription>
          <CardAction>
            <Button data-tour="novo-professor" onClick={openCreateForm}>
              <IconPlus data-icon="inline-start" />
              Novo professor
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {listState.status === "loading" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
              <IconLoader className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Carregando professores…
              </p>
            </div>
          ) : listState.status === "error" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/10 px-6 py-12 text-center">
              <IconAlertTriangle className="size-8 text-destructive" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-destructive">
                  Não foi possível carregar os professores
                </p>
                <p className="text-sm text-muted-foreground">
                  {listState.message}
                </p>
              </div>
              <Button variant="outline" onClick={retryFetchProfessores}>
                Tentar novamente
              </Button>
            </div>
          ) : professores.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
              <IconChalkboardTeacher className="size-8 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  Nenhum professor cadastrado
                </p>
                <p className="text-sm text-muted-foreground">
                  Comece adicionando o primeiro professor da escola.
                </p>
              </div>
              <Button variant="outline" onClick={openCreateForm}>
                <IconPlus data-icon="inline-start" />
                Novo professor
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Login (CPF)</TableHead>
                  <TableHead>Senha</TableHead>
                  <TableHead>Escola</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {professores.map((professor) => (
                  <TableRow key={professor.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar>
                          {professor.imagem && (
                            <AvatarImage
                              src={professor.imagem}
                              alt={professor.nome}
                            />
                          )}
                          <AvatarFallback>
                            {getInitials(professor.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <button className="font-medium text-left hover:underline" onClick={() => setSelectedId(professor.id)}>{professor.nome}</button>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {maskCpf(professor.login)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {"•".repeat(8)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {professor.escola}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações de ${professor.nome}`}
                          >
                            <IconDotsVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => openEditForm(professor)}
                          >
                            <IconPencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => openInvitation(professor)}>
                            <IconLockOpen /> Gerar link de acesso
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void handleAcesso(professor)}>
                            <IconLock /> Revogar acesso ou convite
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={relendo === professor.id}
                            onSelect={() => void relerDoPortal(professor)}
                          >
                            <IconRefresh />
                            {relendo === professor.id
                              ? "Lendo o portal…"
                              : "Reler turmas e estudantes"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => handleDelete(professor)}
                          >
                            <IconTrash />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProfessorForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        professor={editedProfessor}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />
    {invitationDialog}
    </div>
  );
}
