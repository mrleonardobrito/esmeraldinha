import * as React from "react";
import {
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconLoader,
  IconLock,
} from "@tabler/icons-react";

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
import { useConta } from "@/components/conta-provider";
import { entrarSchema, novaSenhaSchema, trocarSenha, completarPrimeiroAcesso, MIN_SENHA } from "@/lib/conta";

function mensagem(error: unknown, padrao: string): string {
  return error instanceof Error ? error.message : padrao;
}

/** O bloco de erro que as duas telas de acesso usam. */
function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/** O campo de senha com o olho que a mostra, como no cadastro do professor. */
function CampoDeSenha({
  id,
  label,
  value,
  onChange,
  autoFocus,
  autoComplete,
  descricao,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  autoComplete?: string;
  descricao?: string;
}) {
  const [visivel, setVisivel] = React.useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visivel ? "text" : "password"}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
        >
          {visivel ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </Button>
      </div>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
    </div>
  );
}

/** A moldura das telas que existem antes do app: só elas ocupam a janela toda. */
function Moldura({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img
            src="/esmeralda.png"
            alt=""
            width={56}
            height={56}
            aria-hidden="true"
            className="mx-auto object-contain"
          />
          <CardTitle className="font-heading text-lg">{titulo}</CardTitle>
          <CardDescription>{descricao}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

/** A entrada na Esmeraldinha: sem sessão, é a única tela que existe. */
export function TelaDeEntrada() {
  const { entrar } = useConta();
  const [invitation, setInvitation] = React.useState(() => new URLSearchParams(window.location.hash.slice(1)).get("primeiro-acesso") ?? "");
  const [showInvitation, setShowInvitation] = React.useState(() => new URLSearchParams(window.location.hash.slice(1)).has("primeiro-acesso"));
  React.useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).has("primeiro-acesso")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);
  const [login, setLogin] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = entrarSchema.safeParse({ login, senha });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? "Dados de acesso inválidos.");
      return;
    }

    setEnviando(true);
    setErro(null);
    try {
      await entrar(parsed.data);
    } catch (error) {
      setErro(mensagem(error, "Não foi possível entrar."));
    } finally {
      setEnviando(false);
    }
  }

  if (showInvitation) return <AtivarConta invitation={invitation} onChange={setInvitation} onBack={() => { setInvitation(""); setShowInvitation(false); }} />;

  return (
    <Moldura
      titulo="Entrar na Esmeraldinha"
      descricao="Entre com o login do auxiliar de ensino ou o e-mail e a senha da sua conta."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login">Login ou e-mail</Label>
          <Input
            id="login"
            value={login}
            autoFocus
            autoComplete="username"
            onChange={(event) => setLogin(event.target.value)}
          />
        </div>
        <CampoDeSenha
          id="senha"
          label="Senha"
          value={senha}
          autoComplete="current-password"
          onChange={setSenha}
        />
        {erro && <Erro>{erro}</Erro>}
        <Button type="submit" disabled={enviando}>
          {enviando && (
            <IconLoader data-icon="inline-start" className="animate-spin" />
          )}
          Entrar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShowInvitation(true)}>Tenho um link de primeiro acesso</Button>
      </form>
    </Moldura>
  );
}

/**
 * O primeiro acesso. A senha temporária vem de um arquivo de ambiente e é
 * a mesma em toda instalação: trocá-la é a primeira coisa a fazer, e nada
 * mais do app abre antes disso.
 */
export function PrimeiroAcesso() {
  const { guardarConta, sair } = useConta();
  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

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

    setEnviando(true);
    setErro(null);
    try {
      guardarConta(await trocarSenha(parsed.data));
    } catch (error) {
      setErro(mensagem(error, "Não foi possível definir a senha."));
      setEnviando(false);
    }
  }

  return (
    <Moldura
      titulo="Defina a sua senha"
      descricao="A senha temporária serve só para este primeiro acesso."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <CampoDeSenha
          id="senha-temporaria"
          label="Senha temporária"
          value={senhaAtual}
          autoFocus
          autoComplete="current-password"
          onChange={setSenhaAtual}
          descricao="A mesma que você acabou de usar para entrar."
        />
        <CampoDeSenha
          id="senha-nova"
          label="Nova senha"
          value={senha}
          autoComplete="new-password"
          onChange={setSenha}
          descricao={`Pelo menos ${MIN_SENHA} caracteres.`}
        />
        <CampoDeSenha
          id="senha-confirmacao"
          label="Repita a nova senha"
          value={confirmacao}
          autoComplete="new-password"
          onChange={setConfirmacao}
        />
        {erro && <Erro>{erro}</Erro>}
        <Button type="submit" disabled={enviando}>
          {enviando ? (
            <IconLoader data-icon="inline-start" className="animate-spin" />
          ) : (
            <IconLock data-icon="inline-start" />
          )}
          Salvar senha e continuar
        </Button>
        <Button type="button" variant="ghost" onClick={() => void sair()}>
          Sair
        </Button>
      </form>
    </Moldura>
  );
}

/** Link redemption is a POST after explicit password choice, never on opening the URL. */
function AtivarConta({ invitation, onChange, onBack }: { invitation: string; onChange: (value: string) => void; onBack: () => void }) {
  const [senha, setSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [concluido, setConcluido] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let token = invitation.trim();
    try {
      const link = new URL(token);
      token = new URLSearchParams(link.hash.slice(1)).get("primeiro-acesso") ?? "";
    } catch { /* The raw token is accepted when pasted instead of the URL. */ }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setErro("Link inválido."); return; }
    if (senha.length < MIN_SENHA || senha.length > 128 || senha !== confirmacao) {
      setErro("As senhas devem conferir e ter entre 8 e 128 caracteres."); return;
    }
    setEnviando(true); setErro(null);
    try {
      await completarPrimeiroAcesso(token, senha);
      onChange(""); setSenha(""); setConfirmacao(""); setConcluido(true);
    } catch (error) { setErro(mensagem(error, "Não foi possível ativar a conta.")); }
    finally { setEnviando(false); }
  }

  return <Moldura titulo="Primeiro acesso" descricao="Defina a senha da sua conta Esmeraldinha. A senha do portal permanece separada.">
    {concluido ? (
      <div className="space-y-4"><p className="text-sm">Conta ativada. Entre com seu e-mail e a nova senha.</p><Button className="w-full" onClick={onBack}>Ir para o login</Button></div>
    ) : (
      <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Label htmlFor="activation-link">Link de primeiro acesso</Label>
        <Input id="activation-link" type="password" autoComplete="off" value={invitation} onChange={(event) => onChange(event.target.value)} />
        <CampoDeSenha id="activation-password" label="Nova senha" autoComplete="new-password" value={senha} onChange={setSenha} />
        <CampoDeSenha id="activation-confirmation" label="Repita a senha" autoComplete="new-password" value={confirmacao} onChange={setConfirmacao} />
        {erro && <Erro>{erro}</Erro>}
        <Button type="submit" disabled={enviando}>{enviando ? "Ativando…" : "Ativar conta"}</Button>
        <Button type="button" variant="ghost" disabled={enviando} onClick={onBack}>Voltar</Button>
      </form>
    )}
  </Moldura>;
}
