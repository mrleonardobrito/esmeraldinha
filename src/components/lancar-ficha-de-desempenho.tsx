import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconLoader,
  IconPaperclip,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { CadernetaPorTurma } from "@/components/caderneta-por-turma";
import { PreviaDaFichaView } from "@/components/previa-da-ficha";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Caderneta } from "@/lib/cadernetas";
import {
  aplicarNaFicha,
  descartarPrevia,
  ETAPAS_DA_FICHA,
  gerarPrevia,
  iniciarPreenchimentoDaFicha,
  lerEstruturaDaFicha,
  loadEstadoDoPreenchimento,
  loadEstruturaDaFicha,
  loadPrevia,
  nomeDaArea,
  pendenciasAntesDeAbrir,
  ajustarPrevia,
  TODAS_AS_ETAPAS,
  type EstadoDoPreenchimento,
  type EstruturaDaFicha,
  type Excecao,
  type IndiceDaEtapa,
  type PreviaDaFicha,
} from "@/lib/fichas-de-desempenho";
import { cn } from "@/lib/utils";

export interface LancarFichaDeDesempenhoProps {
  caderneta: Caderneta;
  /** The etapa the grade was opened from; the screen fills all four by default. */
  etapa: string;
  onClose: () => void;
}

/**
 * The ficha de desempenho of a turma, all four etapas at once by default:
 * choose the áreas, give the professor's observações, review and edit the
 * prévia estudante by estudante, then walk through the portal one estudante
 * at a time. Saving on the portal stays with the auxiliar de ensino.
 */
export function LancarFichaDeDesempenho(props: LancarFichaDeDesempenhoProps) {
  return (
    <CadernetaPorTurma caderneta={props.caderneta} onClose={props.onClose}>
      {(caderneta, picker) => <FichaDaTurma {...props} caderneta={caderneta} picker={picker} />}
    </CadernetaPorTurma>
  );
}

const EM_ANDAMENTO: EstadoDoPreenchimento["status"][] = ["abrindo", "preenchendo", "aguardando-auxiliar"];
const mensagemDe = (error: unknown, padrao: string) => (error instanceof Error ? error.message : padrao);
const ativo = (situacao: string | null) => !situacao || situacao.toUpperCase() === "ATIVO";

