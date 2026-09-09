import * as React from "react";
import {
  IconLoader,
  IconLock,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { useConta } from "@/components/conta-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  atualizarConta,
  contaSchema,
  novaSenhaSchema,
  trocarSenha,
  MIN_SENHA,
  type ContaField,
} from "@/lib/conta";
import { getInitials, readImageAsDataUrl } from "@/lib/professores";

type ErrosDoPerfil = Partial<Record<ContaField, string>>;

function mensagem(error: unknown, padrao: string): string {
  return error instanceof Error ? error.message : padrao;
}

/** O perfil do auxiliar de ensino: foto, nome e e-mail. O login não se edita. */
function Perfil() {
  const { conta, guardarConta } = useConta();
  const [nome, setNome] = React.useState(conta?.nome ?? "");
  const [email, setEmail] = React.useState(conta?.email ?? "");
  const [imagem, setImagem] = React.useState<string | undefined>(
    conta?.imagem ?? undefined,
  );
  const [erros, setErros] = React.useState<ErrosDoPerfil>({});
  const [salvando, setSalvando] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setImagem(await readImageAsDataUrl(file));
      setErros((atual) => ({ ...atual, imagem: undefined }));
    } catch (error) {
      setErros((atual) => ({
        ...atual,
        imagem: mensagem(error, "Imagem inválida."),
      }));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = contaSchema.safeParse({ nome, email, imagem });
    if (!parsed.success) {
      const encontrados: ErrosDoPerfil = {};
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0] as ContaField | undefined;
        if (campo && !encontrados[campo]) encontrados[campo] = issue.message;
      }
      setErros(encontrados);
      return;
    }

    setSalvando(true);
    try {
      guardarConta(await atualizarConta(parsed.data));
      setErros({});
      toast.success("Perfil atualizado.");
    } catch (error) {
      toast.error(mensagem(error, "Não foi possível salvar o perfil."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          Como você aparece na Esmeraldinha. O login ({conta?.login}) não muda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* A validação é a mesma do servidor (zod), então a do navegador só
            atrapalharia: ela barra o envio antes e com outra mensagem. */}
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
          <div className="flex items-center gap-4">
            <Avatar className="size-16 rounded-full">
              {imagem && <AvatarImage src={imagem} alt="" />}
              <AvatarFallback className="rounded-full">
                {getInitials(nome || "Auxiliar de ensino")}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconUpload data-icon="inline-start" />
                  Escolher foto
                </Button>
                {imagem && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setImagem(undefined)}
                  >
                    <IconTrash data-icon="inline-start" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG ou JPG de até 1 MB.
              </p>
              {erros.imagem && (
                <p className="text-xs text-destructive">{erros.imagem}</p>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="conta-nome">Nome</Label>
            <Input
              id="conta-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
            />
            {erros.nome && (
              <p className="text-xs text-destructive">{erros.nome}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="conta-email">E-mail</Label>
            <Input
              id="conta-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {erros.email && (
              <p className="text-xs text-destructive">{erros.email}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={salvando}>
              {salvando && (
                <IconLoader data-icon="inline-start" className="animate-spin" />
              )}
              Salvar perfil
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A troca da senha definitiva, fora do primeiro acesso. */
function Senha() {
  const { guardarConta } = useConta();
  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = novaSenhaSchema.safeParse({ senhaAtual, senha });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? "Senha inválida.");
      return;
    }

    if (senha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      guardarConta(await trocarSenha(parsed.data));
      setSenhaAtual("");
      setSenha("");
      setConfirmacao("");
      toast.success("Senha alterada. As outras sessões foram encerradas.");
    } catch (error) {
      setErro(mensagem(error, "Não foi possível alterar a senha."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Senha</CardTitle>
        <CardDescription>
          Trocar a senha encerra as sessões abertas em outras janelas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex max-w-sm flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input
              id="senha-atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(event) => setSenhaAtual(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <Input
              id="senha-nova"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Pelo menos {MIN_SENHA} caracteres.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-confirmacao">Repita a nova senha</Label>
            <Input
              id="senha-confirmacao"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={salvando}>
              {salvando ? (
                <IconLoader data-icon="inline-start" className="animate-spin" />
              ) : (
                <IconLock data-icon="inline-start" />
              )}
              Alterar senha
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** A conta de quem usa a Esmeraldinha: o perfil e a senha. */
export function ContaPage() {
  return (
    <div className="flex min-w-full flex-1 flex-col gap-4 bg-zinc-50 p-4 font-sans lg:p-6 dark:bg-black">
      <Perfil />
      <Senha />
    </div>
  );
}
