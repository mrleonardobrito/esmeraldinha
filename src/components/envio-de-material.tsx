import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconFile,
  IconFileTypeDoc,
  IconFileTypePdf,
  IconFileTypeXls,
  IconLoader,
  IconPencil,
  IconPhoto,
  IconSearch,
  IconSend,
  IconTypography,
  IconUpload,
  IconX,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  achatarNotasResolvidas,
  preencherAulaDoEnvioNoPortal,
  preencherBoletimDoEnvioNoPortal,
  preverEnvio,
  resolverNotasDoEstudante,
  type EstudanteDaTurma,
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
 * Um nome comparável, para filtrar a lista de estudantes enquanto o auxiliar
 * digita — sem acento, sem caixa, sem espaço sobrando. A mesma ideia de
 * `normalizarNome` do servidor, só que aqui é busca, não é quem decide se um
 * nome bate: a escolha final é sempre um clique do auxiliar num estudante.
 */
function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  | {
      fase: "preenchendo-boletim";
      preview: PreviewDoEnvio;
      aberto: boolean;
      abrindo: boolean;
      erro: string | null;
    };

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
      void preencherBoletim(preview);
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
    const notas = achatarNotasResolvidas(preview.notasResolvidas ?? []);

    // Sem uma nota casada com estudante não há o que escrever na grade do
    // portal, e mandar assim voltava como um 400 que não dizia isso.
    if (notas.length === 0) {
      setEstado({
        fase: "preenchendo-boletim",
        preview,
        aberto: false,
        abrindo: false,
        erro:
          "Nenhuma nota casou com um estudante da turma, então não há o que " +
          "levar ao portal. Confira os nomes do material contra a lista de " +
          "estudantes acima.",
      });
      return;
    }

    setEstado({ fase: "preenchendo-boletim", preview, aberto: false, abrindo: true, erro: null });

    try {
      await preencherBoletimDoEnvioNoPortal(sessionId, {
        professorId,
        cadernetaId: preview.cadernetaId,
        etapa: preview.plano.etapa,
        turma: preview.plano.turma,
        disciplina: preview.plano.disciplina,
        notas,
      });
      setEstado({ fase: "preenchendo-boletim", preview, aberto: true, abrindo: false, erro: null });
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
        abrindo: false,
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
        onIniciar={iniciarPreenchimento}
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
        abrindo={estado.abrindo}
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
  const avaliacoes = Array.from(
    new Set(plano.notas.flatMap((notasDoEstudante) =>
      notasDoEstudante.notas.map((nota) => nota.avaliacao),
    )),
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="outline">{plano.turma}</Badge>
      <Badge variant="outline">{plano.etapa}</Badge>
      {plano.parte === "boletim" ? (
        <>
          {plano.disciplina && <Badge variant="outline">{plano.disciplina}</Badge>}
          {avaliacoes.map((avaliacao) => (
            <Badge key={avaliacao} variant="outline">{avaliacao}</Badge>
          ))}
        </>
      ) : (
        <Badge variant="outline">{plano.mes}</Badge>
      )}
    </div>
  );
}

/** Um item já com a correção do auxiliar aplicada, pronto para exibição. */
interface ItemView {
  indice: number;
  status: "pronta" | "falha";
  rotulo: string;
  matricula?: string;
  motivo?: string;
  candidatos?: string[];
  quantidadeDeNotas?: number;
  /** Verdadeiro quando o auxiliar corrigiu ou pareou este item na tela. */
  corrigido: boolean;
}

