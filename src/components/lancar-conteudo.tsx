import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconLoader,
  IconUpload,
} from "@tabler/icons-react";

import { EditarAula } from "@/components/editar-aula";
import { EnvioDeMaterial } from "@/components/envio-de-material";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadAulasDaEtapa, type AulaDaCaderneta, type Caderneta } from "@/lib/cadernetas";
import { cn } from "@/lib/utils";

type Estado =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; aulas: AulaDaCaderneta[] };

export interface LancarConteudoProps {
  caderneta: Caderneta;
  etapa: string;
  sessionId: string;
  onClose: () => void;
  /** Chamado quando um envio grava algo, para a grade recarregar. */
  onGravou: () => void;
}

/**
 * A tela de lançar conteúdo: as aulas datadas da etapa, uma por linha, com o
 * que já está preenchido no portal. O checkbox é só leitura — quem decide se
 * uma aula está feita é o portal, não esta tela.
 */
export function LancarConteudo({
  caderneta,
  etapa,
  sessionId,
  onClose,
  onGravou,
}: LancarConteudoProps) {
  const [estado, setEstado] = React.useState<Estado>({ status: "loading" });
  const [enviandoPara, setEnviandoPara] = React.useState<AulaDaCaderneta | null>(null);
  const [editando, setEditando] = React.useState<AulaDaCaderneta | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    loadAulasDaEtapa(caderneta.id, etapa)
      .then((aulas) => {
        if (!cancelled) setEstado({ status: "ready", aulas });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEstado({
          status: "error",
          message:
            error instanceof Error ? error.message : "Não foi possível ler as aulas.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caderneta.id, etapa, reloadToken]);

  function recarregar() {
    setReloadToken((atual) => atual + 1);
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Lançar Conteúdo</DialogTitle>
          <DialogDescription>
            {caderneta.turma} <span aria-hidden="true">•</span> {etapa}
          </DialogDescription>
        </DialogHeader>

        {enviandoPara ? (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setEnviandoPara(null)}
            >
              <IconArrowLeft data-icon="inline-start" />
              Voltar para as aulas
            </Button>

            <p className="text-sm text-muted-foreground">
              Enviando material da aula de{" "}
              <span className="tabular-nums">{enviandoPara.data}</span>
              {enviandoPara.ordem !== null && ` (ordem ${enviandoPara.ordem})`}.
            </p>

            <EnvioDeMaterial
              sessionId={sessionId}
              professorId={caderneta.professorId}
              cadernetaId={caderneta.id}
              semCard
              onGravou={() => {
                setEnviandoPara(null);
                recarregar();
                onGravou();
              }}
            />
          </div>
        ) : (
          <ListaDeAulas
            estado={estado}
            onEnviar={setEnviandoPara}
            onEditar={setEditando}
            onTentarDeNovo={recarregar}
          />
        )}
      </DialogContent>

      {editando && (
        <EditarAula
          caderneta={caderneta}
          aula={editando}
          onClose={() => setEditando(null)}
        />
      )}
    </Dialog>
  );
}

function ListaDeAulas({
  estado,
  onEnviar,
  onEditar,
  onTentarDeNovo,
}: {
  estado: Estado;
  onEnviar: (aula: AulaDaCaderneta) => void;
  onEditar: (aula: AulaDaCaderneta) => void;
  onTentarDeNovo: () => void;
}) {
  if (estado.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
        <IconLoader className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando aulas…</p>
      </div>
    );
  }

  if (estado.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/30 bg-destructive/10 px-6 py-12 text-center">
        <IconAlertTriangle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{estado.message}</p>
        <Button variant="outline" onClick={onTentarDeNovo}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (estado.aulas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm font-medium">Nenhuma aula nesta etapa</p>
        <p className="text-sm text-muted-foreground">
          O portal não lista aulas para esta turma nesta etapa. Sincronize a
          caderneta se isso mudou.
        </p>
      </div>
    );
  }

  const meses = agruparPorMes(estado.aulas);

  return (
    <Accordion type="multiple" className="min-h-0 overflow-y-auto">
      {meses.map((mes) => (
        <AccordionItem key={mes.nome} value={mes.nome}>
          <AccordionTrigger>
            <span className="flex items-baseline gap-2">
              {mes.nome}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {mes.preenchidas}/{mes.aulas.length} preenchidas
              </span>
            </span>
          </AccordionTrigger>

          <AccordionContent>
            <ul className="flex flex-col gap-2">
              {mes.aulas.map((aula) => (
                <li
                  key={`${aula.data}-${aula.ordem ?? "s"}`}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border px-3 py-2.5",
                    aula.conteudoPreenchido && "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onEditar(aula)}
                      className="flex min-w-0 flex-1 flex-col items-start rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                      aria-label={`Editar o conteúdo da aula de ${aula.data}`}
                    >
                      <span className="text-sm font-medium tabular-nums">
                        Aula {aula.data}
                      </span>
                      {aula.ordem !== null && (
                        <span className="text-xs text-muted-foreground">
                          ordem {aula.ordem}
                        </span>
                      )}
                    </button>

                    <div className="flex shrink-0 items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEnviar(aula)}
                        aria-label={`Enviar conteúdo da aula de ${aula.data}`}
                      >
                        <IconUpload />
                      </Button>

                      <Checkbox
                        checked={aula.conteudoPreenchido}
                        disabled
                        aria-label={
                          aula.conteudoPreenchido
                            ? `Aula de ${aula.data} já preenchida no portal`
                            : `Aula de ${aula.data} ainda pendente`
                        }
                      />
                    </div>
                  </div>

                  <ConteudoDaAula aula={aula} />
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/**
 * O que o portal já tem escrito na linha da aula. Some quando a aula está em
 * branco lá: a linha continua sendo um convite a enviar material.
 */
function ConteudoDaAula({ aula }: { aula: AulaDaCaderneta }) {
  const campos = [
    { rotulo: "Código CR", texto: aula.codigoCR },
    { rotulo: "Desenvolvimento / Metodologia", texto: aula.desenvolvimento },
    { rotulo: "Ferramentas utilizadas", texto: aula.ferramentas },
  ].filter((campo): campo is { rotulo: string; texto: string } => campo.texto !== null);

  if (campos.length === 0) return null;

  return (
    <dl className="flex flex-col gap-2 border-t pt-2">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">{campo.rotulo}</dt>
          <dd className="text-xs whitespace-pre-wrap text-foreground/80">
            {campo.texto}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface MesDeAulas {
  nome: string;
  aulas: AulaDaCaderneta[];
  preenchidas: number;
}

/** Os meses na ordem em que o portal lista as aulas. */
function agruparPorMes(aulas: AulaDaCaderneta[]): MesDeAulas[] {
  const meses: MesDeAulas[] = [];

  for (const aula of aulas) {
    let mes = meses.find((candidato) => candidato.nome === aula.mes);

    if (!mes) {
      mes = { nome: aula.mes, aulas: [], preenchidas: 0 };
      meses.push(mes);
    }

    mes.aulas.push(aula);
    if (aula.conteudoPreenchido) mes.preenchidas += 1;
  }

  return meses;
}
