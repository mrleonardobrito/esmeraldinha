import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconExternalLink,
  IconFile,
  IconLoader,
  IconNotebook,
  IconPaperclip,
  IconPencil,
  IconPlayerStop,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSparkles,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { loadAulasDaEtapa, type AulaDaCaderneta, type Caderneta } from "@/lib/cadernetas";
import {
  aulasComConteudo,
  chaveDaAula,
  gerarRascunhos,
  habilidadesDoCodigoCR,
  mesmaAula,
  type MensagemDaConversa,
  type RascunhoDeConteudo,
  type ReferenciaDeAula,
} from "@/lib/conteudos";
import { diffDePalavras } from "@/lib/diff-de-palavras";
import { preencherAulaDoEnvioNoPortal } from "@/lib/envios";
import { cn } from "@/lib/utils";

const ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,.doc,.docx,.xls,.xlsx,.csv";

/** Uma mensagem como a tela a mostra: o texto e o que foi junto com ele. */
interface MensagemNaTela extends MensagemDaConversa {
  anexos?: string[];
  referencias?: string[];
}

/**
 * Como o rascunho chegou ao estado atual: escrito pelo agente, reescrito por
 * ele numa rodada seguinte (aí `anterior` guarda o texto de antes, para marcar
 * o que mudou) ou corrigido à mão pelo auxiliar de ensino.
 */
type StatusDoRascunho = "gerada" | "atualizada" | "editada";

interface Rascunho extends RascunhoDeConteudo {
  status: StatusDoRascunho;
  anterior: RascunhoDeConteudo | null;
  /** Desmarcada, a aula fica de fora do preenchimento no portal. */
  selecionada: boolean;
}

/** Os rascunhos, pela chave da aula. */
type Rascunhos = Record<string, Rascunho>;

/** O preenchimento assistido em andamento: as aulas na fila, uma de cada vez. */
interface Preenchimento {
  fila: AulaDaCaderneta[];
  indice: number;
  abrindo: boolean;
  aberta: boolean;
  erro: string | null;
}

export interface ChatDeConteudosProps {
  caderneta: Caderneta;
  etapa: string;
  /** As aulas da etapa, como o portal as lista. */
  aulas: AulaDaCaderneta[];
  /** O mês da conversa; nulo para a etapa inteira. */
  mesInicial: string | null;
  sessionId: string;
  onVoltar: () => void;
  /** Chamado quando uma aula foi levada ao portal, para a lista recarregar. */
  onGravou: () => void;
}

function rotuloDaAula(aula: { data: string; ordem: number | null }): string {
  return aula.ordem === null ? aula.data : `${aula.data} (ordem ${aula.ordem})`;
}

/** Só o dia e o mês: a etapa já diz o ano. */
function dataCurta(data: string): string {
  return data.slice(0, 5);
}

/** dd/mm/aaaa como um número que ordena por data. */
function ordemCronologica(data: string): number {
  const [dia, mes, ano] = data.split("/").map(Number);
  return ano * 10000 + mes * 100 + dia;
}

function semDecoracao(rascunho: Rascunho): RascunhoDeConteudo {
  return {
    data: rascunho.data,
    ordem: rascunho.ordem,
    codigoCR: rascunho.codigoCR,
    desenvolvimento: rascunho.desenvolvimento,
    ferramentas: rascunho.ferramentas,
  };
}

function mesmoConteudo(a: RascunhoDeConteudo, b: RascunhoDeConteudo): boolean {
  return (
    a.codigoCR === b.codigoCR &&
    a.desenvolvimento === b.desenvolvimento &&
    a.ferramentas === b.ferramentas
  );
}

/**
 * O chat de conteúdos: à esquerda a conversa com o agente, à direita as aulas
 * do escopo — as que o portal já tem, as pendentes e os rascunhos que o agente
 * escreveu. Nada vai ao portal até o auxiliar de ensino mandar, e mesmo então
 * cada aula abre numa janela visível para ele conferir e salvar.
 */
