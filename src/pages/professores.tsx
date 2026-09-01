import * as React from "react";
import {
  IconAlertTriangle,
  IconChalkboardTeacher,
  IconDotsVertical,
  IconLoader,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

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
  type Professor,
  type ProfessorInput,
  type ProfessorUpdateInput,
} from "@/lib/professores";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

export function Professores() {
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

  async function handleSubmit(values: ProfessorInput | ProfessorUpdateInput) {
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
        return;
      }

      const created = await createProfessor(values as ProfessorInput);
      setProfessores((current) => [...current, created]);
      toast.success("Professor cadastrado.");
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="min-w-full flex-1 bg-zinc-50 p-4 font-sans lg:p-6 dark:bg-black">
      <Card>
        <CardHeader>
          <CardTitle>Professores</CardTitle>
          <CardDescription>
            Cadastre os professores que terão acesso à Esmeraldinha.
          </CardDescription>
          <CardAction>
            <Button onClick={openCreateForm}>
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
                        <span className="font-medium">{professor.nome}</span>
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
    </div>
  );
}
