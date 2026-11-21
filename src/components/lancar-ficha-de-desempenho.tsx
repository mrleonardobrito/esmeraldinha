import * as React from "react";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconFileText,
  IconLoader,
  IconPaperclip,
  IconRefresh,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";

import { CadernetaPorTurma } from "@/components/caderneta-por-turma";
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
  excecoesParaEnviar,
  iniciarPreenchimentoDaFicha,
  interpretarObservacoes,
  lerEstruturaDaFicha,
  loadEstadoDoPreenchimento,
  loadEstruturaDaFicha,
  nomeDaArea,
  type EstadoDoPreenchimento,
  type EstruturaDaFicha,
  type Excecao,
  type ExcecaoComTrecho,
  type ObservacoesInterpretadas,
} from "@/lib/fichas-de-desempenho";
import { cn } from "@/lib/utils";

export interface LancarFichaDeDesempenhoProps {
  caderneta: Caderneta;
  etapa: string;
  onClose: () => void;
}

/**
 * The ficha de desempenho of one etapa: choose the áreas, give the
 * professor's observações, review the exceções and walk through the portal
 * one estudante at a time. Saving stays with the auxiliar de ensino.
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

function FichaDaTurma({ caderneta, etapa, onClose, picker }: LancarFichaDeDesempenhoProps & { picker: React.ReactNode }) {
  const turma = caderneta.turmas.length > 1 ? caderneta.turma : undefined;
  const [estrutura, setEstrutura] = React.useState<EstruturaDaFicha | null | "carregando">("carregando");
  const [lendo, setLendo] = React.useState(false);
  const [areas, setAreas] = React.useState<number[]>([]);
  const [texto, setTexto] = React.useState("");
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [interpretando, setInterpretando] = React.useState(false);
  const [lidas, setLidas] = React.useState<ObservacoesInterpretadas | null>(null);
  const [revisao, setRevisao] = React.useState<Record<string, ExcecaoComTrecho[]>>({});
  const [gerais, setGerais] = React.useState<ObservacoesInterpretadas["gerais"]>([]);
  const [naoResolvidos, setNaoResolvidos] = React.useState<ObservacoesInterpretadas["naoResolvidos"]>([]);
  const [execucao, setExecucao] = React.useState<EstadoDoPreenchimento | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const entrada = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let ativo = true;
    loadEstruturaDaFicha(caderneta.id, turma)
      .then((lida) => ativo && setEstrutura(lida))
      .catch((error: unknown) => {
        if (!ativo) return;
        setEstrutura(null);
        setErro(mensagemDe(error, "Não foi possível carregar a ficha."));
      });
    loadEstadoDoPreenchimento(caderneta.id, turma).then((estado) => ativo && setExecucao(estado)).catch(() => {});
    return () => { ativo = false; };
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
  const turmaDaCaderneta = lidas?.turma ?? [];
  const ativos = turmaDaCaderneta.filter((e) => !e.situacao || e.situacao.toUpperCase() === "ATIVO");

  function descreverHabilidade({ area, habilidade }: { area: number; habilidade: number }): string {
    const encontrada = ficha?.areas.find((a) => a.indice === area);
    const h = encontrada?.habilidades.find((candidata) => candidata.indice === habilidade);
    return `${encontrada ? nomeDaArea(encontrada.titulo) : `Área ${area}`} · ${h ? `${h.numero} ${h.texto}` : `habilidade ${habilidade}`}`;
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

  async function lerObservacoes() {
    setInterpretando(true);
    setErro(null);
    try {
      const resultado = await interpretarObservacoes(caderneta.id, etapa, { areas, texto, arquivos }, undefined, turma);
      setLidas(resultado);
      setRevisao(Object.fromEntries(resultado.estudantes.map((e) => [e.matricula, e.excecoes])));
      setGerais(resultado.gerais);
      setNaoResolvidos(resultado.naoResolvidos);
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível ler as observações."));
    } finally {
      setInterpretando(false);
    }
  }

  function adicionar(matricula: string, excecoes: readonly (Excecao & { trecho?: string })[], trecho: string) {
    setRevisao((atual) => ({
      ...atual,
      [matricula]: [...(atual[matricula] ?? []), ...excecoes.map((e) => ({ ...e, trecho: e.trecho ?? trecho }))],
    }));
  }

  async function abrirNoPortal() {
    setErro(null);
    try {
      const inicial = await iniciarPreenchimentoDaFicha(caderneta.id, etapa, {
        areas,
        excecoes: excecoesParaEnviar(Object.entries(revisao).map(([matricula, excecoes]) => ({ matricula, excecoes }))),
      }, turma);
      setExecucao(inicial);
    } catch (error) {
      setErro(mensagemDe(error, "Não foi possível abrir o portal."));
    }
  }

  const comExcecao = Object.entries(revisao).filter(([, excecoes]) => excecoes.length > 0);
  const nomeDe = (matricula: string) => turmaDaCaderneta.find((e) => e.matricula === matricula)?.nome ?? matricula;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Ficha de desempenho</DialogTitle>
          <DialogDescription>
            {caderneta.turma} <span aria-hidden="true">•</span> {etapa}
          </DialogDescription>
        </DialogHeader>

        {picker}

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
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
              <ul className="grid gap-2 sm:grid-cols-2">
                {ficha.areas.map((area) => {
                  const id = `area-${area.indice}`;
                  return (
                    <li key={area.indice} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                      <Checkbox
                        id={id}
                        checked={areas.includes(area.indice)}
                        disabled={emAndamento}
                        onCheckedChange={(marcado) => {
                          setLidas(null);
                          setAreas((atuais) => marcado ? [...atuais, area.indice].sort((a, b) => a - b) : atuais.filter((i) => i !== area.indice));
                        }}
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
                Quem não aparecer nas observações fica com R em todas as habilidades das áreas escolhidas.
              </p>
              <Textarea
                value={texto}
                onChange={(event) => { setTexto(event.target.value); setLidas(null); }}
                placeholder="Cole aqui o que o professor mandou sobre os estudantes."
                rows={4}
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
                    setLidas(null);
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
                  onClick={() => void lerObservacoes()}
                  disabled={interpretando || emAndamento || areas.length === 0 || (!texto.trim() && arquivos.length === 0)}
                >
                  {interpretando ? <IconLoader data-icon="inline-start" className="animate-spin" /> : <IconSparkles data-icon="inline-start" />}
                  {interpretando ? "Lendo…" : "Ler observações"}
                </Button>
              </div>
            </section>
          )}

          {lidas && (
            <section className="flex flex-col gap-3" aria-labelledby="revisao-titulo">
              <h3 id="revisao-titulo" className="text-sm font-medium">Revisão</h3>
              {lidas.resposta && <p className="text-sm text-muted-foreground">{lidas.resposta}</p>}

              {lidas.descartadas.map((item, indice) => (
                <p key={indice} className="flex gap-2 rounded-xl bg-yellow-500/10 px-3 py-2 text-sm">
                  <IconAlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                  <span>Não aplicado: “{item.trecho}”. {item.motivo}</span>
                </p>
              ))}

              {naoResolvidos.map((item, indice) => (
                <div key={`${item.estudante}-${indice}`} className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
                  <span>“{item.estudante}”: {item.motivo}</span>
                  <select
                    className="h-9 rounded-md border bg-background px-3 text-foreground"
                    defaultValue=""
                    aria-label={`Escolher o estudante para ${item.estudante}`}
                    onChange={(event) => {
                      if (!event.target.value) return;
                      adicionar(event.target.value, item.excecoes, item.estudante);
                      setNaoResolvidos((atuais) => atuais.filter((_, i) => i !== indice));
                    }}
                  >
                    <option value="">Quem é?</option>
                    {(item.candidatos.length > 0 ? turmaDaCaderneta.filter((e) => item.candidatos.includes(e.matricula)) : ativos)
                      .map((e) => <option key={e.matricula} value={e.matricula}>{e.nome}</option>)}
                  </select>
                </div>
              ))}

              {gerais.map((geral, indice) => (
                <div key={indice} className="flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span>Sobre a turma: “{geral.trecho}”</span>
                  <ul className="text-xs text-muted-foreground">
                    {geral.excecoes.map((e) => <li key={`${e.area}.${e.habilidade}`}>{e.conceito} · {descreverHabilidade(e)}</li>)}
                  </ul>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      for (const estudante of ativos) adicionar(estudante.matricula, geral.excecoes, geral.trecho);
                      setGerais((atuais) => atuais.filter((_, i) => i !== indice));
                    }}>Aplicar a todos</Button>
                    <Button size="sm" variant="ghost" onClick={() => setGerais((atuais) => atuais.filter((_, i) => i !== indice))}>
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}

              {comExcecao.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma dificuldade apontada: todos ficam com R.</p>
              )}
              {comExcecao.map(([matricula, excecoes]) => (
                <div key={matricula} className="flex flex-col gap-1 rounded-xl border px-3 py-2">
                  <span className="text-sm font-medium">{nomeDe(matricula)}</span>
                  <ul className="flex flex-col gap-1.5">
                    {excecoes.map((excecao, indice) => (
                      <li key={`${excecao.area}.${excecao.habilidade}.${indice}`} className="flex items-start gap-2 text-sm">
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-foreground"
                          value={excecao.conceito}
                          aria-label={`Conceito de ${descreverHabilidade(excecao)}`}
                          onChange={(event) => setRevisao((atual) => ({
                            ...atual,
                            [matricula]: atual[matricula].map((e, i) => i === indice ? { ...e, conceito: event.target.value as "RD" | "NR" } : e),
                          }))}
                        >
                          <option value="RD">RD</option>
                          <option value="NR">NR</option>
                        </select>
                        <span className="flex-1">
                          {descreverHabilidade(excecao)}
                          {excecao.trecho && <span className="block text-xs text-muted-foreground">“{excecao.trecho}”</span>}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Remover esta exceção"
                          onClick={() => setRevisao((atual) => ({ ...atual, [matricula]: atual[matricula].filter((_, i) => i !== indice) }))}
                        >
                          <IconX aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                {Math.max(ativos.length - comExcecao.length, 0)} estudante(s) ficam com R em todas as habilidades escolhidas.
              </p>
            </section>
          )}

          {execucao && <Andamento execucao={execucao} descrever={descreverHabilidade} />}

          {erro && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => void abrirNoPortal()} disabled={!lidas || emAndamento || naoResolvidos.length > 0 || areas.length === 0}>
            {emAndamento ? <IconLoader data-icon="inline-start" className="animate-spin" /> : <IconExternalLink data-icon="inline-start" />}
            {emAndamento ? "Preenchimento em andamento" : "Abrir no portal"}
          </Button>
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
          <span className="font-medium">{p.nome}</span>: conceito mantido por não poder diminuir
          <ul className="text-xs text-muted-foreground">
            {p.mantidos.map((m) => (
              <li key={`${m.area}.${m.habilidade}`}>{descrever(m)} — planejado {m.planejado}, mantido {m.escrito} da etapa {m.etapaDoPiso}</li>
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
