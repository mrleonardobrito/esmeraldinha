import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconExternalLink,
  IconFile,
  IconFileTypeDoc,
  IconFileTypePdf,
  IconFileTypeXls,
  IconLoader,
  IconPhoto,
  IconSend,
  IconTypography,
  IconUpload,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Attachment,
  AttachmentActions,
  AttachmentAction,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  preencherAulaDoEnvioNoPortal,
  preencherBoletimDoEnvioNoPortal,
  preverEnvio,
  type ItemDoEnvio,
  type PreviewDoEnvio,
} from "@/lib/envios";

const ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,text/csv," +
  ".doc,.docx,.xls,.xlsx,.csv," +
  "application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const EXTENSOES_WORD = [".doc", ".docx"];
const EXTENSOES_PLANILHA = [".xls", ".xlsx", ".csv"];

const MIME_WORD = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MIME_PLANILHA = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function temExtensao(arquivo: File, extensoes: string[]) {
  const nome = arquivo.name.toLowerCase();
  return extensoes.some((extensao) => nome.endsWith(extensao));
}

/** O que o professor manda é quase sempre foto do caderno ou PDF. */
function ehImagem(arquivo: File) {
  return arquivo.type.startsWith("image/");
}

function ehPdf(arquivo: File) {
  return arquivo.type === "application/pdf";
}

/** Word, moderno (.docx) ou antigo (.doc). */
function ehWord(arquivo: File) {
  return MIME_WORD.includes(arquivo.type) || temExtensao(arquivo, EXTENSOES_WORD);
}

/** Excel, moderno (.xlsx) ou antigo (.xls), e CSV. */
function ehPlanilha(arquivo: File) {
  return MIME_PLANILHA.includes(arquivo.type) || temExtensao(arquivo, EXTENSOES_PLANILHA);
}

function tamanhoLegivel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Cada anexo carrega a própria pré-visualização, criada uma vez e revogada
 * quando o anexo sai da lista — sem isso o blob vaza a cada re-render.
 */