function FichaDaTurma({ caderneta, onClose, picker }: LancarFichaDeDesempenhoProps & { picker: React.ReactNode }) {
  const turma = caderneta.turmas.length > 1 ? caderneta.turma : undefined;
  const [estrutura, setEstrutura] = React.useState<EstruturaDaFicha | null | "carregando">("carregando");
  const [lendo, setLendo] = React.useState(false);
  const [etapas, setEtapas] = React.useState<IndiceDaEtapa[]>([...TODAS_AS_ETAPAS]);
  const [areas, setAreas] = React.useState<number[]>([]);
  const [texto, setTexto] = React.useState("");
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [gerando, setGerando] = React.useState(false);
  const [previa, setPrevia] = React.useState<PreviaDaFicha | null>(null);
  /** The áreas the observações were read for; others entered the prévia with R. */
  const [areasGeradas, setAreasGeradas] = React.useState<number[]>([]);
  const [execucao, setExecucao] = React.useState<EstadoDoPreenchimento | null>(null);
  /** With a prévia, the modal shows only its table; the setup comes back on demand. */
  const [vendoPrevia, setVendoPrevia] = React.useState(false);
  const [avisosAbertos, setAvisosAbertos] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const entrada = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let vivo = true;
    loadEstruturaDaFicha(caderneta.id, turma)
      .then((lida) => vivo && setEstrutura(lida))
      .catch((error: unknown) => {
        if (!vivo) return;
        setEstrutura(null);
        setErro(mensagemDe(error, "Não foi possível carregar a ficha."));
      });
    loadPrevia(caderneta.id, turma)
      .then((salva) => {
        if (!vivo || !salva) return;
        setPrevia(salva);
        setVendoPrevia(true);
        setAreasGeradas(salva.areas);
        setAreas(salva.areas);
        setEtapas(salva.etapas);
      })
      .catch((error: unknown) => vivo && setErro(mensagemDe(error, "Não foi possível carregar a prévia salva.")));
    loadEstadoDoPreenchimento(caderneta.id, turma).then((estado) => vivo && setExecucao(estado)).catch(() => {});
    return () => { vivo = false; };
  }, [caderneta.id, turma]);

  const emAndamento = execucao !== null && EM_ANDAMENTO.includes(execucao.status);
  React.useEffect(() => {
    if (!emAndamento) return;
    const timer = window.setInterval(() => {
      loadEstadoDoPreenchimento(caderneta.id, turma).then(setExecucao).catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [emAndamento, caderneta.id, turma]);

  const ficha = estrutura === "carregando" ? null : estrutura;
  const areasNovas = ficha?.areas.filter((area) => areas.includes(area.indice) && !areasGeradas.includes(area.indice)) ?? [];
  const quantosAvisos = previa
    ? previa.gerais.length + previa.naoResolvidos.length + previa.descartadas.length + (previa.resposta ? 1 : 0)
    : 0;
  const ativos = previa?.estudantes.filter((e) => ativo(e.situacao)) ?? [];

  function descreverHabilidade({ area, habilidade }: { area: number; habilidade: number }): string {
    const encontrada = ficha?.areas.find((a) => a.indice === area);
    const h = encontrada?.habilidades.find((candidata) => candidata.indice === habilidade);
    return `${encontrada ? nomeDaArea(encontrada.titulo) : `Área ${area}`} · ${h ? `${h.numero} ${h.texto}` : `habilidade ${habilidade}`}`;
  }

  /** Checking or unchecking an área or etapa changes the prévia at once. */
  function marcar(novasAreas: number[], novasEtapas: IndiceDaEtapa[]) {
    setAreas(novasAreas);
    setEtapas(novasEtapas);
    if (previa && ficha) setPrevia(ajustarPrevia(previa, ficha.areas, novasAreas, novasEtapas));
  }

  /** Edits live on screen only: they go to the portal with "Preencher no portal". */
  function editar(nova: PreviaDaFicha) {
    setPrevia(nova);
  }

  function aplicar(matriculas: readonly string[], excecoes: readonly Excecao[]): PreviaDaFicha["estudantes"] {
    return (previa?.estudantes ?? []).map((e) =>
      matriculas.includes(e.matricula) ? { ...e, conceitos: aplicarNaFicha(e.conceitos, excecoes, previa!.etapas) } : e);
  }

  async function lerFicha() {
    setLendo(true);
    setErro(null);
    try {
      const lida = await lerEstruturaDaFicha(caderneta.id, turma);
      setEstrutura(lida);
      setAreas((atuais) => atuais.filter((indice) => lida.areas.some((a) => a.indice === indice)));
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível ler a ficha no portal."));
    } finally {
      setLendo(false);
    }
  }

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const nova = await gerarPrevia(caderneta.id, { areas, etapas, texto, arquivos }, undefined, turma);
      setPrevia(nova);
      setAreasGeradas(nova.areas);
      setVendoPrevia(true);
      setAvisosAbertos(pendenciasAntesDeAbrir(nova.naoResolvidos) > 0);
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível gerar a prévia."));
    } finally {
      setGerando(false);
    }
  }

  async function descartar() {
    setErro(null);
    try {
      await descartarPrevia(caderneta.id, turma);
      setPrevia(null);
      setVendoPrevia(false);
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível descartar a prévia."));
    }
  }

  async function preencher() {
    setErro(null);
    try {
      if (!previa) return;
      setExecucao(await iniciarPreenchimentoDaFicha(caderneta.id, previa, turma));
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível abrir o portal."));
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className={cn("flex max-h-[92vh] flex-col gap-4 sm:max-w-6xl", previa && vendoPrevia && "h-[92vh]")}>
        <DialogHeader>
          <DialogTitle className="font-heading">Ficha de desempenho</DialogTitle>
          <DialogDescription>{caderneta.turma}</DialogDescription>
        </DialogHeader>

        {picker}

        {previa && ficha && vendoPrevia ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Prévia</span>
              <span className="text-muted-foreground">
                {previa.etapas.map((e) => ETAPAS_DA_FICHA[e - 1].replace(" ETAPA", "")).join(", ")} ETAPA ·{" "}
                {ficha.areas.filter((a) => previa.areas.includes(a.indice)).map((a) => nomeDaArea(a.titulo)).join(", ")}
              </span>
              {quantosAvisos > 0 && (
                <Button
                  size="sm"
                  variant={pendenciasAntesDeAbrir(previa.naoResolvidos) > 0 ? "destructive" : "outline"}
                  className="ml-auto"
                  aria-expanded={avisosAbertos}
                  onClick={() => setAvisosAbertos((aberto) => !aberto)}
                >
                  <IconAlertTriangle data-icon="inline-start" />
                  Avisos ({quantosAvisos})
                </Button>
              )}
              <Button size="sm" variant="ghost" className={cn(quantosAvisos === 0 && "ml-auto")} onClick={() => setVendoPrevia(false)} disabled={emAndamento}>
                <IconArrowLeft data-icon="inline-start" />
                Alterar observações
              </Button>
            </div>

            {avisosAbertos && (
              <div className="flex max-h-[35%] shrink-0 flex-col gap-2 overflow-y-auto">
              {previa.resposta && <p className="text-sm text-muted-foreground">{previa.resposta}</p>}

              {previa.descartadas.map((item, indice) => (
                <p key={indice} className="flex gap-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-sm">
                  <IconAlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                  <span>Não aplicado: “{item.trecho}”. {item.motivo}</span>
                </p>
              ))}

              {previa.naoResolvidos.map((item, indice) => (
                <div key={`${item.estudante}-${indice}`} className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                  <span>Não sei quem é “{item.estudante}”.</span>
                  {item.excecoes.length > 0 && (
                    <ul className="text-xs text-muted-foreground">
                      {item.excecoes.map((e) => <li key={`${e.area}.${e.habilidade}`}>{e.conceito} · {descreverHabilidade(e)}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-foreground"
                      disabled={gerando || emAndamento}
                      defaultValue=""
                      aria-label={`Escolher o estudante para ${item.estudante}`}
                      onChange={(event) => {
                        if (!event.target.value) return;
                        editar({
                          ...previa,
                          estudantes: aplicar([event.target.value], item.excecoes),
                          naoResolvidos: previa.naoResolvidos.filter((_, i) => i !== indice),
                        });
                      }}
                    >
                      <option value="">Quem é?</option>
                      {(item.candidatos.length > 0 ? ativos.filter((e) => item.candidatos.includes(e.matricula)) : ativos)
                        .map((e) => <option key={e.matricula} value={e.matricula}>{e.nome}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" disabled={gerando || emAndamento} onClick={() => editar({ ...previa, naoResolvidos: previa.naoResolvidos.filter((_, i) => i !== indice) })}>
                      Ignorar
                    </Button>
                  </div>
                </div>
              ))}

              {previa.gerais.map((geral, indice) => (
                <div key={indice} className="flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span>{geral.estudante ? `Sobre ${geral.estudante.nome}` : "Sobre a turma"}: “{geral.trecho}”</span>
                  <ul className="text-xs text-muted-foreground">
                    {geral.excecoes.map((e) => <li key={`${e.area}.${e.habilidade}`}>{e.conceito} · {descreverHabilidade(e)}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={gerando || emAndamento} onClick={() => editar({
                      ...previa,
                      estudantes: aplicar(geral.estudante ? [geral.estudante.matricula] : ativos.map((e) => e.matricula), geral.excecoes),
                      gerais: previa.gerais.filter((_, i) => i !== indice),
                    })}>
                      {geral.estudante ? `Aplicar a ${geral.estudante.nome}` : "Aplicar a todos"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={gerando || emAndamento} onClick={() => editar({ ...previa, gerais: previa.gerais.filter((_, i) => i !== indice) })}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}

              </div>
            )}

            {execucao && <Andamento execucao={execucao} descrever={descreverHabilidade} />}
            {erro && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

            <PreviaDaFichaView
              className="min-h-0 flex-1"
              previa={previa}
              areas={ficha.areas}
              disabled={emAndamento || gerando}
              onChange={editar}
            />
          </div>
        ) : (
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          <section className="flex flex-col gap-2" aria-labelledby="etapas-titulo">
            <h3 id="etapas-titulo" className="text-sm font-medium">Etapas</h3>
            <div className="flex flex-wrap gap-2">
              {TODAS_AS_ETAPAS.map((etapa) => {
                const id = `etapa-${etapa}`;
                return (
                  <div key={etapa} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                    <Checkbox
                      id={id}
                      checked={etapas.includes(etapa)}
                      disabled={emAndamento}
                      onCheckedChange={(marcado) => marcar(
                        areas,
                        marcado ? [...etapas, etapa].sort((a, b) => a - b) : etapas.filter((e) => e !== etapa),
                      )}
                    />
                    <Label htmlFor={id} className="font-normal">{ETAPAS_DA_FICHA[etapa - 1]}</Label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-labelledby="areas-titulo">
            <div className="flex items-center gap-2">
              <h3 id="areas-titulo" className="text-sm font-medium">Áreas de conhecimento</h3>
              {ficha && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void lerFicha()} disabled={lendo || emAndamento}>
                  {lendo ? <IconLoader data-icon="inline-start" className="animate-spin" /> : <IconRefresh data-icon="inline-start" />}
                  Reler no portal
                </Button>
              )}
            </div>
            {estrutura === "carregando" ? (
              <p role="status" className="text-sm text-muted-foreground">Carregando…</p>
            ) : !ficha ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center">
                <IconFileText className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">A ficha desta turma ainda não foi lida</p>
                <p className="text-sm text-muted-foreground">
                  A Esmeraldinha abre a ficha de um estudante no portal para descobrir as áreas e habilidades. Nada é salvo.
                </p>
                <Button variant="outline" onClick={() => void lerFicha()} disabled={lendo}>
                  {lendo && <IconLoader data-icon="inline-start" className="animate-spin" />}
                  {lendo ? "Lendo a ficha…" : "Ler a ficha no portal"}
                </Button>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ficha.areas.map((area) => {
                  const id = `area-${area.indice}`;
                  return (
                    <li key={area.indice} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                      <Checkbox
                        id={id}
                        checked={areas.includes(area.indice)}
                        disabled={emAndamento}
                        onCheckedChange={(marcado) => marcar(
                          marcado ? [...areas, area.indice].sort((a, b) => a - b) : areas.filter((i) => i !== area.indice),
                          etapas,
                        )}
                      />
                      <Label htmlFor={id} className="flex-1 font-normal" title={area.titulo}>
                        {nomeDaArea(area.titulo)}
                      </Label>
                      <span className="text-xs text-muted-foreground">{area.habilidades.length}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {ficha && (
            <section className="flex flex-col gap-2" aria-labelledby="observacoes-titulo">
              <h3 id="observacoes-titulo" className="text-sm font-medium">Observações do professor</h3>
              <p className="text-sm text-muted-foreground">
                Quem não aparecer nas observações fica com R. Uma observação sem etapa vale para todas as etapas marcadas.
              </p>
              <Textarea
                value={texto}
                onChange={(event) => setTexto(event.target.value)}
                placeholder="Cole aqui o que o professor mandou sobre os estudantes."
                rows={3}
                disabled={emAndamento}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={entrada}
                  type="file"
                  multiple
                  hidden
                  accept="image/*,application/pdf,.doc,.docx,.txt"
                  onChange={(event) => {
                    const novos = Array.from(event.target.files ?? []);
                    setArquivos((atuais) => [...atuais, ...novos]);
                    event.target.value = "";
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => entrada.current?.click()} disabled={emAndamento}>
                  <IconPaperclip data-icon="inline-start" />
                  Anexar arquivo
                </Button>
                {arquivos.map((arquivo, indice) => (
                  <span key={`${arquivo.name}-${indice}`} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                    {arquivo.name}
                    <button
                      type="button"
                      aria-label={`Remover ${arquivo.name}`}
                      onClick={() => setArquivos((atuais) => atuais.filter((_, i) => i !== indice))}
                    >
                      <IconX className="size-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <Button
                  size="sm"
                  className="ml-auto"
                  onClick={() => void gerar()}
                  disabled={gerando || emAndamento || areas.length === 0 || etapas.length === 0 || (!texto.trim() && arquivos.length === 0)}
                >
                  {gerando ? <IconLoader data-icon="inline-start" className="animate-spin" /> : <IconSparkles data-icon="inline-start" />}
                  {gerando ? "Gerando…" : previa ? "Gerar a prévia de novo" : "Gerar prévia"}
                </Button>
              </div>
            </section>
          )}

          {previa && areasNovas.length > 0 && (
            <p className="rounded-xl bg-yellow-500/10 px-3 py-2 text-sm">
              {areasNovas.map((area) => nomeDaArea(area.titulo)).join(", ")} entrou na prévia com R em tudo: as observações
              só valem para essa área se você gerar a prévia de novo.
            </p>
          )}

          {execucao && <Andamento execucao={execucao} descrever={descreverHabilidade} />}

          {erro && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>
        )}

        <DialogFooter>
          {previa && (
            <Button variant="ghost" onClick={() => void descartar()} disabled={emAndamento} className="sm:mr-auto">
              <IconTrash data-icon="inline-start" />
              Descartar prévia
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {previa && !vendoPrevia ? (
            // While setting up, the way forward is the prévia; filling happens from it.
            <Button onClick={() => setVendoPrevia(true)} disabled={gerando}>
              <IconEye data-icon="inline-start" />
              Ver prévia
            </Button>
          ) : previa ? (
            <Button
              onClick={() => void preencher()}
              disabled={
                emAndamento || gerando || areas.length === 0 || etapas.length === 0 ||
                pendenciasAntesDeAbrir(previa.naoResolvidos) > 0
              }
            >
              {emAndamento ? <IconLoader data-icon="inline-start" className="animate-spin" /> : <IconExternalLink data-icon="inline-start" />}
              {emAndamento ? "Preenchimento em andamento" : "Preencher no portal"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO: Record<EstadoDoPreenchimento["status"], string> = {
  abrindo: "Abrindo a ficha no portal…",
  preenchendo: "Preenchendo",
  "aguardando-auxiliar": "Confira a ficha no portal e clique em Salvar e próximo",
  concluido: "Todos os estudantes foram preenchidos. Confira se a última ficha foi salva.",
  interrompido: "Preenchimento interrompido",
  falhou: "O preenchimento falhou",
};

function Andamento({ execucao, descrever }: {
  execucao: EstadoDoPreenchimento;
  descrever: (h: { area: number; habilidade: number }) => string;
}) {
  const mantidos = execucao.preenchidos.filter((p) => p.mantidos.length > 0);
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-primary/10 px-3 py-3 text-sm" aria-live="polite">
      <p className={cn("font-medium", execucao.status === "falhou" && "text-destructive")}>
        {ROTULO[execucao.status]}
        {execucao.atual && <> — {execucao.atual.nome}</>}
      </p>
      <p className="text-muted-foreground">
        {execucao.preenchidos.length} de {execucao.total || "?"} estudantes preenchidos · {execucao.etapa}
      </p>
      {execucao.erro && <p className="text-destructive">{execucao.erro}</p>}
      {mantidos.map((p) => (
        <div key={p.matricula}>
          <span className="font-medium">{p.nome}</span>: conceito ajustado para não diminuir entre etapas
          <ul className="text-xs text-muted-foreground">
            {p.mantidos.map((m) => (
              <li key={`${m.area}.${m.habilidade}.${m.etapa}`}>
                {descrever(m)} — {ETAPAS_DA_FICHA[m.etapa - 1]}: planejado {m.planejado}, escrito {m.escrito} por causa da {ETAPAS_DA_FICHA[m.etapaDeReferencia - 1]} no portal
              </li>
            ))}
          </ul>
        </div>
      ))}
      {execucao.pulados.map((p) => (
        <p key={p.matricula} className="text-muted-foreground">{p.nome || p.matricula} não foi preenchido: {p.motivo}</p>
      ))}
    </section>
  );
}