export function ChatDeConteudos({
  caderneta,
  etapa,
  aulas,
  mesInicial,
  sessionId,
  onVoltar,
  onGravou,
}: ChatDeConteudosProps) {
  const [mes, setMes] = React.useState<string | null>(mesInicial);
  const [mensagens, setMensagens] = React.useState<MensagemNaTela[]>([]);
  const [rascunhos, setRascunhos] = React.useState<Rascunhos>({});
  const [texto, setTexto] = React.useState("");
  const [anexos, setAnexos] = React.useState<File[]>([]);
  const [novosAnexos, setNovosAnexos] = React.useState<File[]>([]);
  const [referencias, setReferencias] = React.useState<ReferenciaDeAula[]>([]);
  const [gerando, setGerando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [preenchimento, setPreenchimento] = React.useState<Preenchimento | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const listaRef = React.useRef<HTMLUListElement>(null);

  /** Rola a lista até o cartão da aula — o que acabou de mudar é o que se quer ver. */
  function mostrarAula(aula: { data: string; ordem: number | null } | null | undefined) {
    if (!aula) return;
    const chave = chaveDaAula(aula);
    // Depois do render, para o cartão já existir com o estado novo.
    requestAnimationFrame(() => {
      listaRef.current
        ?.querySelector(`[data-aula="${CSS.escape(chave)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const noEscopo = React.useMemo(
    () => aulas.filter((aula) => mes === null || aula.mes === mes),
    [aulas, mes],
  );
  const pendentes = noEscopo.filter((aula) => !aula.conteudoPreenchido);
  const meses = React.useMemo(() => [...new Set(aulas.map((aula) => aula.mes))], [aulas]);

  const rascunhosNoEscopo = noEscopo
    .map((aula) => rascunhos[chaveDaAula(aula)])
    .filter((rascunho): rascunho is Rascunho => rascunho !== undefined);
  const prontas = rascunhosNoEscopo.filter((rascunho) => rascunho.selecionada);

  async function conversar(textoDaMensagem: string) {
    const conteudo = textoDaMensagem.trim();
    if (!conteudo || gerando) return;

    // As referências entram na mensagem em que foram escolhidas, uma vez só.
    const jaMostradas = new Set(mensagens.flatMap((anterior) => anterior.referencias ?? []));
    const novasReferencias = referencias
      .map((referencia) => `Aula ${dataCurta(referencia.data)}`)
      .filter((rotulo) => !jaMostradas.has(rotulo));

    const mensagem: MensagemNaTela = {
      papel: "auxiliar",
      texto: conteudo,
      ...(novosAnexos.length > 0 ? { anexos: novosAnexos.map((arquivo) => arquivo.name) } : {}),
      ...(novasReferencias.length > 0 ? { referencias: novasReferencias } : {}),
    };
    const conversa = [...mensagens, mensagem];
    const arquivos = [...anexos, ...novosAnexos];

    setMensagens(conversa);
    setAnexos(arquivos);
    setNovosAnexos([]);
    setTexto("");
    setErro(null);
    setGerando(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const gerados = await gerarRascunhos(
        caderneta.id,
        etapa,
        {
          mes,
          mensagens: conversa.map(({ papel, texto: t }) => ({ papel, texto: t })),
          // Só os rascunhos de aulas ainda pendentes: uma aula que acabou de ir
          // ao portal não tem mais o que ajustar.
          rascunhos: pendentes
            .map((aula) => rascunhos[chaveDaAula(aula)])
            .filter((rascunho): rascunho is Rascunho => rascunho !== undefined)
            .map(semDecoracao),
          referencias,
          arquivos,
        },
        controller.signal,
      );

      // O primeiro rascunho que mudou é o que o auxiliar quer ver.
      mostrarAula(
        gerados.aulas.find((aula) => {
          const anterior = rascunhos[chaveDaAula(aula)];
          return !anterior || !mesmoConteudo(anterior, aula);
        }) ?? gerados.aulas[0],
      );

      setRascunhos((atuais) => {
        const proximos: Rascunhos = { ...atuais };
        for (const aula of gerados.aulas) {
          const chave = chaveDaAula(aula);
          const anterior = atuais[chave];
          if (!anterior) {
            proximos[chave] = { ...aula, status: "gerada", anterior: null, selecionada: true };
          } else if (!mesmoConteudo(anterior, aula)) {
            proximos[chave] = {
              ...aula,
              status: "atualizada",
              anterior: semDecoracao(anterior),
              selecionada: anterior.selecionada,
            };
          } else if (anterior.status === "atualizada") {
            // O que mudou na rodada passada já foi visto; a marca sai.
            proximos[chave] = { ...anterior, status: "gerada", anterior: null };
          }
        }
        return proximos;
      });

      setMensagens((atuais) => [
        ...atuais,
        {
          papel: "assistente",
          texto:
            gerados.resposta ||
            (gerados.aulas.length > 0
              ? `Escrevi ${gerados.aulas.length === 1 ? "a aula" : `as ${gerados.aulas.length} aulas`} pendentes. Revise ao lado.`
              : "Não havia aula pendente para escrever."),
        },
      ]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setErro(error instanceof Error ? error.message : "Não foi possível falar com o agente.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGerando(false);
      }
    }
  }

  function parar() {
    abortRef.current?.abort();
    abortRef.current = null;
    setGerando(false);
    setMensagens((atuais) => [
      ...atuais,
      { papel: "assistente", texto: "Parei antes de terminar. Mande outra mensagem quando quiser." },
    ]);
  }

  function atualizarRascunho(chave: string, mudanca: Partial<Rascunho>) {
    setRascunhos((atuais) =>
      atuais[chave] ? { ...atuais, [chave]: { ...atuais[chave], ...mudanca } } : atuais,
    );
  }

  function descartarRascunho(chave: string) {
    setRascunhos((atuais) => {
      const { [chave]: _descartado, ...resto } = atuais;
      void _descartado;
      return resto;
    });
  }

  // O preenchimento assistido, uma aula por vez: abre a janela, o auxiliar
  // confere e salva por lá, e só então pede a próxima.
  async function abrirNoPortal(atual: Preenchimento) {
    const aula = atual.fila[atual.indice];
    const rascunho = rascunhos[chaveDaAula(aula)];
    if (!aula || !rascunho) return;

    setPreenchimento({ ...atual, abrindo: true, erro: null });
    mostrarAula(aula);

    try {
      await preencherAulaDoEnvioNoPortal(sessionId, {
        professorId: caderneta.professorId,
        cadernetaId: caderneta.id,
        etapa,
        mes: aula.mes,
        turma: caderneta.turma,
        aula: {
          data: aula.data,
          ordem: aula.ordem,
          codigoCR: rascunho.codigoCR,
          desenvolvimento: rascunho.desenvolvimento,
          ferramentas: rascunho.ferramentas,
          isRecuperacao: "Não",
          isInteracao: "Não",
        },
      });
      setPreenchimento({ ...atual, abrindo: false, aberta: true, erro: null });
    } catch (error) {
      setPreenchimento({
        ...atual,
        abrindo: false,
        aberta: false,
        erro: error instanceof Error ? error.message : "Não foi possível abrir a aula no portal.",
      });
    }
  }

  function iniciarPreenchimento() {
    const fila = noEscopo.filter((aula) => rascunhos[chaveDaAula(aula)]?.selecionada);
    if (fila.length === 0) return;
    const inicio: Preenchimento = { fila, indice: 0, abrindo: false, aberta: false, erro: null };
    setPreenchimento(inicio);
    void abrirNoPortal(inicio);
  }

  function proximaDoPreenchimento() {
    if (!preenchimento) return;
    const aula = preenchimento.fila[preenchimento.indice];
    if (aula) descartarRascunho(chaveDaAula(aula));
    onGravou();

    const indice = preenchimento.indice + 1;
    if (indice >= preenchimento.fila.length) {
      setPreenchimento(null);
      toast.success(
        preenchimento.fila.length === 1
          ? "Aula levada ao portal."
          : `${preenchimento.fila.length} aulas levadas ao portal.`,
      );
      return;
    }

    const proximo: Preenchimento = { ...preenchimento, indice, aberta: false, erro: null };
    setPreenchimento(proximo);
    void abrirNoPortal(proximo);
  }

  const emPreenchimento = preenchimento?.fila[preenchimento.indice] ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" className="-ml-3" onClick={onVoltar} disabled={preenchimento !== null}>
          <IconArrowLeft data-icon="inline-start" />
          Voltar para as aulas
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Conversando sobre</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={mes ?? "etapa"}
            onValueChange={(valor) => {
              if (valor) setMes(valor === "etapa" ? null : valor);
            }}
            disabled={gerando || preenchimento !== null}
            aria-label="Escopo da conversa"
          >
            {meses.map((nome) => (
              <ToggleGroupItem key={nome} value={nome}>
                {nome}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="etapa">{etapa}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_1px_minmax(0,7fr)]">
        <Conversa
          mensagens={mensagens}
          gerando={gerando}
          erro={erro}
          escopo={mes ?? etapa}
          pendentes={pendentes.length}
          preenchidas={noEscopo.length - pendentes.length}
          temRascunhos={rascunhosNoEscopo.length > 0}
          onSugestao={conversar}
        >
          <Compositor
            texto={texto}
            onTexto={setTexto}
            anexos={novosAnexos}
            onAnexos={setNovosAnexos}
            referencias={referencias}
            onReferencias={setReferencias}
            caderneta={caderneta}
            aulasDaEtapa={aulas}
            etapa={etapa}
            mes={mes}
            gerando={gerando}
            bloqueado={preenchimento !== null}
            onEnviar={() => void conversar(texto)}
            onParar={parar}
          />
        </Conversa>

        <div className="hidden bg-border lg:block" aria-hidden="true" />

        <div className="flex min-h-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-baseline gap-2 text-sm font-medium">
              Aulas de {mes ?? etapa}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {noEscopo.length - pendentes.length}/{noEscopo.length} preenchidas
              </span>
            </span>
            <Legenda />
          </div>

          <ul ref={listaRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
            {noEscopo.map((aula, indice) => {
              const chave = chaveDaAula(aula);
              const rascunho = rascunhos[chave];
              const trocouDeMes = mes === null && (indice === 0 || noEscopo[indice - 1].mes !== aula.mes);

              return (
                <React.Fragment key={chave}>
                  {trocouDeMes && (
                    <li className="pt-1 text-xs font-medium text-muted-foreground first:pt-0">
                      {aula.mes}
                    </li>
                  )}
                  <li data-aula={chave}>
                    {aula.conteudoPreenchido ? (
                      <CartaoNoPortal aula={aula} />
                    ) : rascunho ? (
                      <CartaoDoRascunho
                        aula={aula}
                        rascunho={rascunho}
                        editando={editando === chave}
                        preenchendo={emPreenchimento !== null && mesmaAula(emPreenchimento, aula)}
                        bloqueado={gerando || preenchimento !== null}
                        onSelecionar={(selecionada) => atualizarRascunho(chave, { selecionada })}
                        onEditar={() => setEditando(chave)}
                        onSalvar={(conteudo) => {
                          atualizarRascunho(chave, { ...conteudo, status: "editada", anterior: null });
                          setEditando(null);
                        }}
                        onCancelar={() => setEditando(null)}
                        onRegenerar={() =>
                          void conversar(`Refaça a aula de ${rotuloDaAula(aula)} com outra abordagem.`)
                        }
                        onDescartar={() => descartarRascunho(chave)}
                      />
                    ) : (
                      <CartaoPendente aula={aula} gerando={gerando} />
                    )}
                  </li>
                </React.Fragment>
              );
            })}
          </ul>

          {preenchimento ? (
            <RodapeDoPreenchimento
              preenchimento={preenchimento}
              onAbrir={() => void abrirNoPortal(preenchimento)}
              onProxima={proximaDoPreenchimento}
              onParar={() => {
                onGravou();
                setPreenchimento(null);
              }}
            />
          ) : (
            rascunhosNoEscopo.length > 0 && (
              <RodapeDeEnvio
                total={rascunhosNoEscopo.length}
                prontas={prontas.length}
                bloqueado={gerando || editando !== null}
                onPreencher={iniciarPreenchimento}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Legenda() {
  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="size-2 rounded-full bg-caderneta-parte" aria-hidden="true" />
        no portal
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="size-2 rounded-full border border-dashed border-muted-foreground"
          aria-hidden="true"
        />
        pendente
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// A conversa

function Conversa({
  mensagens,
  gerando,
  erro,
  escopo,
  pendentes,
  preenchidas,
  temRascunhos,
  onSugestao,
  children,
}: {
  mensagens: MensagemNaTela[];
  gerando: boolean;
  erro: string | null;
  escopo: string;
  pendentes: number;
  preenchidas: number;
  temRascunhos: boolean;
  onSugestao: (texto: string) => void;
  children: React.ReactNode;
}) {
  const fimRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, gerando, erro]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-0.5">
        {mensagens.length === 0 ? (
          <ConversaVazia
            escopo={escopo}
            pendentes={pendentes}
            preenchidas={preenchidas}
            onSugestao={onSugestao}
          />
        ) : (
          mensagens.map((mensagem, indice) => (
            <Mensagem key={indice} mensagem={mensagem} />
          ))
        )}

        {gerando && (
          <BlocoDoAssistente>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-[18px]">
              <li className="flex items-center gap-2 text-caderneta-parte">
                <IconCircleCheck className="size-3.5" />
                Li a conversa, os anexos e as aulas de base
              </li>
              <li className="flex items-center gap-2">
                <IconLoader className="size-3.5 animate-spin" />
                Escrevendo {pendentes === 1 ? "a aula pendente" : `as ${pendentes} aulas pendentes`}…
              </li>
            </ul>
          </BlocoDoAssistente>
        )}

        {erro && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{erro}</span>
          </p>
        )}

        {!gerando && temRascunhos && mensagens[mensagens.length - 1]?.papel === "assistente" && (
          <div className="flex flex-wrap gap-1.5 pl-[34px]">
            {["Deixe mais curto", "Troque as ferramentas", "Detalhe mais a metodologia"].map(
              (sugestao) => (
                <Button key={sugestao} variant="outline" size="xs" onClick={() => onSugestao(sugestao)}>
                  {sugestao}
                </Button>
              ),
            )}
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {children}
    </div>
  );
}

function ConversaVazia({
  escopo,
  pendentes,
  preenchidas,
  onSugestao,
}: {
  escopo: string;
  pendentes: number;
  preenchidas: number;
  onSugestao: (texto: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-caderneta-parte">
        <IconSparkles className="size-5" />
      </span>

      {pendentes === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Tudo de {escopo} já está no portal</p>
          <p className="text-sm text-muted-foreground">
            Não há aula pendente neste escopo. Escolha outro mês para continuar.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Diga o que foi dado em {escopo}</p>
            <p className="text-sm text-muted-foreground">
              Escreva, cole um texto ou anexe o plano de aula.{" "}
              {preenchidas > 0 &&
                `${preenchidas === 1 ? "A aula que já está" : `As ${preenchidas} aulas que já estão`} no portal ${preenchidas === 1 ? "entra" : "entram"} como base; `}
              você pode somar arquivos e aulas de outros meses.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {[
              "Continue de onde a última aula preenchida parou",
              "Siga o plano de aula anexado",
              "Use o mesmo formato das aulas já preenchidas",
            ].map((sugestao) => (
              <Button key={sugestao} variant="outline" size="sm" onClick={() => onSugestao(sugestao)}>
                {sugestao}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Mensagem({ mensagem }: { mensagem: MensagemNaTela }) {
  if (mensagem.papel === "assistente") {
    return (
      <BlocoDoAssistente>
        <p className="whitespace-pre-wrap">{mensagem.texto}</p>
      </BlocoDoAssistente>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <p className="max-w-[85%] rounded-[18px_18px_6px_18px] bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
        {mensagem.texto}
      </p>
      {((mensagem.anexos?.length ?? 0) > 0 || (mensagem.referencias?.length ?? 0) > 0) && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {mensagem.anexos?.map((nome) => (
            <Chip key={nome} icone={<IconFile className="size-3" />}>
              {nome}
            </Chip>
          ))}
          {mensagem.referencias?.map((rotulo) => (
            <Chip key={rotulo} icone={<IconNotebook className="size-3" />}>
              {rotulo}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function BlocoDoAssistente({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-caderneta-parte">
        <IconSparkles className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">{children}</div>
    </div>
  );
}

function Chip({
  icone,
  children,
  onRemover,
}: {
  icone: React.ReactNode;
  children: React.ReactNode;
  onRemover?: () => void;
}) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-xl border bg-card pr-2 pl-1.5 text-xs">
      <span className="text-muted-foreground">{icone}</span>
      <span className="truncate">{children}</span>
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          className="-mr-1 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={`Remover ${typeof children === "string" ? children : "anexo"}`}
        >
          <IconX className="size-3" />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// O compositor: o texto, os anexos e as aulas de referência

function Compositor({
  texto,
  onTexto,
  anexos,
  onAnexos,
  referencias,
  onReferencias,
  caderneta,
  aulasDaEtapa,
  etapa,
  mes,
  gerando,
  bloqueado,
  onEnviar,
  onParar,
}: {
  texto: string;
  onTexto: (texto: string) => void;
  anexos: File[];
  onAnexos: (anexos: File[]) => void;
  referencias: ReferenciaDeAula[];
  onReferencias: (referencias: ReferenciaDeAula[]) => void;
  caderneta: Caderneta;
  aulasDaEtapa: AulaDaCaderneta[];
  etapa: string;
  mes: string | null;
  gerando: boolean;
  bloqueado: boolean;
  onEnviar: () => void;
  onParar: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const podeEnviar = texto.trim().length > 0 && !gerando && !bloqueado;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-input bg-card px-3 py-2.5",
        bloqueado && "opacity-60",
      )}
    >
      {(anexos.length > 0 || referencias.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {anexos.map((arquivo, indice) => (
            <Chip
              key={`${arquivo.name}-${indice}`}
              icone={<IconFile className="size-3" />}
              onRemover={() => onAnexos(anexos.filter((_, i) => i !== indice))}
            >
              {arquivo.name}
            </Chip>
          ))}
          {referencias.map((referencia) => (
            <Chip
              key={chaveDaAula(referencia)}
              icone={<IconNotebook className="size-3" />}
              onRemover={() =>
                onReferencias(referencias.filter((outra) => !mesmaAula(outra, referencia)))
              }
            >
              Aula {dataCurta(referencia.data)}
            </Chip>
          ))}
        </div>
      )}

      <Textarea
        value={texto}
        onChange={(event) => onTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (podeEnviar) onEnviar();
          }
        }}
        placeholder="Conte o que foi dado nas aulas, cole um texto ou anexe o plano…"
        disabled={bloqueado}
        className="min-h-11 border-0 bg-transparent px-0 py-0 focus-visible:ring-0"
        aria-label="Mensagem para o agente"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const escolhidos = Array.from(event.target.files ?? []);
              if (escolhidos.length > 0) onAnexos([...anexos, ...escolhidos]);
              event.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={bloqueado}
            onClick={() => inputRef.current?.click()}
          >
            <IconPaperclip data-icon="inline-start" />
            Anexar
          </Button>

          <SeletorDeReferencias
            caderneta={caderneta}
            aulasDaEtapa={aulasDaEtapa}
            etapa={etapa}
            mes={mes}
            referencias={referencias}
            onReferencias={onReferencias}
            disabled={bloqueado}
          />
        </div>

        {gerando ? (
          <Button variant="outline" size="sm" onClick={onParar}>
            <IconPlayerStop data-icon="inline-start" />
            Parar
          </Button>
        ) : (
          <Button size="icon-sm" onClick={onEnviar} disabled={!podeEnviar} aria-label="Enviar">
            <IconSend />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * As aulas de outros meses e etapas que já têm conteúdo, para o auxiliar de
 * ensino escolher como base. As outras etapas só são lidas quando o seletor
 * abre: a maioria das conversas nem chega a precisar delas.
 */
function SeletorDeReferencias({
  caderneta,
  aulasDaEtapa,
  etapa,
  mes,
  referencias,
  onReferencias,
  disabled,
}: {
  caderneta: Caderneta;
  aulasDaEtapa: AulaDaCaderneta[];
  etapa: string;
  mes: string | null;
  referencias: ReferenciaDeAula[];
  onReferencias: (referencias: ReferenciaDeAula[]) => void;
  disabled: boolean;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [outrasEtapas, setOutrasEtapas] = React.useState<AulaDaCaderneta[] | null>(null);
  const [carregando, setCarregando] = React.useState(false);

  function abrir(proximo: boolean) {
    setAberto(proximo);
    if (!proximo || outrasEtapas !== null || carregando) return;

    setCarregando(true);
    Promise.all(
      caderneta.etapas
        .filter((outra) => outra.nome !== etapa)
        .map((outra) => loadAulasDaEtapa(caderneta.id, outra.nome).catch(() => [])),
    )
      .then((listas) => setOutrasEtapas(listas.flat()))
      .finally(() => setCarregando(false));
  }

  // As aulas do escopo já vão como base por conta própria; aqui entram as
  // outras, da mais recente para a mais antiga — a vizinha costuma ser a melhor.
  const candidatas = aulasComConteudo([...aulasDaEtapa, ...(outrasEtapas ?? [])])
    .filter((aula) => !(aula.etapa === etapa && (mes === null || aula.mes === mes)))
    .sort((a, b) => ordemCronologica(b.data) - ordemCronologica(a.data));
  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? candidatas.filter(
        (aula) =>
          aula.data.includes(termo) ||
          (aula.desenvolvimento ?? "").toLowerCase().includes(termo) ||
          (aula.codigoCR ?? "").toLowerCase().includes(termo),
      )
    : candidatas;

  const grupos: { titulo: string; aulas: AulaDaCaderneta[] }[] = [];
  for (const aula of visiveis) {
    const titulo = `${aula.etapa} · ${aula.mes}`;
    const grupo = grupos.find((candidato) => candidato.titulo === titulo);
    if (grupo) grupo.aulas.push(aula);
    else grupos.push({ titulo, aulas: [aula] });
  }

  function alternar(aula: AulaDaCaderneta, marcada: boolean) {
    onReferencias(
      marcada
        ? [...referencias, { etapa: aula.etapa, data: aula.data, ordem: aula.ordem }]
        : referencias.filter((outra) => !mesmaAula(outra, aula)),
    );
  }

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={disabled}>
          <IconNotebook data-icon="inline-start" />
          Outras aulas
          {referencias.length > 0 && (
            <Badge className="h-4 rounded-full border-0 bg-primary/20 px-1.5 text-[11px] text-primary">
              {referencias.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-[26rem] gap-2.5 p-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por data ou conteúdo"
            className="pl-8.5"
            aria-label="Buscar aula de referência"
          />
        </div>

        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {carregando && (
            <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <IconLoader className="size-3.5 animate-spin" />
              Lendo as outras etapas…
            </p>
          )}

          {!carregando && grupos.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {candidatas.length === 0
                ? "Nenhuma aula com conteúdo no portal ainda."
                : "Nenhuma aula bate com a busca."}
            </p>
          )}

          {grupos.map((grupo) => (
            <React.Fragment key={grupo.titulo}>
              <p className="px-2 pt-2 pb-0.5 text-xs font-medium text-muted-foreground first:pt-0">
                {grupo.titulo}
              </p>
              {grupo.aulas.map((aula) => {
                const marcada = referencias.some((referencia) => mesmaAula(referencia, aula));
                const id = `referencia-${chaveDaAula(aula)}`;
                return (
                  <label
                    key={chaveDaAula(aula)}
                    htmlFor={id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5",
                      marcada ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <Checkbox
                      id={id}
                      checked={marcada}
                      onCheckedChange={(valor) => alternar(aula, valor === true)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline gap-1.5 text-sm">
                        <span className="font-medium tabular-nums">{dataCurta(aula.data)}</span>
                        {aula.ordem !== null && (
                          <span className="text-xs text-muted-foreground">ordem {aula.ordem}</span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {aula.desenvolvimento}
                      </span>
                    </span>
                  </label>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">
            {referencias.length === 0
              ? "Nenhuma escolhida"
              : `${referencias.length} ${referencias.length === 1 ? "escolhida" : "escolhidas"}`}
          </span>
          <Button size="sm" onClick={() => setAberto(false)}>
            Pronto
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Os cartões das aulas

function CabecalhoDaAula({ aula, children }: { aula: AulaDaCaderneta; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium tabular-nums">Aula {dataCurta(aula.data)}</span>
        {aula.ordem !== null && (
          <span className="text-xs text-muted-foreground">ordem {aula.ordem}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function CampoDaAula({
  rotulo,
  children,
  className,
}: {
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="text-[13px] leading-[19px] whitespace-pre-wrap text-foreground/85">
        {children}
      </dd>
    </div>
  );
}

function CodigoCR({ codigoCR }: { codigoCR: string }) {
  const habilidades = habilidadesDoCodigoCR(codigoCR);
  if (habilidades.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="flex flex-col gap-1">
      {habilidades.map((habilidade, indice) => (
        <span key={indice} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {habilidade.codigo && (
            <Badge variant="outline" className="font-mono">
              {habilidade.codigo}
            </Badge>
          )}
          <span className={cn(habilidade.codigo && "text-xs text-muted-foreground")}>
            {habilidade.texto}
          </span>
        </span>
      ))}
    </span>
  );
}

function CartaoNoPortal({ aula }: { aula: AulaDaCaderneta }) {
  const campos = [
    { rotulo: "Código CR", texto: aula.codigoCR },
    { rotulo: "Desenvolvimento / Metodologia", texto: aula.desenvolvimento },
    { rotulo: "Ferramentas utilizadas", texto: aula.ferramentas },
  ].filter((campo): campo is { rotulo: string; texto: string } => campo.texto !== null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 opacity-90">
      <CabecalhoDaAula aula={aula}>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-caderneta-parte">
          <IconCheck />
          No portal
        </Badge>
      </CabecalhoDaAula>

      {campos.length > 0 && (
        <dl className="flex flex-col gap-1.5 border-t border-primary/20 pt-2">
          {campos.map((campo) => (
            <CampoDaAula key={campo.rotulo} rotulo={campo.rotulo}>
              {campo.rotulo === "Código CR" ? <CodigoCR codigoCR={campo.texto} /> : campo.texto}
            </CampoDaAula>
          ))}
        </dl>
      )}
    </div>
  );
}

function CartaoPendente({ aula, gerando }: { aula: AulaDaCaderneta; gerando: boolean }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed px-3 py-2.5">
      <CabecalhoDaAula aula={aula}>
        {gerando ? (
          <span className="text-xs text-muted-foreground">Na fila</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconClock className="size-3.5" />
            Sem conteúdo
          </span>
        )}
      </CabecalhoDaAula>

      {gerando && (
        <div className="flex flex-col gap-1.5 border-t pt-2" aria-hidden="true">
          <span className="h-2.5 w-1/3 animate-pulse rounded-md bg-muted" />
          <span className="h-3 w-11/12 animate-pulse rounded-md bg-muted" />
          <span className="h-3 w-3/4 animate-pulse rounded-md bg-muted" />
        </div>
      )}
    </div>
  );
}

const STATUS_DO_RASCUNHO: Record<StatusDoRascunho, { rotulo: string; icone: React.ReactNode }> = {
  gerada: { rotulo: "Gerada", icone: <IconSparkles /> },
  atualizada: { rotulo: "Atualizada agora", icone: <IconRefresh /> },
  editada: { rotulo: "Editada", icone: <IconPencil /> },
};

function CartaoDoRascunho({
  aula,
  rascunho,
  editando,
  preenchendo,
  bloqueado,
  onSelecionar,
  onEditar,
  onSalvar,
  onCancelar,
  onRegenerar,
  onDescartar,
}: {
  aula: AulaDaCaderneta;
  rascunho: Rascunho;
  editando: boolean;
  preenchendo: boolean;
  bloqueado: boolean;
  onSelecionar: (selecionada: boolean) => void;
  onEditar: () => void;
  onSalvar: (conteudo: Pick<RascunhoDeConteudo, "codigoCR" | "desenvolvimento" | "ferramentas">) => void;
  onCancelar: () => void;
  onRegenerar: () => void;
  onDescartar: () => void;
}) {
  const status = STATUS_DO_RASCUNHO[rascunho.status];
  const destacado = rascunho.status === "atualizada" || preenchendo;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 transition-[box-shadow,border-color]",
        destacado && "border-primary/40 ring-3 ring-primary/15",
        !rascunho.selecionada && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={rascunho.selecionada}
          onCheckedChange={(valor) => onSelecionar(valor === true)}
          disabled={bloqueado}
          aria-label={
            rascunho.selecionada
              ? `Deixar a aula de ${dataCurta(aula.data)} fora do portal`
              : `Levar a aula de ${dataCurta(aula.data)} ao portal`
          }
        />
        <CabecalhoDaAula aula={aula}>
          {preenchendo ? (
            <Badge variant="secondary" className="text-caderneta-parte">
              <IconLoader className="animate-spin" />
              Preenchendo
            </Badge>
          ) : (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-caderneta-parte">
              {status.icone}
              {status.rotulo}
            </Badge>
          )}
        </CabecalhoDaAula>
      </div>

      {editando ? (
        <EdicaoDoRascunho rascunho={rascunho} onSalvar={onSalvar} onCancelar={onCancelar} />
      ) : (
        <>
          <dl className="flex flex-col gap-2">
            <CampoDaAula rotulo="Código CR">
              <CodigoCR codigoCR={rascunho.codigoCR} />
            </CampoDaAula>
            <CampoDaAula rotulo="Desenvolvimento / Metodologia">
              <TextoComMudancas
                atual={rascunho.desenvolvimento}
                anterior={rascunho.anterior?.desenvolvimento}
              />
            </CampoDaAula>
            <CampoDaAula rotulo="Ferramentas utilizadas">
              <TextoComMudancas
                atual={rascunho.ferramentas}
                anterior={rascunho.anterior?.ferramentas}
              />
            </CampoDaAula>
          </dl>

          <div className="flex items-center justify-end gap-0.5 border-t pt-1.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={onEditar}
              disabled={bloqueado}
              aria-label={`Editar a aula de ${dataCurta(aula.data)}`}
            >
              <IconPencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={onRegenerar}
              disabled={bloqueado}
              aria-label={`Refazer a aula de ${dataCurta(aula.data)}`}
            >
              <IconRefresh />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={onDescartar}
              disabled={bloqueado}
              aria-label={`Descartar o rascunho da aula de ${dataCurta(aula.data)}`}
            >
              <IconTrash />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** O texto atual com o que mudou desde a rodada anterior em destaque. */
function TextoComMudancas({ atual, anterior }: { atual: string; anterior?: string }) {
  if (!atual) return <span className="text-muted-foreground">—</span>;
  if (anterior === undefined || anterior === atual) return <>{atual}</>;

  return (
    <>
      {diffDePalavras(anterior, atual).map((trecho, indice) =>
        trecho.novo ? (
          <mark key={indice} className="rounded-[3px] bg-primary/15 px-0.5 text-inherit">
            {trecho.texto}
          </mark>
        ) : (
          <React.Fragment key={indice}>{trecho.texto}</React.Fragment>
        ),
      )}
    </>
  );
}

function EdicaoDoRascunho({
  rascunho,
  onSalvar,
  onCancelar,
}: {
  rascunho: Rascunho;
  onSalvar: (conteudo: Pick<RascunhoDeConteudo, "codigoCR" | "desenvolvimento" | "ferramentas">) => void;
  onCancelar: () => void;
}) {
  const [codigoCR, setCodigoCR] = React.useState(rascunho.codigoCR);
  const [desenvolvimento, setDesenvolvimento] = React.useState(rascunho.desenvolvimento);
  const [ferramentas, setFerramentas] = React.useState(rascunho.ferramentas);

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Código CR</span>
        <Textarea
          value={codigoCR}
          onChange={(event) => setCodigoCR(event.target.value)}
          className="min-h-9 text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Desenvolvimento / Metodologia</span>
        <Textarea
          value={desenvolvimento}
          onChange={(event) => setDesenvolvimento(event.target.value)}
          className="min-h-20 text-[13px]"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Ferramentas utilizadas</span>
        <Textarea
          value={ferramentas}
          onChange={(event) => setFerramentas(event.target.value)}
          className="min-h-9 text-[13px]"
        />
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => onSalvar({ codigoCR, desenvolvimento, ferramentas })}>
          <IconCheck data-icon="inline-start" />
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// O rodapé: mandar para o portal, e o preenchimento em andamento

function RodapeDeEnvio({
  total,
  prontas,
  bloqueado,
  onPreencher,
}: {
  total: number;
  prontas: number;
  bloqueado: boolean;
  onPreencher: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">
          {prontas === 0
            ? "Nenhuma aula marcada"
            : `${prontas} ${prontas === 1 ? "aula pronta" : "aulas prontas"} para o portal`}
          {prontas > 0 && prontas < total && (
            <span className="font-normal text-muted-foreground"> · {total - prontas} de fora</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          Cada aula abre numa janela do portal para você conferir e salvar.
        </span>
      </div>
      <Button onClick={onPreencher} disabled={bloqueado || prontas === 0} className="shrink-0">
        <IconUpload data-icon="inline-start" />
        Preencher no portal
      </Button>
    </div>
  );
}

function RodapeDoPreenchimento({
  preenchimento,
  onAbrir,
  onProxima,
  onParar,
}: {
  preenchimento: Preenchimento;
  onAbrir: () => void;
  onProxima: () => void;
  onParar: () => void;
}) {
  const { fila, indice, abrindo, aberta, erro } = preenchimento;
  const aula = fila[indice];
  const ultima = indice === fila.length - 1;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {abrindo ? (
            <IconLoader className="size-4 shrink-0 animate-spin text-caderneta-parte" />
          ) : erro ? (
            <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
          ) : (
            <IconExternalLink className="size-4 shrink-0 text-caderneta-parte" />
          )}
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">
              {abrindo ? "Abrindo no portal" : erro ? "Não abriu" : "Aberta no portal"} · {indice + 1} de{" "}
              {fila.length}
            </span>
            <span className={cn("text-xs", erro ? "text-destructive" : "text-muted-foreground")}>
              {erro ??
                (abrindo
                  ? `Aula de ${dataCurta(aula.data)} · Lançamento de Conteúdo.`
                  : `Aula de ${dataCurta(aula.data)} com o conteúdo preenchido. Confira e salve por lá — o sistema não salva por você.`)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onParar} disabled={abrindo}>
            <IconPlayerStop data-icon="inline-start" />
            Parar
          </Button>
          {erro ? (
            <Button size="sm" onClick={onAbrir}>
              Tentar de novo
            </Button>
          ) : (
            <Button size="sm" onClick={onProxima} disabled={abrindo || !aberta}>
              {ultima ? "Concluir" : "Próxima"}
              {!ultima && <IconArrowRight data-icon="inline-end" />}
            </Button>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-caderneta-parte transition-[width] duration-500"
          style={{ width: `${((indice + (aberta ? 1 : 0.5)) / fila.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
