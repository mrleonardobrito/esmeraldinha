import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook2,
  IconChalkboardTeacher,
  IconCircleCheck,
  IconClipboardList,
  IconLoader2,
} from "@tabler/icons-react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/hooks/use-count-up";
import {
  cadernetasParaRetomar,
  carregarPainel,
  descreverQuando,
  resumoDoPainel,
  type CadernetaParaRetomar,
  type DadosDoPainel,
  type ResumoDoPainel,
} from "@/lib/painel";
import { nomeCurtoDaTurma } from "@/lib/turmas";
import { cn } from "@/lib/utils";

type Estado =
  | { status: "carregando" }
  | { status: "erro"; mensagem: string }
  | { status: "pronto"; dados: DadosDoPainel };

export function Painel() {
  const [estado, setEstado] = React.useState<Estado>({ status: "carregando" });
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    let cancelado = false;

    carregarPainel()
      .then((dados) => {
        if (!cancelado) setEstado({ status: "pronto", dados });
      })
      .catch((error: unknown) => {
        if (cancelado) return;
        setEstado({
          status: "erro",
          mensagem:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o painel.",
        });
      });

    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  function tentarDeNovo() {
    setEstado({ status: "carregando" });
    setTentativa((atual) => atual + 1);
  }

  if (estado.status === "carregando") {
    return (
      <Shell>
        <Saudacao frase="Somando o que as cadernetas dizem…" />
        <PainelSkeleton />
        <span className="sr-only" role="status">
          Carregando o painel…
        </span>
      </Shell>
    );
  }

  if (estado.status === "erro") {
    return (
      <Shell>
        <Saudacao frase="O painel não conseguiu ler as cadernetas." />
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/10 px-6 py-12 text-center"
        >
          <IconAlertTriangle className="size-8 text-destructive" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar o painel
            </p>
            <p className="text-sm text-muted-foreground">{estado.mensagem}</p>
          </div>
          <Button variant="outline" onClick={tentarDeNovo}>
            Tentar novamente
          </Button>
        </div>
      </Shell>
    );
  }

  const { professores, itens } = estado.dados;

  if (professores.length === 0) {
    return (
      <Shell>
        <Saudacao frase="Ainda não há nenhum professor para acompanhar." />
        <Vazio
          icone={<IconChalkboardTeacher className="size-8 text-muted-foreground" />}
          titulo="Nenhum professor cadastrado"
          descricao="O painel conta as cadernetas dos professores cadastrados. Comece por um deles."
          acao={{ para: "/professores", rotulo: "Cadastrar professor" }}
        />
      </Shell>
    );
  }

  if (itens.length === 0) {
    return (
      <Shell>
        <Saudacao frase="Nenhuma caderneta cadastrada ainda." />
        <Vazio
          icone={<IconBook2 className="size-8 text-muted-foreground" />}
          titulo="Nenhuma caderneta ainda"
          descricao="Abra uma sessão no portal e cadastre a caderneta de uma turma para o painel ter o que contar."
          acao={{ para: "/cadernetas", rotulo: "Ir para Cadernetas" }}
        />
      </Shell>
    );
  }

  const resumo = resumoDoPainel(itens.map((item) => item.caderneta));
  const retomar = cadernetasParaRetomar(itens);

  return (
    <Shell>
      <Saudacao frase={fraseDoDia(resumo)} temTrabalho={resumo.feitas < resumo.total} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CartaoDeKpi
          rotulo="A fazer"
          valor={resumo.aFazer}
          apoio="Nenhuma aula lançada ainda"
          icone={<IconClipboardList />}
          atraso={60}
        />
        <CartaoDeKpi
          rotulo="Em andamento"
          valor={resumo.emAndamento}
          apoio="Começadas e ainda abertas"
          icone={<IconLoader2 className="animate-spin [animation-duration:1.8s]" />}
          destacado
          atraso={140}
        />
        <CartaoDeKpi
          rotulo="Feitas"
          valor={resumo.feitas}
          apoio="Todas as etapas fechadas no portal"
          icone={<IconCircleCheck />}
          atraso={220}
        />
      </div>

      {/* <ProgressoDoAnoLetivo resumo={resumo} /> */}

      {retomar.length > 0 && <ParaRetomar cadernetas={retomar} />}
    </Shell>
  );
}

/** O mesmo embrulho de conteúdo das outras páginas. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-full flex-1 flex-col gap-4 bg-zinc-50 p-4 font-sans lg:gap-6 lg:p-6 dark:bg-black">
      {children}
    </div>
  );
}

function Saudacao({
  frase,
  temTrabalho = false,
}: {
  frase: string;
  temTrabalho?: boolean;
}) {
  return (
    <div className="flex animate-rise flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Bem-vinda, Esmeraldinha!
        </h1>
        <p className="text-sm text-muted-foreground">{frase}</p>
      </div>

      {temTrabalho && (
        <Button asChild>
          <Link to="/cadernetas">
            Retomar trabalho
            <IconArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      )}
    </div>
  );
}

/** Uma frase que muda com os números, para o painel dizer algo já no alto. */
function fraseDoDia(resumo: ResumoDoPainel): string {
  if (resumo.feitas === resumo.total) {
    return `Tudo em dia: ${contar(resumo.total, "caderneta fechada", "cadernetas fechadas")}.`;
  }

  const emAndamento = contar(
    resumo.emAndamento,
    "caderneta em andamento",
    "cadernetas em andamento",
  );
  const aFazer = contar(
    resumo.aFazer,
    "esperando para começar",
    "esperando para começar",
  );

  if (resumo.emAndamento > 0 && resumo.aFazer > 0) {
    return `${emAndamento} e ${aFazer}.`;
  }
  if (resumo.emAndamento > 0) return `${emAndamento}.`;

  return `${contar(resumo.aFazer, "caderneta esperando para começar", "cadernetas esperando para começar")}.`;
}

