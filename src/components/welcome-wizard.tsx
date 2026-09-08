import * as React from "react";
import {
  IconActivity,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBook2,
  IconChalkboardTeacher,
  IconCheck,
  IconDeviceFloppy,
  IconFileText,
  IconFileTypePdf,
  IconListCheck,
  IconLock,
  IconPhoto,
  IconPlugConnected,
  IconSparkles,
  IconTable,
  IconUserCheck,
  IconX,
} from "@tabler/icons-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { markWelcomeAsSeen } from "@/lib/welcome";

interface Passo {
  /** Identifica o passo, e é por ela que os pontos de progresso se guiam. */
  chave: string;
  icone: React.ReactNode;
  titulo: string;
  resumo: string;
  /** O que o passo promete, uma linha cada. Três no máximo, de propósito. */
  pontos: string[];
  ilustracao: React.ReactNode;
}

/**
 * O guia segue a ordem em que o trabalho acontece: cadastra-se o professor,
 * abre-se a sessão no portal, a grade mostra o que falta, e só então as telas
 * que preenchem uma caderneta fazem sentido. O último passo é o que mais
 * importa — nada é escrito no portal pelas costas do auxiliar de ensino.
 */
const PASSOS: readonly Passo[] = [
  {
    chave: "boas-vindas",
    icone: <IconSparkles />,
    titulo: "Bem-vindo à Esmeraldinha",
    resumo:
      "Ela existe para uma coisa só: transformar o que os professores mandam — foto do caderno, PDF, uma mensagem de texto — em caderneta preenchida no portal.",
    pontos: [
      "Você é o auxiliar de ensino: recebe o material e comanda o preenchimento.",
      "O portal continua sendo o único lugar onde a caderneta existe de verdade.",
      "Este guia leva dois minutos e mostra o caminho inteiro.",
    ],
    ilustracao: <IlustracaoBoasVindas />,
  },
  {
    chave: "professores",
    icone: <IconChalkboardTeacher />,
    titulo: "Comece cadastrando o professor",
    resumo:
      "O portal não tem acesso delegado, então o professor entrega o login (CPF), a senha e a escola. É o que a Esmeraldinha usa para agir no lugar dele.",
    pontos: [
      "As credenciais são conferidas no portal antes de serem guardadas.",
      "A senha fica cifrada pelo chaveiro do sistema operacional, nunca em texto puro.",
      "Turmas e estudantes não são digitados: o cadastro os lê do portal na hora.",
    ],
    ilustracao: <IlustracaoProfessores />,
  },
  {
    chave: "sessao",
    icone: <IconPlugConnected />,
    titulo: "Abra a sessão no portal",
    resumo:
      "Em Cadernetas você escolhe de quem é o trabalho do momento, e a Esmeraldinha entra no portal com o login desse professor.",
    pontos: [
      "Uma sessão por vez: tudo o que você faz na tela acontece como aquele professor.",
      "Se a sessão cair por ociosidade, ela é reaberta sozinha sem perder o que você já preencheu.",
      "Trocar de professor encerra a sessão anterior.",
    ],
    ilustracao: <IlustracaoSessao />,
  },
  {
    chave: "grade",
    icone: <IconBook2 />,
    titulo: "A grade diz o que falta",
    resumo:
      "Uma linha por turma, uma coluna por etapa do ano letivo. Dentro de cada etapa, as quatro partes da caderneta.",
    pontos: [
      "O ponto ao lado de cada ícone vem do portal: pendente, parcial ou concluído.",
      "Conteúdo e boletim já abrem daqui; frequência e ficha de desempenho seguem manuais no portal.",
      "Atualizar uma caderneta é relê-la no portal — a leitura roda em segundo plano.",
    ],
    ilustracao: <IlustracaoGrade />,
  },
  {
    chave: "conteudo",
    icone: <IconBook />,
    titulo: "Lançar conteúdo, aula por aula",
    resumo:
      "As aulas datadas da etapa aparecem em lista, já com o que o portal tem escrito em cada uma.",
    pontos: [
      "Você edita código CR, desenvolvimento, ferramentas, recuperação e interação.",
      "Quem diz se uma aula está feita é o portal, não esta tela.",
      "O preenchimento vai para o Lançamento de Conteúdo uma aula por vez.",
    ],
    ilustracao: <IlustracaoConteudo />,
  },
  {
    chave: "boletim",
    icone: <IconListCheck />,
    titulo: "Lançar notas no boletim",
    resumo:
      "O boletim é uma grade de estudantes por avaliações da disciplina, mais a nota personalizada e a nota final da etapa.",
    pontos: [
      "As notas que o portal calcula aparecem para conferência e nunca são reescritas.",
      "As notas são chaveadas por matrícula, não por nome.",
      "O boletim inteiro é levado ao portal de uma vez, como o portal mesmo o mostra.",
    ],
    ilustracao: <IlustracaoBoletim />,
  },
  {
    chave: "upload-inteligente",
    icone: <IconSparkles />,
    titulo: "Upload Inteligente",
    resumo:
      "Cole o texto ou solte as fotos, PDFs, Word e Excel que o professor mandou. A Esmeraldinha lê o material e descobre a que caderneta ele pertence.",
    pontos: [
      "Não existe ordem certa de envio: turma, etapa e parte da caderneta saem do próprio material.",
      "Antes de qualquer coisa ir ao portal você recebe uma prévia, item por item.",
      "A prévia diz o que está pronto e o que falhou — e por quê.",
    ],
    ilustracao: <IlustracaoUpload />,
  },
  {
    chave: "quem-salva",
    icone: <IconDeviceFloppy />,
    titulo: "Quem salva é você",
    resumo:
      "Nada é gravado no portal pelas suas costas. A janela do portal abre na sua frente, já preenchida, e o botão de salvar continua sendo seu.",
    pontos: [
      "O material enviado não fica guardado no servidor.",
      "Cada item é conferido por você antes de virar registro.",
      "Deu tudo certo? Cadastre o primeiro professor e comece.",
    ],
    ilustracao: <IlustracaoQuemSalva />,
  },
];

