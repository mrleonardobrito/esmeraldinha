import * as React from "react";
import { IconEye, IconEyeOff, IconUpload, IconTrash } from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  readImageAsDataUrl,
  type Professor,
  type ProfessorField,
  type ProfessorInput,
} from "@/lib/professores";

type FormErrors = Partial<Record<ProfessorField, string>>;

const INITIAL_VALUES: ProfessorInput = {
  nome: "",
  login: "",
  senha: "",
  escola: "",
  imagem: undefined,
};

export function ProfessorForm({
  open,
  onOpenChange,
  professor,
  onSubmit,
  isLoginTaken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professor?: Professor | null;
  onSubmit: (values: ProfessorInput) => void;
  isLoginTaken: (login: string) => boolean;
}) {
  const [values, setValues] = React.useState<ProfessorInput>(INITIAL_VALUES);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [showSenha, setShowSenha] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isEditing = Boolean(professor);

  React.useEffect(() => {
    if (!open) return;
    setValues(
      professor
        ? {
            nome: professor.nome,
            login: formatCpf(professor.login),
            senha: professor.senha,
            escola: professor.escola,
            imagem: professor.imagem,
          }
        : INITIAL_VALUES,
    );
    setErrors({});
    setShowSenha(false);
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
        imagem: error instanceof Error ? error.message : "Imagem inválida.",
      }));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = professorSchema.safeParse(values);

    if (!result.success) {
      const nextErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as ProfessorField | undefined;
        if (field && !nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    if (isLoginTaken(result.data.login)) {
      setErrors({ login: "Já existe um professor com esse login." });
      return;
    }

    onSubmit(result.data);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Editar professor" : "Novo professor"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Atualize os dados de acesso e de identificação do professor."
              : "Preencha os dados de acesso do professor. A imagem de perfil é opcional."}
          </SheetDescription>
        </SheetHeader>

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
                placeholder="Mínimo de 4 caracteres"
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

          <Field label="Escola" error={errors.escola} htmlFor="professor-escola">
            <Input
              id="professor-escola"
              value={values.escola}
              onChange={(event) => updateField("escola", event.target.value)}
              placeholder="E.M. Esmeralda"
              aria-invalid={Boolean(errors.escola)}
            />
          </Field>
        </form>

        <SheetFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form="professor-form">
            {isEditing ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}