function contar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function CartaoDeKpi({
  rotulo,
  valor,
  apoio,
  icone,
  destacado = false,
  atraso,
}: {
  rotulo: string;
  valor: number;
  apoio: string;
  icone: React.ReactNode;
  destacado?: boolean;
  atraso: number;
}) {
  const contagem = useCountUp(valor);

  return (
    <Card
      className="animate-rise transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${atraso}ms` }}
    >
      <CardHeader>
        <CardDescription>{rotulo}</CardDescription>
        <CardTitle
          className={cn(
            "font-mono text-4xl leading-none font-medium tabular-nums",
            destacado && "text-caderneta-parte",
          )}
        >
          {contagem}
        </CardTitle>
        <CardAction>
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-2xl [&_svg]:size-5",
              destacado
                ? "bg-caderneta-parte/12 text-caderneta-parte"
                : "bg-muted text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {icone}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{apoio}</CardContent>
    </Card>
  );
}

function ProgressoDoAnoLetivo({ resumo }: { resumo: ResumoDoPainel }) {
  const porcentagem = Math.round(resumo.progresso * 100);
  const contagem = useCountUp(porcentagem);

  const fatias = [
    { chave: "feitas", quantidade: resumo.feitas, classe: "bg-caderneta-parte" },
    {
      chave: "em-andamento",
      quantidade: resumo.emAndamento,
      classe: "bg-caderneta-parte-vazia",
    },
    { chave: "a-fazer", quantidade: resumo.aFazer, classe: "bg-muted" },
  ].filter((fatia) => fatia.quantidade > 0);

  return (
    <Card className="animate-rise" style={{ animationDelay: "300ms" }}>
      <CardHeader>
        <CardTitle>Progresso do ano letivo</CardTitle>
        <CardDescription>
          {contar(resumo.total, "caderneta", "cadernetas")}, somando as etapas de
          cada turma.
        </CardDescription>
        <CardAction>
          <span className="font-mono text-2xl font-medium text-caderneta-parte tabular-nums">
            {contagem}%
          </span>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div
          className="flex h-2.5 gap-[3px]"
          role="img"
          aria-label={`${resumo.feitas} feitas, ${resumo.emAndamento} em andamento e ${resumo.aFazer} a fazer`}
        >
          {fatias.map((fatia, indice) => (
            <span
              key={fatia.chave}
              className={cn(
                "origin-left animate-grow-x rounded-full",
                fatia.classe,
              )}
              style={{
                width: `${(fatia.quantidade / resumo.total) * 100}%`,
                animationDelay: `${360 + indice * 100}ms`,
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Legenda cor="bg-caderneta-parte" rotulo="Feitas" valor={resumo.feitas} />
          <Legenda
            cor="bg-caderneta-parte-vazia"
            rotulo="Em andamento"
            valor={resumo.emAndamento}
          />
          <Legenda cor="bg-muted" rotulo="A fazer" valor={resumo.aFazer} />
          {resumo.totalDeAulas > 0 && (
            <span className="ms-auto tabular-nums">
              {resumo.aulasPreenchidas} de {resumo.totalDeAulas} aulas lançadas
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Legenda({
  cor,
  rotulo,
  valor,
}: {
  cor: string;
  rotulo: string;
  valor: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full", cor)} aria-hidden="true" />
      {rotulo}
      <span className="font-mono text-foreground tabular-nums">{valor}</span>
    </span>
  );
}

function ParaRetomar({ cadernetas }: { cadernetas: CadernetaParaRetomar[] }) {
  return (
    <Card className="animate-rise" style={{ animationDelay: "380ms" }}>
      <CardHeader>
        <CardTitle>Retomar de onde parou</CardTitle>
        <CardDescription>
          As cadernetas mexidas por último, com o que falta em cada uma.
        </CardDescription>
        <CardAction>
          <Button variant="outline" asChild>
            <Link to="/cadernetas">Ver cadernetas</Link>
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col">
        {cadernetas.map((item, indice) => (
          <div
            key={item.caderneta.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <span className="flex min-w-52 flex-col gap-0.5">
              <span className="font-heading font-medium">
                {nomeCurtoDaTurma(item.caderneta.turma)}
              </span>
              <span className="text-sm text-muted-foreground">
                {item.professor.nome}
              </span>
            </span>

            {item.etapa && (
              <Badge variant="outline" className="shrink-0">
                {item.etapa}
              </Badge>
            )}

            <span className="flex min-w-40 flex-1 items-center gap-3">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-1.5 origin-left animate-grow-x rounded-full bg-caderneta-parte"
                  style={{
                    width: `${Math.round(item.progresso * 100)}%`,
                    animationDelay: `${520 + indice * 80}ms`,
                  }}
                />
              </span>
              <span className="w-10 text-right font-mono text-sm tabular-nums">
                {Math.round(item.progresso * 100)}%
              </span>
            </span>

            <span className="w-28 text-right text-sm text-muted-foreground">
              {descreverQuando(item.caderneta.syncedAt)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Vazio({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  acao: { para: string; rotulo: string };
}) {
  return (
    <div className="flex animate-rise flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
      {icone}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      <Button variant="outline" asChild>
        <Link to={acao.para}>{acao.rotulo}</Link>
      </Button>
    </div>
  );
}

/** O painel em cinza, do tamanho do que vem depois. */
function PainelSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((indice) => (
          <Skeleton key={indice} className="h-[8.25rem]" />
        ))}
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-56" />
    </div>
  );
}
