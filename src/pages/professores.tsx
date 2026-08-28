import * as React from "react";
import {
  IconChalkboardTeacher,
  IconDotsVertical,
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
  formatCpf,
  getInitials,
  isLoginTaken,
  loadProfessores,
  saveProfessores,
  type Professor,
  type ProfessorInput,
} from "@/lib/professores";

export function Professores() {
  const [professores, setProfessores] = React.useState<Professor[]>(() =>
    loadProfessores(),
  );
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editedProfessor, setEditedProfessor] = React.useState<Professor | null>(
    null,
  );

  React.useEffect(() => {
    saveProfessores(professores);
  }, [professores]);

  function openCreateForm() {
    setEditedProfessor(null);
    setIsFormOpen(true);
  }

  function openEditForm(professor: Professor) {
    setEditedProfessor(professor);
    setIsFormOpen(true);
  }

  function handleSubmit(values: ProfessorInput) {
    if (editedProfessor) {
      const id = editedProfessor.id;
      setProfessores((current) =>
        current.map((professor) =>
          professor.id === id ? { ...professor, ...values } : professor,
        ),
      );
      toast.success("Professor atualizado.");
      return;
    }

    setProfessores((current) => [...current, createProfessor(values)]);
    toast.success("Professor cadastrado.");
  }

  function handleDelete(professor: Professor) {
    setProfessores((current) =>
      current.filter((item) => item.id !== professor.id),
    );
    toast.success(`${professor.nome} foi removido.`);
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
          {professores.length === 0 ? (
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
                      {formatCpf(professor.login)}
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
        isLoginTaken={(login) =>
          isLoginTaken(professores, login, editedProfessor?.id)
        }
      />
    </div>
  );
}
