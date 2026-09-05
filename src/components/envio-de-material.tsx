import * as React from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconFile,
  IconLoader,
  IconPaperclip,
  IconSend,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { enviarMaterial, type EnvioResultado } from "@/lib/envios";

const ACCEPT = "image/*,application/pdf,text/plain,text/markdown";

export interface EnvioDeMaterialProps {
  sessionId: string;
  /** Quando o envio sai de dentro de uma caderneta, o progresso dela sobe junto. */
  cadernetaId?: string;
  /** Sem moldura de card, para quando o envio já está dentro de um modal. */
  semCard?: boolean;
  onGravou?: () => void;
}

/**
 * O auxiliar de ensino não escolhe turma, etapa nem mês: quem descobre isso é
 * o agente, lendo o material. Aqui só se entrega o que o professor mandou.
 */
export function EnvioDeMaterial({
  sessionId,
  cadernetaId,
  semCard,
  onGravou,
}: EnvioDeMaterialProps) {
  const [texto, setTexto] = React.useState("");
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [resultado, setResultado] = React.useState<EnvioResultado | null>(null);
  const [arrastando, setArrastando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function adicionar(novos: FileList | null) {
    if (!novos?.length) return;
    setArquivos((atuais) => [...atuais, ...Array.from(novos)]);
  }

  function remover(indice: number) {
    setArquivos((atuais) => atuais.filter((_, i) => i !== indice));
  }

  async function enviar() {
    setEnviando(true);
    setErro(null);
    setResultado(null);

    try {
      const enviado = await enviarMaterial(sessionId, { texto, arquivos, cadernetaId });
      setResultado(enviado);
      setTexto("");
      setArquivos([]);
      toast.success(
        `${enviado.resultado.succeeded.length} aula(s) gravada(s) em ${enviado.plano.turma}.`,
      );

      if (enviado.resultado.succeeded.length > 0) onGravou?.();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o material.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const vazio = !texto.trim() && arquivos.length === 0;

  const corpo = (
    <>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(event) => {
            event.preventDefault();
            setArrastando(false);
            adicionar(event.dataTransfer.files);
          }}
          className={`rounded-2xl border border-dashed transition-colors ${
            arrastando ? "border-primary bg-primary/5" : "border-input"
          }`}
        >
          <textarea
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            disabled={enviando}
            rows={6}
            placeholder="Cole aqui o que o professor mandou…"
            className="min-h-32 w-full resize-y bg-transparent p-3 text-sm outline-none disabled:opacity-60"
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            adicionar(event.target.files);
            event.target.value = "";
          }}
        />

        {arquivos.length > 0 && (
          <ul className="flex flex-col gap-1">
            {arquivos.map((arquivo, indice) => (
              <li
                key={`${arquivo.name}-${indice}`}
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
              >
                <IconFile className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{arquivo.name}</span>
                <span className="ml-auto shrink-0 tabular-nums text-xs text-muted-foreground">
                  {Math.max(1, Math.round(arquivo.size / 1024))} KB
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remover(indice)}
                  disabled={enviando}
                  aria-label={`Remover ${arquivo.name}`}
                >
                  <IconX />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            <IconPaperclip data-icon="inline-start" />
            Anexar arquivos
          </Button>
          <Button onClick={() => void enviar()} disabled={enviando || vazio}>
            {enviando ? (
              <IconLoader className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconSend data-icon="inline-start" />
            )}
            {enviando ? "Lendo e gravando…" : "Enviar"}
          </Button>
        </div>

        {erro && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {resultado && <Resultado resultado={resultado} />}
    </>
  );

  if (semCard) {
    return <div className="flex flex-col gap-3">{corpo}</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar material do professor</CardTitle>
        <CardDescription>
          Cole o texto ou solte as fotos e PDFs que o professor mandou. A
          Esmeraldinha descobre a turma, a etapa e o mês e grava no portal.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">{corpo}</CardContent>
    </Card>
  );
}

function Resultado({ resultado }: { resultado: EnvioResultado }) {
  const { plano, resultado: escrita } = resultado;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{plano.turma}</Badge>
        <Badge variant="outline">{plano.etapa}</Badge>
        <Badge variant="outline">{plano.mes}</Badge>
      </div>

      {plano.observacao && (
        <p className="text-sm text-muted-foreground">{plano.observacao}</p>
      )}

      {escrita.succeeded.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            Gravadas ({escrita.succeeded.length})
          </p>
          {escrita.succeeded.map((aula) => (
            <p key={aula} className="flex items-center gap-2 text-sm">
              <IconCheck className="size-4 shrink-0 text-primary" />
              <span className="tabular-nums">{aula}</span>
            </p>
          ))}
        </div>
      )}

      {escrita.failed.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-destructive">
            Falharam ({escrita.failed.length})
          </p>
          {escrita.failed.map((falha) => (
            <p key={falha.aula} className="flex items-start gap-2 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <span className="tabular-nums">{falha.aula}</span> —{" "}
                <span className="text-muted-foreground">{falha.reason}</span>
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
