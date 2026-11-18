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
import { entrarSchema, novaSenhaSchema, trocarSenha, MIN_SENHA, enviarCodigoDeAcesso, verificarCodigoDeAcesso, lerConfiguracaoDeAcesso } from "@/lib/conta";

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
  const { entrar, guardarConta } = useConta();
  const [login, setLogin] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [senhaLocal, setSenhaLocal] = React.useState("");
  const [codigo, setCodigo] = React.useState("");
  const [usandoCodigo, setUsandoCodigo] = React.useState(false);
  const [codePurpose, setCodePurpose] = React.useState<'setup' | 'recovery'>('setup');
  const [configuracao, setConfiguracao] = React.useState<import("@shared/conta").ConfiguracaoDeAcesso | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    lerConfiguracaoDeAcesso().then((value) => {
      if (cancelled) return;
      setConfiguracao(value);
      if (!value.configurada) setErro("A autenticação desta instalação ainda precisa ser configurada.");
    }).catch((error) => { if (!cancelled) setErro(mensagem(error, "Não foi possível verificar o acesso.")); });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      if (usandoCodigo) {
        guardarConta(await verificarCodigoDeAcesso({ login, codigo, senhaLocal: senhaLocal || undefined }));
      } else {
        const parsed = entrarSchema.safeParse({ login, senha, senhaLocal: senhaLocal || undefined });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
        await entrar(parsed.data);
      }
    } catch (error) { setErro(mensagem(error, "Não foi possível entrar.")); }
    finally { setEnviando(false); }
  }

  async function sendCode(purpose: 'setup' | 'recovery') {
    setEnviando(true);
    setErro(null);
    try { await enviarCodigoDeAcesso(login, purpose); setCodePurpose(purpose); setUsandoCodigo(true); }
    catch (error) { setErro(mensagem(error, "Não foi possível enviar o código.")); }
    finally { setEnviando(false); }
  }

  return (
    <Moldura titulo="Entrar na Esmeraldinha" descricao="Entre com o login do auxiliar de ensino ou com seu CPF e senha do portal.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="login">Login ou CPF</Label>
          <Input id="login" value={login} autoFocus autoComplete="username" onChange={(event) => setLogin(event.target.value)} />
        </div>
        {usandoCodigo ? <div className="flex flex-col gap-2">
          <Label htmlFor="codigo">Código recebido por e-mail</Label>
          <Input id="codigo" value={codigo} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => setCodigo(event.target.value)} />
          <p className="text-xs text-muted-foreground">Após confirmar o código, você deverá definir sua senha.</p>
        </div> : <CampoDeSenha id="senha" label="Senha" value={senha} autoComplete="current-password" onChange={setSenha} />}
        {configuracao?.precisaVincular && <CampoDeSenha id="senha-local" label="Senha anterior desta instalação" value={senhaLocal} autoComplete="off" onChange={setSenhaLocal} descricao="Necessária somente para vincular a conta do auxiliar de ensino já existente." />}
        {erro && <Erro>{erro}</Erro>}
        <Button type="submit" disabled={enviando || configuracao?.configurada === false}>
          {enviando && <IconLoader data-icon="inline-start" className="animate-spin" />}
          {usandoCodigo ? "Confirmar código" : "Entrar"}
        </Button>
        <Button type="button" variant="ghost" disabled={enviando || !login || configuracao?.configurada === false} onClick={() => void sendCode(usandoCodigo ? codePurpose : 'setup')}>
          {usandoCodigo ? "Reenviar código" : "Primeiro acesso do auxiliar"}
        </Button>
        {!usandoCodigo && <Button type="button" variant="ghost" disabled={enviando || !login || configuracao?.configurada === false} onClick={() => void sendCode('recovery')}>Recuperar senha do auxiliar</Button>}
        {usandoCodigo && <Button type="button" variant="ghost" onClick={() => setUsandoCodigo(false)}>Entrar com senha</Button>}
      </form>
    </Moldura>
  );
}

/** Primeiro acesso and recovery sessions remain restricted until a senha is set. */
export function PrimeiroAcesso() {
  const { conta, guardarConta, sair } = useConta();
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
      descricao="Defina a senha da sua conta do auxiliar de ensino."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        {!conta?.acessoPorCodigo && <CampoDeSenha
          id="senha-atual"
          label="Senha atual"
          value={senhaAtual}
          autoFocus
          autoComplete="current-password"
          onChange={setSenhaAtual}
          descricao="A mesma que você acabou de usar para entrar."
        />}
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