export interface WelcomeWizardProps {
  onClose: () => void;
}

/**
 * O guia de boas-vindas: um passo por funcionalidade, na ordem em que o
 * trabalho acontece. Fechar de qualquer jeito — botão, Esc ou clique fora —
 * conta como visto, para não insistir com quem já leu.
 *
 * Quem o abre é quem o monta, como os outros modais da aplicação: assim
 * reabrir pelo cabeçalho recomeça do primeiro passo sem estado a zerar.
 */
export function WelcomeWizard({ onClose }: WelcomeWizardProps) {
  const [indice, setIndice] = React.useState(0);

  const passo = PASSOS[indice];
  const primeiro = indice === 0;
  const ultimo = indice === PASSOS.length - 1;

  function fechar() {
    markWelcomeAsSeen();
    onClose();
  }

  function avancar() {
    if (ultimo) {
      fechar();
      return;
    }
    setIndice((atual) => atual + 1);
  }

  function voltar() {
    setIndice((atual) => Math.max(0, atual - 1));
  }

  /** As setas do teclado andam pelo guia; o resto continua com o diálogo. */
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight" && !ultimo) {
      event.preventDefault();
      setIndice((atual) => atual + 1);
    }
    if (event.key === "ArrowLeft" && !primeiro) {
      event.preventDefault();
      voltar();
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader className="flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-5"
              aria-hidden="true"
            >
              {passo.icone}
            </span>
            <div className="flex flex-col gap-1">
              <DialogTitle className="font-heading">{passo.titulo}</DialogTitle>
              <DialogDescription>{passo.resumo}</DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={fechar}
            aria-label="Fechar o guia"
          >
            <IconX />
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {passo.ilustracao}

          <ul className="flex flex-col gap-2">
            {passo.pontos.map((ponto) => (
              <li key={ponto} className="flex items-start gap-2">
                <IconCheck
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="text-sm text-muted-foreground">{ponto}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Progresso
            indice={indice}
            onIr={setIndice}
          />

          <div className="flex items-center gap-2">
            {!ultimo && (
              <Button variant="ghost" onClick={fechar}>
                Pular guia
              </Button>
            )}
            {!primeiro && (
              <Button variant="outline" onClick={voltar}>
                <IconArrowLeft data-icon="inline-start" />
                Voltar
              </Button>
            )}
            {ultimo ? (
              <Button asChild onClick={fechar}>
                <Link to="/professores">
                  <IconChalkboardTeacher data-icon="inline-start" />
                  Cadastrar professor
                </Link>
              </Button>
            ) : (
              <Button onClick={avancar}>
                Próximo
                <IconArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Onde se está no guia, e um atalho para qualquer passo já visível. */
function Progresso({
  indice,
  onIr,
}: {
  indice: number;
  onIr: (indice: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <ol className="flex items-center gap-1.5">
        {PASSOS.map((passo, posicao) => (
          <li key={passo.chave}>
            <button
              type="button"
              onClick={() => onIr(posicao)}
              aria-label={`Passo ${posicao + 1}: ${passo.titulo}`}
              aria-current={posicao === indice ? "step" : undefined}
              className={cn(
                "block size-2 rounded-full transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                posicao === indice
                  ? "w-5 bg-primary"
                  : posicao < indice
                    ? "bg-primary/40"
                    : "bg-muted-foreground/25 hover:bg-muted-foreground/50",
              )}
            />
          </li>
        ))}
      </ol>
      <span className="text-xs text-muted-foreground tabular-nums">
        {indice + 1} de {PASSOS.length}
      </span>
    </div>
  );
}

/**
 * A moldura das ilustrações. Elas são esquemas, não capturas de tela: assim
 * acompanham os tokens do tema em vez de envelhecerem junto com a interface,
 * e valem no claro e no escuro sem uma segunda versão.
 */
function Quadro({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border bg-muted/40 p-4 dark:bg-muted/15",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Etiqueta({
  icone,
  children,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 rounded-xl border bg-background px-2.5 py-1.5 text-xs whitespace-nowrap [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
      {icone}
      {children}
    </span>
  );
}

function IlustracaoBoasVindas() {
  return (
    <Quadro className="flex flex-wrap items-center justify-center gap-4">
      <div className="flex flex-col gap-1.5">
        <Etiqueta icone={<IconPhoto />}>Foto do caderno</Etiqueta>
        <Etiqueta icone={<IconFileTypePdf />}>PDF do plano de aula</Etiqueta>
        <Etiqueta icone={<IconFileText />}>Texto no WhatsApp</Etiqueta>
      </div>

      <IconArrowRight className="size-5 text-muted-foreground" />

      <span className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <IconBook2 className="size-4.5" />
        Caderneta preenchida no portal
      </span>
    </Quadro>
  );
}

function IlustracaoProfessores() {
  return (
    <Quadro className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-medium text-primary">
          ME
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Maria Esmeralda da Silva</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            •••.•••.•••-00 • E.M. Limoeiro de Anadia
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta icone={<IconLock />}>Senha cifrada pelo chaveiro</Etiqueta>
        <Etiqueta icone={<IconCheck />}>3 turmas lidas do portal</Etiqueta>
        <Etiqueta icone={<IconUserCheck />}>72 estudantes</Etiqueta>
      </div>
    </Quadro>
  );
}

function IlustracaoSessao() {
  return (
    <Quadro className="flex flex-wrap items-center justify-center gap-3">
      <span className="flex h-8 items-center gap-2 rounded-2xl border bg-background px-3 text-xs">
        <span className="relative inline-flex size-2">
          <span className="absolute inline-flex size-2 animate-ping-ring rounded-full bg-primary/50" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Conectando…
      </span>

      <IconArrowRight className="size-4 text-muted-foreground" />

      <span className="flex h-8 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary">
        <span className="inline-flex size-2 rounded-full bg-primary" />
        Conectado como Maria Esmeralda
      </span>
    </Quadro>
  );
}

/** As partes da caderneta, na mesma ordem e com os mesmos ícones da grade. */
const PARTES_ILUSTRADAS = [
  { icone: <IconBook />, disponivel: true },
  { icone: <IconListCheck />, disponivel: true },
  { icone: <IconUserCheck />, disponivel: false },
  { icone: <IconActivity />, disponivel: false },
] as const;

type EstadoIlustrado = "concluido" | "parcial" | "pendente";

const LINHAS_DA_GRADE: {
  turma: string;
  etapas: EstadoIlustrado[];
}[] = [
  { turma: "PRÉ-ESCOLA II - C", etapas: ["concluido", "parcial", "pendente"] },
  { turma: "1º ANO - A", etapas: ["concluido", "pendente", "pendente"] },
];

function IlustracaoGrade() {
  return (
    <Quadro className="overflow-x-auto p-0">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Turma</th>
            {["1ª etapa", "2ª etapa", "3ª etapa"].map((etapa) => (
              <th key={etapa} className="px-3 py-2 text-center font-medium">
                {etapa}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINHAS_DA_GRADE.map((linha) => (
            <tr key={linha.turma} className="border-b last:border-b-0">
              <th
                scope="row"
                className="px-3 py-2.5 text-left font-heading font-medium whitespace-nowrap"
              >
                {linha.turma}
              </th>
              {linha.etapas.map((estado, posicao) => (
                <td key={posicao} className="px-3 py-2.5">
                  <span className="flex items-center justify-center gap-2">
                    {PARTES_ILUSTRADAS.map((parte, indice) => (
                      <span
                        key={indice}
                        className="flex flex-col items-center gap-1"
                      >
                        <span
                          className={cn(
                            "[&_svg]:size-4",
                            parte.disponivel
                              ? "text-caderneta-parte"
                              : "text-caderneta-parte-futura",
                          )}
                        >
                          {parte.icone}
                        </span>
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            !parte.disponivel || estado === "pendente"
                              ? "bg-muted-foreground/40"
                              : estado === "parcial"
                                ? "bg-background ring-2 ring-caderneta-parte ring-inset"
                                : "bg-caderneta-parte",
                          )}
                        />
                      </span>
                    ))}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Quadro>
  );
}

const AULAS_ILUSTRADAS = [
  { data: "03/03", ordem: "1ª aula", conteudo: "Números até 20", feita: true },
  { data: "05/03", ordem: "1ª aula", conteudo: "Adição com material dourado", feita: true },
  { data: "10/03", ordem: "2ª aula", conteudo: "", feita: false },
];

function IlustracaoConteudo() {
  return (
    <Quadro className="flex flex-col gap-2 p-3">
      {AULAS_ILUSTRADAS.map((aula) => (
        <div
          key={`${aula.data}-${aula.ordem}`}
          className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2 text-xs"
        >
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm border",
              aula.feita && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {aula.feita && <IconCheck className="size-3" />}
          </span>
          <span className="font-mono tabular-nums">{aula.data}</span>
          <span className="text-muted-foreground">{aula.ordem}</span>
          <span
            className={cn(
              "truncate",
              !aula.conteudo && "text-muted-foreground italic",
            )}
          >
            {aula.conteudo || "sem conteúdo lançado"}
          </span>
        </div>
      ))}
    </Quadro>
  );
}

const NOTAS_ILUSTRADAS = [
  { estudante: "Ana Beatriz", matricula: "20240117", notas: ["8,0", "9,5", "8,8"] },
  { estudante: "Carlos Eduardo", matricula: "20240118", notas: ["7,5", "7,0", "7,3"] },
];

function IlustracaoBoletim() {
  return (
    <Quadro className="overflow-x-auto p-0">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Estudante</th>
            {["Observação", "Trabalho", "Nota final"].map((coluna) => (
              <th key={coluna} className="px-3 py-2 text-center font-medium">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NOTAS_ILUSTRADAS.map((linha) => (
            <tr key={linha.matricula} className="border-b last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex flex-col">
                  {linha.estudante}
                  <span className="font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                    matrícula {linha.matricula}
                  </span>
                </span>
              </th>
              {linha.notas.map((nota, indice) => (
                <td key={indice} className="px-3 py-2 text-center">
                  <span
                    className={cn(
                      "inline-flex h-6 w-12 items-center justify-center rounded-lg border bg-background font-mono tabular-nums",
                      indice === linha.notas.length - 1 &&
                        "border-primary/40 bg-primary/10 text-primary",
                    )}
                  >
                    {nota}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Quadro>
  );
}

function IlustracaoUpload() {
  return (
    <Quadro className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Etiqueta icone={<IconPhoto />}>caderno-marco.jpg</Etiqueta>
        <Etiqueta icone={<IconFileTypePdf />}>plano-2a-etapa.pdf</Etiqueta>
        <Etiqueta icone={<IconTable />}>notas.xlsx</Etiqueta>
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl border bg-background p-3 text-xs">
        <span className="flex items-center gap-2 font-medium">
          <IconSparkles className="size-3.5 text-primary" />
          Prévia: PRÉ-ESCOLA II - C • 2ª etapa • conteúdo
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <IconCheck className="size-3.5 text-primary" />
          12 aulas prontas para o portal
        </span>
        <span className="flex items-center gap-2 text-destructive">
          <IconX className="size-3.5" />1 aula sem data legível
        </span>
      </div>
    </Quadro>
  );
}

function IlustracaoQuemSalva() {
  return (
    <Quadro className="flex flex-col gap-0 p-0">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 text-xs text-muted-foreground">
          Portal do Professor — Lançamento de Conteúdo
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3 text-xs">
        <span className="h-2 w-4/5 rounded-full bg-muted-foreground/15" />
        <span className="h-2 w-3/5 rounded-full bg-muted-foreground/15" />
        <span className="h-2 w-2/3 rounded-full bg-muted-foreground/15" />
        <span className="mt-1 flex items-center justify-end gap-2">
          <span className="text-muted-foreground">preenchido pela Esmeraldinha</span>
          <span className="flex h-7 items-center gap-1.5 rounded-2xl bg-primary px-3 font-medium text-primary-foreground ring-3 ring-primary/25">
            <IconDeviceFloppy className="size-3.5" />
            Salvar
          </span>
        </span>
      </div>
    </Quadro>
  );
}