function usePreVisualizacao(arquivo: File) {
  const url = React.useMemo(
    () => (ehImagem(arquivo) ? URL.createObjectURL(arquivo) : null),
    [arquivo],
  );

  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

/**
 * O estado da tela: compor o envio, esperar a preview, conferi-la, e então
 * levar cada item para o portal — uma aula de conteúdo por vez, ou o boletim
 * inteiro de uma vez, do jeito que o preenchimento assistido manual já faz.
 */
type Estado =
  | { fase: "compondo" }
  | { fase: "enviando" }
  | { fase: "preview"; preview: PreviewDoEnvio }
  | {
      fase: "preenchendo-aulas";
      preview: PreviewDoEnvio;
      /** O índice da aula que está (ou acabou de ser levada) na janela do portal. */
      indice: number;
      abrindo: boolean;
      erro: string | null;
    }
  | { fase: "preenchendo-boletim"; preview: PreviewDoEnvio; aberto: boolean; erro: string | null };

export interface EnvioDeMaterialProps {
  sessionId: string;
  professorId: string;
  /** Quando o envio sai de dentro de uma caderneta, o progresso dela sobe junto. */
  cadernetaId?: string;
  /** Sem moldura de card, para quando o envio já está dentro de um modal. */
  semCard?: boolean;
  onGravou?: () => void;
  /**
   * A sessão sumiu do servidor (404) — um restart do processo em dev, ou
   * ociosidade de verdade. Quem chamou é dono da sessão e decide o que fazer;
   * este componente só avisa, sem tentar abrir uma nova sozinho.
   */
  onSessaoExpirada?: () => void;
}

/**
 * O auxiliar de ensino não escolhe turma, etapa nem mês: quem descobre isso é
 * o agente, lendo o material. Aqui só se entrega o que o professor mandou —
 * na prática fotos e PDFs, com o texto colado como caminho secundário.
 *
 * Nada é salvo pelo servidor: o agente lê o material e devolve uma preview
 * para o auxiliar conferir; a partir dela, cada item é levado a uma janela
 * visível do portal, e quem confere e clica em salvar é sempre o auxiliar.
 */
export function EnvioDeMaterial({
  sessionId,
  professorId,
  cadernetaId,
  semCard,
  onGravou,
  onSessaoExpirada,
}: EnvioDeMaterialProps) {
  const [texto, setTexto] = React.useState("");
  const [textoAberto, setTextoAberto] = React.useState(false);
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [arrastando, setArrastando] = React.useState(false);
  const [estado, setEstado] = React.useState<Estado>({ fase: "compondo" });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const textoRef = React.useRef<HTMLTextAreaElement>(null);

  function adicionar(novos: FileList | null) {
    if (!novos?.length) return;
    setArquivos((atuais) => [...atuais, ...Array.from(novos)]);
  }

  function remover(indice: number) {
    setArquivos((atuais) => atuais.filter((_, i) => i !== indice));
  }

  function abrirTexto() {
    setTextoAberto(true);
    // O foco só existe depois que o campo entra na árvore.
    requestAnimationFrame(() => textoRef.current?.focus());
  }

  /**
   * Colar uma foto direto do print do WhatsApp é tão comum quanto arrastar o
   * arquivo, então a área de soltura também aceita paste.
   */
  function colar(event: React.ClipboardEvent) {
    const doClipboard = Array.from(event.clipboardData.files);
    if (doClipboard.length === 0) return;

    event.preventDefault();
    setArquivos((atuais) => [...atuais, ...doClipboard]);
  }

  function tratarErro(error: unknown, mensagemPadrao: string) {
    if (error instanceof ApiError && error.status === 404 && onSessaoExpirada) {
      onSessaoExpirada();
      return;
    }
    setErro(error instanceof Error ? error.message : mensagemPadrao);
  }

  async function enviar() {
    setEstado({ fase: "enviando" });
    setErro(null);

    try {
      const preview = await preverEnvio(sessionId, { texto, arquivos, cadernetaId });
      setTexto("");
      setTextoAberto(false);
      setArquivos([]);
      setEstado({ fase: "preview", preview });
    } catch (error) {
      setEstado({ fase: "compondo" });
      tratarErro(error, "Não foi possível interpretar o material.");
    }
  }

  function cancelarPreview() {
    setEstado({ fase: "compondo" });
  }

  function iniciarPreenchimento(preview: PreviewDoEnvio) {
    if (preview.plano.parte === "boletim") {
      setEstado({ fase: "preenchendo-boletim", preview, aberto: false, erro: null });
      return;
    }

    const primeiroPronto = preview.itens.findIndex((item) => item.status === "pronta");
    setEstado({
      fase: "preenchendo-aulas",
      preview,
      indice: primeiroPronto === -1 ? preview.itens.length : primeiroPronto,
      abrindo: false,
      erro: null,
    });
  }

  async function preencherAulaAtual(preview: PreviewDoEnvio, indice: number) {
    const aula = preview.plano.aulas[indice];
    if (!aula) return;

    setEstado({ fase: "preenchendo-aulas", preview, indice, abrindo: true, erro: null });

    try {
      await preencherAulaDoEnvioNoPortal(sessionId, {
        professorId,
        cadernetaId: preview.cadernetaId,
        etapa: preview.plano.etapa,
        mes: preview.plano.mes,
        turma: preview.plano.turma,
        aula,
      });
      setEstado({ fase: "preenchendo-aulas", preview, indice, abrindo: false, erro: null });
      onGravou?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && onSessaoExpirada) {
        onSessaoExpirada();
        return;
      }
      setEstado({
        fase: "preenchendo-aulas",
        preview,
        indice,
        abrindo: false,
        erro:
          error instanceof Error ? error.message : "Não foi possível abrir a aula no portal.",
      });
    }
  }

  /** Avança para a próxima aula pronta, pulando as que falharam na preview. */
  function proximaAula(preview: PreviewDoEnvio, indiceAtual: number) {
    const proximo = preview.itens.findIndex(
      (item, i) => i > indiceAtual && item.status === "pronta",
    );
    const indice = proximo === -1 ? preview.itens.length : proximo;
    setEstado({ fase: "preenchendo-aulas", preview, indice, abrindo: false, erro: null });
  }

  function concluirEnvio() {
    setEstado({ fase: "compondo" });
  }

  async function preencherBoletim(preview: PreviewDoEnvio) {
    const notas = (preview.notasResolvidas ?? []).filter(
      (nota): nota is NonNullable<typeof nota> => nota !== undefined,
    );
    if (notas.length === 0) return;

    setEstado({ fase: "preenchendo-boletim", preview, aberto: false, erro: null });

    try {
      await preencherBoletimDoEnvioNoPortal(sessionId, {
        professorId,
        cadernetaId: preview.cadernetaId,
        etapa: preview.plano.etapa,
        turma: preview.plano.turma,
        disciplina: preview.plano.disciplina,
        notas,
      });
      setEstado({ fase: "preenchendo-boletim", preview, aberto: true, erro: null });
      onGravou?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && onSessaoExpirada) {
        onSessaoExpirada();
        return;
      }
      setEstado({
        fase: "preenchendo-boletim",
        preview,
        aberto: false,
        erro:
          error instanceof Error ? error.message : "Não foi possível abrir o boletim no portal.",
      });
    }
  }

  if (estado.fase === "preview") {
    return (
      <PreviewDoEnvioView
        preview={estado.preview}
        semCard={semCard}
        onCancelar={cancelarPreview}
        onIniciar={() => iniciarPreenchimento(estado.preview)}
      />
    );
  }

  if (estado.fase === "preenchendo-aulas") {
    return (
      <PreenchimentoDeAulas
        preview={estado.preview}
        indice={estado.indice}
        abrindo={estado.abrindo}
        erro={estado.erro}
        semCard={semCard}
        onAbrir={() => void preencherAulaAtual(estado.preview, estado.indice)}
        onProxima={() => proximaAula(estado.preview, estado.indice)}
        onConcluir={concluirEnvio}
      />
    );
  }

  if (estado.fase === "preenchendo-boletim") {
    return (
      <PreenchimentoDeBoletim
        preview={estado.preview}
        aberto={estado.aberto}
        erro={estado.erro}
        semCard={semCard}
        onAbrir={() => void preencherBoletim(estado.preview)}
        onConcluir={concluirEnvio}
      />
    );
  }

  const enviando = estado.fase === "enviando";
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
        onPaste={colar}
        className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${
          arrastando ? "border-primary bg-primary/5" : "border-input"
        }`}
      >
        <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <IconUpload className="size-5" />
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            Solte aqui as fotos, PDFs e planilhas do professor
          </p>
          <p className="text-sm text-muted-foreground">
            Arraste, cole (Ctrl+V) ou escolha do computador — foto, PDF, Word
            ou Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            <IconPhoto data-icon="inline-start" />
            Escolher arquivos
          </Button>
          <Button
            variant="ghost"
            onClick={() => cameraRef.current?.click()}
            disabled={enviando}
          >
            <IconCamera data-icon="inline-start" />
            Tirar foto
          </Button>
        </div>
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

      <input
        ref={cameraRef}
        type="file"
        multiple
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          adicionar(event.target.files);
          event.target.value = "";
        }}
      />

      {arquivos.length > 0 && (
        <AttachmentGroup>
          {arquivos.map((arquivo, indice) => (
            <AnexoEnviado
              key={`${arquivo.name}-${arquivo.lastModified}-${indice}`}
              arquivo={arquivo}
              enviando={enviando}
              onRemover={() => remover(indice)}
            />
          ))}
        </AttachmentGroup>
      )}

      {textoAberto ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="envio-texto"
              className="text-sm font-medium text-muted-foreground"
            >
              Texto colado
            </label>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setTexto("");
                setTextoAberto(false);
              }}
              disabled={enviando}
            >
              <IconX data-icon="inline-start" />
              Remover
            </Button>
          </div>
          <textarea
            id="envio-texto"
            ref={textoRef}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            disabled={enviando}
            rows={4}
            placeholder="Cole aqui o que o professor mandou por escrito…"
            className="min-h-24 w-full resize-y rounded-2xl border border-input bg-transparent p-3 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={abrirTexto}
          disabled={enviando}
        >
          <IconTypography data-icon="inline-start" />
          Colar texto em vez de arquivo
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void enviar()} disabled={enviando || vazio}>
          {enviando ? (
            <IconLoader className="animate-spin" data-icon="inline-start" />
          ) : (
            <IconSend data-icon="inline-start" />
          )}
          {enviando ? "Lendo o material…" : "Analisar"}
        </Button>
        {arquivos.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {arquivos.length} arquivo(s) anexado(s)
          </span>
        )}
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
          Solte as fotos, PDFs, Word ou Excel que o professor mandou. O
          sistema descobre a turma, a etapa e o mês.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">{corpo}</CardContent>
    </Card>
  );
}

function AnexoEnviado({
  arquivo,
  enviando,
  onRemover,
}: {
  arquivo: File;
  enviando: boolean;
  onRemover: () => void;
}) {
  const preVisualizacao = usePreVisualizacao(arquivo);
  const imagem = ehImagem(arquivo);

  return (
    <Attachment
      orientation="vertical"
      state={enviando ? "processing" : "done"}
    >
      <AttachmentMedia variant={imagem ? "image" : "icon"}>
        {imagem && preVisualizacao ? (
          <img src={preVisualizacao} alt="" />
        ) : ehPdf(arquivo) ? (
          <IconFileTypePdf />
        ) : ehWord(arquivo) ? (
          <IconFileTypeDoc />
        ) : ehPlanilha(arquivo) ? (
          <IconFileTypeXls />
        ) : (
          <IconFile />
        )}
      </AttachmentMedia>

      <AttachmentContent>
        <AttachmentTitle>{arquivo.name}</AttachmentTitle>
        <AttachmentDescription>
          {tamanhoLegivel(arquivo.size)}
        </AttachmentDescription>
      </AttachmentContent>

      <AttachmentActions>
        <AttachmentAction
          onClick={onRemover}
          disabled={enviando}
          aria-label={`Remover ${arquivo.name}`}
          className="bg-background/80 backdrop-blur-sm"
        >
          <IconX />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

/** A moldura comum das telas de preview e preenchimento: com ou sem card. */
function Moldura({
  semCard,
  children,
}: {
  semCard?: boolean;
  children: React.ReactNode;
}) {
  if (semCard) return <div className="flex flex-col gap-3">{children}</div>;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">{children}</CardContent>
    </Card>
  );
}

function CabecalhoDoPlano({ plano }: { plano: PreviewDoEnvio["plano"] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline">{plano.turma}</Badge>
      <Badge variant="outline">{plano.etapa}</Badge>
      {plano.parte === "boletim" ? (
        <>
          {plano.disciplina && <Badge variant="outline">{plano.disciplina}</Badge>}
          {plano.avaliacao && <Badge variant="outline">{plano.avaliacao}</Badge>}
        </>
      ) : (
        <Badge variant="outline">{plano.mes}</Badge>
      )}
    </div>
  );
}

/**
 * O que o agente leu, antes de qualquer janela do portal abrir: a turma, a
 * etapa, e um item por aula ou por estudante, já dizendo quais estão prontos
 * e quais falharam — e por quê. Só depois de conferir isto é que o auxiliar
 * decide levar o material para o portal.
 */
function PreviewDoEnvioView({
  preview,
  semCard,
  onCancelar,
  onIniciar,
}: {
  preview: PreviewDoEnvio;
  semCard?: boolean;
  onCancelar: () => void;
  onIniciar: () => void;
}) {
  const prontos = preview.itens.filter((item) => item.status === "pronta").length;
  const falhas = preview.itens.filter((item) => item.status === "falha");
  const unidade = preview.plano.parte === "boletim" ? "nota" : "aula";

  return (
    <Moldura semCard={semCard}>
      <CabecalhoDoPlano plano={preview.plano} />

      {preview.plano.observacao && (
        <p className="text-sm text-muted-foreground">{preview.plano.observacao}</p>
      )}

      <ListaDeItens itens={preview.itens} unidade={unidade} />

      {falhas.length === 0 && prontos === 0 && (
        <p className="text-sm text-muted-foreground">
          O agente não encontrou nenhum item pronto para preencher.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onCancelar}>
          <IconArrowLeft data-icon="inline-start" />
          Cancelar
        </Button>
        <Button onClick={onIniciar} disabled={prontos === 0}>
          <IconExternalLink data-icon="inline-start" />
          Preencher no sistema
        </Button>
      </div>
    </Moldura>
  );
}

function ListaDeItens({ itens, unidade }: { itens: ItemDoEnvio[]; unidade: string }) {
  const prontos = itens.filter((item) => item.status === "pronta");
  const falhas = itens.filter((item) => item.status === "falha");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-3">
      {prontos.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            Prontas para preencher ({prontos.length})
          </p>
          {prontos.map((item) => (
            <p key={item.rotulo} className="flex items-center gap-2 text-sm">
              <IconCheck className="size-4 shrink-0 text-primary" />
              <span className="tabular-nums">{item.rotulo}</span>
            </p>
          ))}
        </div>
      )}

      {falhas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-destructive">
            Não puderam ser lidas ({falhas.length})
          </p>
          {falhas.map((item) => (
            <p key={item.rotulo} className="flex items-start gap-2 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                <span className="tabular-nums">{item.rotulo}</span> —{" "}
                <span className="text-muted-foreground">{item.motivo}</span>
              </span>
            </p>
          ))}
        </div>
      )}

      {prontos.length === 0 && falhas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma {unidade} encontrada.</p>
      )}
    </div>
  );
}

/**
 * Leva cada aula pronta da preview para uma janela visível do portal, uma de
 * cada vez: abre, o auxiliar confere e salva por lá, e só então clica em
 * _Próxima_ para a aula seguinte ser preenchida.
 */
function PreenchimentoDeAulas({
  preview,
  indice,
  abrindo,
  erro,
  semCard,
  onAbrir,
  onProxima,
  onConcluir,
}: {
  preview: PreviewDoEnvio;
  indice: number;
  abrindo: boolean;
  erro: string | null;
  semCard?: boolean;
  onAbrir: () => void;
  onProxima: () => void;
  onConcluir: () => void;
}) {
  const total = preview.itens.length;
  const terminou = indice >= total;
  const item = terminou ? null : preview.itens[indice];
  const aula = terminou ? null : preview.plano.aulas[indice];
  const restam = preview.itens.slice(indice + 1).filter((i) => i.status === "pronta").length;

  if (terminou) {
    return (
      <Moldura semCard={semCard}>
        <CabecalhoDoPlano plano={preview.plano} />
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
          Todas as aulas prontas foram levadas ao portal.
        </p>
        <Button onClick={onConcluir} className="self-start">
          Concluir
        </Button>
      </Moldura>
    );
  }

  return (
    <Moldura semCard={semCard}>
      <CabecalhoDoPlano plano={preview.plano} />

      <p className="text-sm text-muted-foreground">
        Aula <span className="tabular-nums">{aula?.data}</span>
        {aula?.ordem !== null && aula?.ordem !== undefined && ` (ordem ${aula.ordem})`} —{" "}
        {indice + 1} de {total}
        {restam > 0 && `, mais ${restam} depois desta`}.
      </p>

      {item?.status === "falha" ? (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{item.motivo}</span>
        </p>
      ) : erro ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      ) : (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
          O portal está aberto nesta aula com o conteúdo preenchido. Confira e
          salve por lá — o sistema não salva por você.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {item?.status === "pronta" && !erro ? (
          <Button onClick={onAbrir} disabled={abrindo}>
            {abrindo ? (
              <IconLoader className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconExternalLink data-icon="inline-start" />
            )}
            {abrindo ? "Abrindo o portal…" : "Abrir esta aula no portal"}
          </Button>
        ) : (
          <Button onClick={onProxima}>
            <IconArrowRight data-icon="inline-start" />
            Próxima
          </Button>
        )}
      </div>
    </Moldura>
  );
}

/**
 * Leva o boletim inteiro para uma janela visível do portal, de uma vez — como
 * o portal já mostra a turma inteira numa grade só. Salvar continua sendo do
 * auxiliar de ensino.
 */
function PreenchimentoDeBoletim({
  preview,
  aberto,
  erro,
  semCard,
  onAbrir,
  onConcluir,
}: {
  preview: PreviewDoEnvio;
  aberto: boolean;
  erro: string | null;
  semCard?: boolean;
  onAbrir: () => void;
  onConcluir: () => void;
}) {
  return (
    <Moldura semCard={semCard}>
      <CabecalhoDoPlano plano={preview.plano} />

      {erro && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {erro}
        </p>
      )}

      {aberto && !erro && (
        <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
          O portal está aberto no boletim com estas notas preenchidas. Confira
          e salve por lá — o sistema não salva por você.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {aberto ? (
          <Button onClick={onConcluir}>Concluir</Button>
        ) : (
          <Button onClick={onAbrir}>
            <IconExternalLink data-icon="inline-start" />
            Preencher no sistema
          </Button>
        )}
      </div>
    </Moldura>
  );
}
