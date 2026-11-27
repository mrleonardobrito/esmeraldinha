import * as React from "react";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconLoader,
  IconSend,
  IconSparkles,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  gerarRascunhosDeNotas,
  type EstudanteNoChatDeNotas,
  type NotasDoChat,
} from "@/lib/cadernetas";
import { cn } from "@/lib/utils";

type MensagemNaTela =
  | { papel: "auxiliar"; texto: string }
  | { papel: "assistente"; texto: string; falhas: NotasDoChat["falhas"] };

export interface ChatDeNotasProps {
  cadernetaId: string;
  etapa: string;
  turma?: string;
  disciplina: string | null;
  /** The grid as it is right now, read at send time. */
  estudantes: () => EstudanteNoChatDeNotas[];
  onNotas: (notas: NotasDoChat["notas"]) => void;
  disabled: boolean;
}

/**
 * The chat de notas: the auxiliar describes how the turma did and the agent
 * answers with notas finais, which land on the grid as edits. Nothing here
 * reaches the portal.
 */
export function ChatDeNotas({
  cadernetaId,
  etapa,
  turma,
  disciplina,
  estudantes,
  onNotas,
  disabled,
}: ChatDeNotasProps) {
  const [aberto, setAberto] = React.useState(false);
  const [mensagens, setMensagens] = React.useState<MensagemNaTela[]>([]);
  const [texto, setTexto] = React.useState("");
  const [gerando, setGerando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);

  const podeEnviar = texto.trim().length > 0 && !gerando && !disabled;

  async function enviar() {
    if (!podeEnviar) return;

    const conversa: MensagemNaTela[] = [...mensagens, { papel: "auxiliar", texto: texto.trim() }];
    setMensagens(conversa);
    setTexto("");
    setErro(null);
    setGerando(true);
    controller.current = new AbortController();

    try {
      const resultado = await gerarRascunhosDeNotas(
        cadernetaId,
        etapa,
        {
          disciplina,
          mensagens: conversa.map(({ papel, texto: conteudo }) => ({ papel, texto: conteudo })),
          estudantes: estudantes(),
        },
        controller.current.signal,
        turma,
      );

      setMensagens([
        ...conversa,
        { papel: "assistente", texto: resultado.resposta, falhas: resultado.falhas },
      ]);
      onNotas(resultado.notas);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErro(error instanceof Error ? error.message : "Não foi possível falar com o agente.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card">
      <button
        type="button"
        className="flex items-center justify-between gap-2 px-3 py-2.5 text-left font-heading text-sm font-medium"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
      >
        <span className="flex items-center gap-2">
          <IconSparkles className="size-4 text-muted-foreground" />
          Chat de notas
        </span>
        <IconChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", aberto && "rotate-180")}
        />
      </button>

      {aberto && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Conte como a turma foi — por exemplo, “a turma foi acima da média,
              mas Fulano não alcançou a média”. As notas aparecem na grade para
              você conferir antes de preencher no sistema.
            </p>
          ) : (
            <div className="flex max-h-56 flex-col gap-3 overflow-y-auto">
              {mensagens.map((mensagem, indice) => (
                <Mensagem key={indice} mensagem={mensagem} />
              ))}
            </div>
          )}

          {erro && (
            <p className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
              {erro}
            </p>
          )}

          <div
            className={cn(
              "flex items-end gap-2 rounded-2xl border border-input bg-card px-3 py-2.5",
              disabled && "opacity-60",
            )}
          >
            <Textarea
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void enviar();
                }
              }}
              placeholder="Como a turma foi nesta etapa?"
              disabled={disabled || gerando}
              className="min-h-11 border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
              aria-label="Mensagem para o agente"
            />
            <Button size="sm" onClick={() => void enviar()} disabled={!podeEnviar}>
              {gerando ? (
                <IconLoader data-icon="inline-start" className="animate-spin" />
              ) : (
                <IconSend data-icon="inline-start" />
              )}
              Enviar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Mensagem({ mensagem }: { mensagem: MensagemNaTela }) {
  if (mensagem.papel === "auxiliar") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-[18px_18px_6px_18px] bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
          {mensagem.texto}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <span className="-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-caderneta-parte">
        <IconSparkles className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <p className="whitespace-pre-wrap">{mensagem.texto}</p>
        {mensagem.falhas.map((falha, indice) => (
          <p key={indice} className="text-destructive">
            {falha.estudante}: {falha.motivo}
          </p>
        ))}
      </div>
    </div>
  );
}