/**
 * O que o agente leu, antes de qualquer janela do portal abrir: a turma, a
 * etapa, e um item por aula ou por estudante, já dizendo quais estão prontos
 * e quais falharam — e por quê. No boletim, um nome que falhou pode ser
 * corrigido ou pareado com um estudante da turma bem aqui, sem reenviar o
 * material. Só depois de conferir isto é que o auxiliar decide levar o
 * material para o portal.
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
  onIniciar: (previewCorrigido: PreviewDoEnvio) => void;
}) {
  const isBoletim = preview.plano.parte === "boletim";
  // Só o boletim pareia nome com estudante: uma aula não tem a quem parear.
  const estudantesDaTurma = isBoletim ? preview.estudantes ?? [] : [];

  const [correcoes, setCorrecoes] = React.useState<Record<number, EstudanteDaTurma>>({});
  const [expandido, setExpandido] = React.useState<number | null>(null);
  const [busca, setBusca] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Fechada quando há pendência — o auxiliar não precisa rolar por uma lista
  // longa de itens já prontos enquanto ainda tem nome para corrigir — e
  // aberta assim que a primeira correção acontece, para ele ver onde caiu.
  const [prontosAbertos, setProntosAbertos] = React.useState(
    () => preview.itens.every((item) => item.status === "pronta"),
  );

  const itensView: ItemView[] = preview.itens.map((item, indice) => {
    const correcao = correcoes[indice];
    const quantidadeDeNotas = isBoletim
      ? preview.plano.notas[indice]?.notas.length
      : undefined;
    if (correcao) {
      return {
        indice,
        status: "pronta",
        rotulo: correcao.nome,
        matricula: correcao.matricula,
        quantidadeDeNotas,
        corrigido: true,
      };
    }
    if (item.status === "pronta") {
      let nome = item.rotulo;
      let matricula: string | undefined = undefined;
      if (isBoletim) {
        const notasResolvidas = preview.notasResolvidas?.[indice];
        const mat = notasResolvidas?.[0]?.matricula ?? item.rotulo;
        const est = estudantesDaTurma.find((e) => e.matricula === mat);
        nome = est?.nome ?? item.rotulo;
        matricula = est?.matricula ?? mat;
      }
      return {
        indice,
        status: "pronta",
        rotulo: nome,
        matricula,
        quantidadeDeNotas,
        corrigido: false,
      };
    }
    return {
      indice,
      status: "falha",
      rotulo: item.rotulo,
      motivo: item.motivo,
      candidatos: item.candidatos,
      quantidadeDeNotas,
      corrigido: false,
    };
  });

  const prontos = itensView.filter((item) => item.status === "pronta");
  const falhas = itensView.filter((item) => item.status === "falha");
  const unidade = isBoletim ? "estudante" : "aula";

  // Cada estudante só pode ser escolhido para um item — sem isso dois nomes
  // que falharam poderiam parear com a mesma pessoa.
  const matriculasUsadas = new Set(
    Object.entries(correcoes)
      .filter(([indiceCorrigido]) => Number(indiceCorrigido) !== expandido)
      .map(([, estudante]) => estudante.matricula),
  );
  preview.notasResolvidas?.forEach((notasDoEstudante, idx) => {
    if (notasDoEstudante && idx !== expandido && !correcoes[idx]) {
      const matricula = notasDoEstudante[0]?.matricula;
      if (matricula) matriculasUsadas.add(matricula);
    }
  });

  const itemExpandido = expandido !== null ? falhas.find((f) => f.indice === expandido) : null;

  // Sugestões para o item atualmente expandido
  const sugestoes = (() => {
    if (expandido === null || !itemExpandido || !isBoletim) return [];

    const buscaNorm = normalizarNome(busca);
    const disponiveis = estudantesDaTurma.filter((e) => !matriculasUsadas.has(e.matricula));

    // Candidatos explícitos vindos do backend (ex: EstudanteAmbiguoError)
    const candidatosIds = new Set(itemExpandido.candidatos ?? []);

    // Se não tiver candidatos explícitos, busca por sobreposição de palavras do nome lido
    if (candidatosIds.size === 0 && itemExpandido.rotulo) {
      const palavrasLidas = normalizarNome(itemExpandido.rotulo)
        .split(/\s+/)
        .filter((p) => p.length >= 3);
      for (const est of disponiveis) {
        const estNorm = normalizarNome(est.nome);
        const palavrasCasadas = palavrasLidas.filter((p) => estNorm.includes(p));
        if (palavrasCasadas.length >= 2 || (palavrasLidas.length === 1 && palavrasCasadas.length === 1)) {
          candidatosIds.add(est.matricula);
        }
      }
    }

    const candidatos = disponiveis.filter((e) => candidatosIds.has(e.matricula));
    const resto = disponiveis.filter(
      (e) => !candidatosIds.has(e.matricula) && (buscaNorm === "" || normalizarNome(e.nome).includes(buscaNorm)),
    );

    const candidatosFiltrados =
      buscaNorm === "" || buscaNorm === normalizarNome(itemExpandido.rotulo)
        ? candidatos
        : candidatos.filter((e) => normalizarNome(e.nome).includes(buscaNorm));

    return [...candidatosFiltrados, ...resto].slice(0, 10).map((e) => ({
      matricula: e.matricula,
      nome: e.nome,
      sugerido: candidatosIds.has(e.matricula),
      exato: normalizarNome(e.nome) === buscaNorm && buscaNorm !== "",
      estudante: e,
    }));
  })();

  function abrirResolver(indice: number, nomeLido: string) {
    setExpandido(indice);
    setBusca(nomeLido);
  }

  function fecharResolver() {
    setExpandido(null);
    setBusca("");
  }

  function escolherEstudante(indice: number, estudante: EstudanteDaTurma) {
    const itemAlvo = itensView.find((i) => i.indice === indice);
    setCorrecoes((atuais) => ({ ...atuais, [indice]: estudante }));
    setProntosAbertos(true);
    fecharResolver();

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(`"${itemAlvo?.rotulo ?? "Nome"}" pareado com ${estudante.nome}.`);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }

  function confirmarComEnter(indice: number) {
    const alvoNorm = normalizarNome(busca);
    const exato = sugestoes.find((s) => normalizarNome(s.nome) === alvoNorm);
    if (exato) {
      escolherEstudante(indice, exato.estudante);
      return;
    }
    if (sugestoes.length > 0 && sugestoes[0].sugerido) {
      escolherEstudante(indice, sugestoes[0].estudante);
    }
  }

  function iniciar() {
    if (Object.keys(correcoes).length === 0) {
      onIniciar(preview);
      return;
    }

    // As correções viram notas resolvidas de verdade, na mesma ordem de
    // `plano.notas`, usando a nota que o professor mandou para esse índice.
    const notasResolvidas = preview.notasResolvidas?.map((notas, indice) => {
      const correcao = correcoes[indice];
      if (!correcao) return notas;
      return resolverNotasDoEstudante(
        correcao.matricula,
        preview.plano.notas[indice]?.notas ?? [],
      );
    });

    onIniciar({ ...preview, notasResolvidas });
  }

  return (
    <Moldura semCard={semCard}>
      <CabecalhoDoPlano plano={preview.plano} />

      {preview.plano.observacao && (
        <p className="text-sm text-muted-foreground">{preview.plano.observacao}</p>
      )}

      {toast && (
        <div className="flex items-center gap-2 rounded-2xl bg-primary/15 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-primary">
          <IconCheck className="size-4 shrink-0 text-primary" />
          <span>{toast}</span>
        </div>
      )}

      <div className="flex flex-col gap-3.5 rounded-[18px] border border-border p-3.5">
        {falhas.length === 0 && prontos.length > 0 && (
          <div className="flex items-center gap-2 py-1 px-1 text-sm font-semibold text-primary">
            <IconCheck className="size-4.5 shrink-0" />
            Todos os nomes foram confirmados.
          </div>
        )}

        {falhas.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <IconAlertTriangle className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">Precisam de confirmação ({falhas.length})</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Não bateram com nenhum estudante da turma — corrija o nome ou escolha quem é.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {falhas.map((item) => (
                <div
                  key={item.indice}
                  className="rounded-[14px] bg-destructive/10 p-3 text-card-foreground"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full text-destructive">
                      <IconAlertTriangle className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{item.rotulo}</div>
                      {item.quantidadeDeNotas !== undefined && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {item.quantidadeDeNotas} {item.quantidadeDeNotas === 1 ? "nota" : "notas"}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-muted-foreground">{item.motivo}</div>
                    </div>
                    {isBoletim && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 rounded-2xl px-2.5 text-xs font-medium"
                        onClick={() =>
                          expandido === item.indice
                            ? fecharResolver()
                            : abrirResolver(item.indice, item.rotulo)
                        }
                      >
                        <IconPencil className="size-3.5" />
                        Corrigir
                      </Button>
                    )}
                  </div>

                  {expandido === item.indice && (
                    <div className="mt-2.5 flex flex-col gap-2 border-t border-border/50 pt-2.5">
                      <div className="text-xs text-muted-foreground">
                        Nome lido: <span className="font-medium text-foreground">&quot;{item.rotulo}&quot;</span>
                      </div>

                      <div className="relative">
                        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              confirmarComEnter(item.indice);
                            }
                          }}
                          placeholder="Digite para corrigir ou buscar um estudante"
                          className="h-8.5 rounded-2xl bg-background/60 pl-8.5 text-sm"
                        />
                      </div>
                      <p className="-mt-1 text-[11px] text-muted-foreground">
                        Pressione Enter para confirmar um nome exato, ou clique num estudante da lista.
                      </p>

                      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-0.5">
                        {sugestoes.map((s) => (
                          <button
                            key={s.matricula}
                            type="button"
                            onClick={() => escolherEstudante(item.indice, s.estudante)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/70 cursor-pointer",
                              s.sugerido && "bg-primary/15 hover:bg-primary/20",
                              s.exato && "border border-primary font-medium",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {s.sugerido && (
                                <Badge className="h-5 rounded-full border-0 bg-primary/20 px-2 text-[11px] font-semibold text-primary">
                                  Sugestão
                                </Badge>
                              )}
                              <span className="truncate">{s.nome}</span>
                            </span>
                            <Badge variant="outline" className="shrink-0 text-xs tabular-nums">
                              {s.matricula}
                            </Badge>
                          </button>
                        ))}
                        {sugestoes.length === 0 && (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">
                            Nenhum estudante da turma corresponde a esse nome.
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-2xl px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={fecharResolver}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {falhas.length > 0 && prontos.length > 0 && <div className="h-px bg-border my-0.5" />}

        {prontos.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setProntosAbertos(!prontosAbertos)}
              className="flex w-full items-center justify-between rounded-xl p-1.5 text-left transition-colors hover:bg-muted/50 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <IconCheck className="size-3.5" />
                </span>
                <span className="text-sm font-semibold">Prontas para preencher ({prontos.length})</span>
              </span>
              <IconChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  prontosAbertos && "rotate-180",
                )}
              />
            </button>

            {prontosAbertos && (
              <div className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto p-1">
                {prontos.map((item) => (
                  <div
                    key={item.indice}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                  >
                    <IconCheck className="size-3.5 shrink-0 text-primary" />
                    <span className="flex-1 truncate">{item.rotulo}</span>
                    {item.quantidadeDeNotas !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        {item.quantidadeDeNotas} {item.quantidadeDeNotas === 1 ? "nota" : "notas"}
                      </Badge>
                    )}
                    {item.corrigido && (
                      <Badge variant="secondary" className="text-xs">
                        corrigido
                      </Badge>
                    )}
                    {item.matricula && (
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {item.matricula}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {falhas.length === 0 && prontos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma {unidade} encontrada.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onCancelar}>
            <IconArrowLeft data-icon="inline-start" />
            Cancelar
          </Button>
          <Button onClick={iniciar} disabled={prontos.length === 0}>
            <IconExternalLink data-icon="inline-start" />
            Preencher no sistema
          </Button>
        </div>
        {falhas.length > 0 && (
          <p className="text-xs text-muted-foreground">
            As pendências acima não serão enviadas ao portal até serem confirmadas.
          </p>
        )}
      </div>
    </Moldura>
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
  abrindo,
  erro,
  semCard,
  onAbrir,
  onConcluir,
}: {
  preview: PreviewDoEnvio;
  aberto: boolean;
  abrindo: boolean;
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
          <Button onClick={onAbrir} disabled={abrindo}>
            {abrindo ? (
              <>
                <IconLoader className="animate-spin" data-icon="inline-start" />
                Abrindo o portal…
              </>
            ) : (
              <>
                <IconExternalLink data-icon="inline-start" />
                Preencher no sistema
              </>
            )}
          </Button>
        )}
      </div>
    </Moldura>
  );
}
