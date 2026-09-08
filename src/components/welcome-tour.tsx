import * as React from "react";
import {
  IconBook2,
  IconChalkboardTeacher,
  IconHeart,
  IconLoader,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import {
  EVENTS,
  Joyride,
  type EventData,
  type Step,
  type TooltipRenderProps,
} from "react-joyride";
import { useLocation, useNavigate, type NavigateFunction } from "react-router";

import { SinalDeConexao } from "@/components/sinal-de-conexao";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { markWelcomeAsSeen } from "@/lib/welcome";

/** O ícone de cada passo, que o balão desenha ao lado do título. */
interface DadosDoPasso {
  icone: React.ReactNode;
}

export interface WelcomeTourProps {
  onClose: () => void;
}

/**
 * O passeio guiado pelas funcionalidades, na ordem em que o trabalho acontece:
 * cadastrar o professor, cadastrar as cadernetas dele e mandar o material que
 * ele enviou. Cada passo acende o botão de verdade na tela de verdade — por
 * isso o guia troca de página sozinho antes de apontar.
 */
export function WelcomeTour({ onClose }: WelcomeTourProps) {
  const navegar = useNavigate();
  const localizacao = useLocation();
  // De onde o passeio partiu. Quem pediu o guia no meio do trabalho volta para
  // a tela onde estava; quem abriu o sistema agora volta para o começo dele.
  const origem = React.useRef(localizacao.pathname);
  const passos = React.useMemo(() => construirPassos(navegar), [navegar]);

  function encerrar() {
    markWelcomeAsSeen();
    navegar(origem.current);
    onClose();
  }

  return (
    <Joyride
      continuous
      run
      steps={passos}
      tooltipComponent={Balao}
      onEvent={(evento: EventData) => {
        if (evento.type === EVENTS.TOUR_END) encerrar();
      }}
      // Os textos dos botões, que o balão também usa como nome acessível.
      locale={{
        back: "Voltar",
        close: "Fechar o guia",
        last: "Vamos lá",
        next: "Próximo",
        open: "Abrir o guia",
        skip: "Pular o guia",
      }}
      options={{
        // O × fecha o guia inteiro em vez de pular para o passo seguinte, e um
        // clique fora não descarta nada: sair é uma decisão, não um deslize.
        closeButtonAction: "skip",
        overlayClickAction: false,
        skipBeacon: true,
        overlayColor: "oklch(0 0 0 / 0.45)",
        arrowColor: "var(--popover)",
        spotlightPadding: 8,
        // O mesmo arredondamento dos cartões, para o recorte não destoar.
        spotlightRadius: 16,
        // Acima dos modais do sistema, que param no 50.
        zIndex: 60,
      }}
    />
  );
}

function construirPassos(navegar: NavigateFunction): Step[] {
  return [
    {
      title: "Cadastro de professor",
      data: { icone: <IconChalkboardTeacher /> } satisfies DadosDoPasso,
      target: () => alvo(BOTAO_NOVO_PROFESSOR),
      placement: "bottom-end",
      before: () => abrir(navegar, "/professores", BOTAO_NOVO_PROFESSOR),
      content: <PassoDoProfessor />,
    },
    {
      title: "Cadastro de cadernetas",
      data: { icone: <IconBook2 /> } satisfies DadosDoPasso,
      target: () => alvo(BOTAO_NOVA_CADERNETA, CABECALHO_DAS_CADERNETAS),
      placement: "bottom-end",
      before: () =>
        abrir(navegar, "/cadernetas", BOTAO_NOVA_CADERNETA, CABECALHO_DAS_CADERNETAS),
      content: <PassoDaCaderneta />,
    },
    {
      title: "Upload Inteligente",
      data: { icone: <IconSparkles /> } satisfies DadosDoPasso,
      target: () => alvo(BOTAO_UPLOAD_INTELIGENTE, CABECALHO_DAS_CADERNETAS),
      placement: "bottom-start",
      before: () =>
        abrir(
          navegar,
          "/cadernetas",
          BOTAO_UPLOAD_INTELIGENTE,
          CABECALHO_DAS_CADERNETAS,
        ),
      content: <PassoDoUpload />,
    },
    {
      title: "É isso, meu bem",
      data: { icone: <IconHeart /> } satisfies DadosDoPasso,
      target: "body",
      placement: "center",
      content: <PassoFinal />,
    },
  ];
}

const BOTAO_NOVO_PROFESSOR = '[data-tour="novo-professor"]';
const BOTAO_NOVA_CADERNETA = '[data-tour="nova-caderneta"]';
const BOTAO_UPLOAD_INTELIGENTE = '[data-tour="upload-inteligente"]';
/**
 * O alvo reserva dos passos das cadernetas: os botões deles só existem com uma
 * sessão no portal aberta, e no primeiro dia não há nem professor cadastrado.
 * Sem sessão o guia aponta o cabeçalho da tela, que existe em todo estado dela.
 *
 * O seletor é preso à tela de cadernetas de propósito. A troca de página só
 * termina no render seguinte, e um cabeçalho solto casaria com o da tela
 * anterior — o balão nasceria grudado num elemento que já saiu do documento.
 */
const CABECALHO_DAS_CADERNETAS =
  '[data-tour="cadernetas"] [data-slot="card-header"]';

/** O primeiro dos seletores que já esteja na tela. */
function alvo(...seletores: string[]): HTMLElement | null {
  for (const seletor of seletores) {
    const elemento = document.querySelector<HTMLElement>(seletor);
    if (elemento) return elemento;
  }

  return null;
}

/**
 * Leva a tela até a rota do passo e espera o alvo montar. O guia é dono da
 * navegação: apontar um botão exige que ele esteja na tela, e a troca de
 * página desmonta tudo antes de montar o que vem.
 */
async function abrir(
  navegar: NavigateFunction,
  rota: string,
  ...seletores: string[]
): Promise<void> {
  navegar(rota);
  await esperar(seletores);
}

/** Desiste depois de um tempo: um guia preso é pior do que um guia torto. */
function esperar(seletores: string[], limite = 2000): Promise<void> {
  return new Promise((resolve) => {
    const prazo = performance.now() + limite;

    const procurar = () => {
      if (alvo(...seletores) || performance.now() > prazo) {
        resolve();
        return;
      }

      requestAnimationFrame(procurar);
    };

    requestAnimationFrame(procurar);
  });
}

/** O balão do guia, com a mesma carcaça dos modais do sistema. */
function Balao({
  backProps,
  closeProps,
  index,
  isLastStep,
  primaryProps,
  size,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const { icone } = (step.data ?? {}) as DadosDoPasso;

  return (
    <div
      {...tooltipProps}
      className="flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-4 rounded-[min(var(--radius-4xl),24px)] bg-popover p-5 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary [&>svg]:size-5">
          {icone}
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <h2 className="font-heading text-base leading-tight font-medium">
            {step.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            Passo {index + 1} de {size}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" {...closeProps}>
          <IconX />
        </Button>
      </div>

      <div className="flex flex-col gap-3">{step.content}</div>

      <div className="flex items-center justify-between gap-3">
        <Progresso atual={index} total={size} />
        <div className="flex items-center gap-2">
          {index > 0 && (
            <Button variant="ghost" {...backProps}>
              {step.locale.back}
            </Button>
          )}
          <Button {...primaryProps}>
            {isLastStep ? step.locale.last : step.locale.next}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Progresso({ atual, total }: { atual: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, indice) => (
        <span
          key={indice}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            indice === atual ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

function PassoDoProfessor() {
  return (
    <>
      <p>
        Tudo começa aqui. Sem o login do professor a Esmeraldinha não tem como
        entrar no portal por ele — e é entrando por ele que ela preenche.
      </p>
      <Lista
        titulo="Você informa"
        itens={[
          "Nome, para achar o professor nas listas.",
          <>
            <strong className="font-medium">Login (CPF) e senha</strong> do
            portal, os mesmos que o professor usa.
          </>,
          "Escola e, se quiser, uma foto.",
        ]}
      />
      <Lista
        titulo="A Esmeraldinha faz sozinha"
        itens={[
          "Confere as credenciais no portal antes de guardar: senha que não loga não vira cadastro.",
          "Lê as turmas do professor e os estudantes de cada uma, com matrícula e situação.",
          "Guarda a senha cifrada — em texto puro ela não fica em lugar nenhum.",
        ]}
      />
    </>
  );
}

function PassoDaCaderneta() {
  return (
    <>
      <p>
        Escolhido o professor, a Esmeraldinha abre uma sessão no portal com o
        login dele. É essa sessão que lê e grava — o selo diz em que pé ela
        está.
      </p>
      <Legenda
        itens={[
          {
            simbolo: <SinalDeConexao estado="connecting" />,
            texto:
              "Entrando no portal. Leva alguns segundos, e enquanto isso a tela mostra em cinza o que vem depois.",
          },
          {
            simbolo: <SinalDeConexao estado="connected" />,
            texto: "Sessão de pé. Daqui em diante dá para cadastrar e preencher.",
          },
        ]}
      />
      <p>
        Em <strong className="font-medium">Nova caderneta</strong> ficam as
        turmas que o portal diz que são desse professor. Marque as que ele
        pediu: cada turma marcada vira uma caderneta.
      </p>
      <Legenda
        titulo="Enquanto o sistema lê o portal"
        itens={[
          {
            simbolo: (
              <span className="inline-flex text-muted-foreground">
                <IconLoader className="size-4 animate-spin" aria-hidden="true" />
              </span>
            ),
            texto:
              "A turma está sendo lida agora, em segundo plano. A grade se atualiza sozinha quando termina.",
          },
          {
            simbolo: (
              <span
                className="size-3.5 rounded-full bg-background ring-2 ring-caderneta-parte ring-inset animate-pulse"
                aria-hidden="true"
              />
            ),
            texto: "Essa parte da etapa está sendo preenchida neste momento.",
          },
          {
            simbolo: (
              <Skeleton className="h-4 w-10 rounded-md" aria-hidden="true" />
            ),
            texto:
              "Cinza é a primeira leitura: a Esmeraldinha ainda não sabe o que tem lá.",
          },
        ]}
      />
    </>
  );
}

function PassoDoUpload() {
  return (
    <>
      <p>
        O professor manda o material do jeito dele — texto no WhatsApp, foto do
        caderno, PDF, Word, planilha. Aqui você joga isso dentro sem separar
        nada: o sistema lê e descobre a turma, a etapa, o mês e se aquilo é
        conteúdo de aula ou nota de estudante.
      </p>
      <Passos
        itens={[
          <>
            Clique em{" "}
            <strong className="font-medium">Upload Inteligente</strong>.
          </>,
          "Cole o texto ou solte os arquivos na área de envio — pode ser tudo de uma vez.",
          <>
            Clique em <strong className="font-medium">Analisar</strong> e confira
            o que ele entendeu: turma, etapa e cada aula que vai preencher.
          </>,
          "Mande preencher. O sistema abre uma aula de cada vez no portal e grava; a grade acompanha.",
        ]}
      />
    </>
  );
}

function PassoFinal() {
  return (
    <>
      <p>
        É isso: cadastre o professor, cadastre as cadernetas dele e mande o
        material. O resto do caminho até o portal é com a Esmeraldinha.
      </p>
      <p>
        Para rever este passeio, o{" "}
        <strong className="font-medium">?</strong> no alto da tela traz ele de
        volta a qualquer hora.
      </p>
      <p className="text-muted-foreground">Aproveite o sistema, meu bem. 💚</p>
    </>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: React.ReactNode[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Titulo>{titulo}</Titulo>
      <ul className="flex flex-col gap-1.5">
        {itens.map((item, indice) => (
          <li key={indice} className="flex gap-2">
            <span
              className="mt-2 size-1 shrink-0 rounded-full bg-caderneta-parte"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Passos({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {itens.map((item, indice) => (
        <li key={indice} className="flex gap-2">
          <span
            className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-medium text-primary tabular-nums"
            aria-hidden="true"
          >
            {indice + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Um símbolo da tela ao lado do que ele quer dizer. */
function Legenda({
  titulo,
  itens,
}: {
  titulo?: string;
  itens: { simbolo: React.ReactNode; texto: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
      {titulo && <Titulo>{titulo}</Titulo>}
      {itens.map((item, indice) => (
        <div key={indice} className="flex items-center gap-3">
          <span className="flex w-28 shrink-0 justify-center">
            {item.simbolo}
          </span>
          <span className="text-xs text-muted-foreground">{item.texto}</span>
        </div>
      ))}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}
