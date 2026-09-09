import * as React from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconExternalLink,
  IconLoader,
  IconUpload,
} from "@tabler/icons-react";

import { EnvioDeMaterial } from "@/components/envio-de-material";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  loadBoletimDaEtapa,
  preencherNotasNoPortal,
  type BoletimDaEtapa,
  type Caderneta,
  type EstudanteDaCaderneta,
  type NotaDaCaderneta,
} from "@/lib/cadernetas";
import { cn } from "@/lib/utils";

type Estado =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; boletim: BoletimDaEtapa };

/** As duas notas da linha do estudante que o portal deixa editar. */
type CampoDoEstudante = "parcial" | "personalizada";

/**
 * Cada célula editável da grade, indexada por chave. As colunas de avaliação
 * são `matrícula|avaliação`; as duas do estudante, `matrícula|#parcial` e
 * `matrícula|#personalizada` — o `#` as separa de uma avaliação que por acaso
 * se chamasse igual.
 */
type NotasEditadas = Record<string, string>;

function chaveDaNota(matricula: string, avaliacao: string): string {
  return `${matricula}|${avaliacao}`;
}

function chaveDoEstudante(matricula: string, campo: CampoDoEstudante): string {
  return `${matricula}|#${campo}`;
}

/** O número como o auxiliar de ensino o digita: vírgula ou ponto. */
function paraNumero(bruto: string | undefined): number | undefined {
  if (bruto === undefined || bruto.trim() === "") return undefined;

  const valor = Number(bruto.replace(",", "."));

  return Number.isFinite(valor) ? valor : undefined;
}

export interface LancarNotasProps {
  caderneta: Caderneta;
  etapa: string;
  sessionId: string;
  onClose: () => void;
  /** Chamado quando um envio grava algo, para a grade recarregar. */
  onGravou: () => void;
}

/**
 * A tela de lançar notas: uma linha por estudante, uma coluna por avaliação da
 * disciplina, mais a nota parcial e a nota personalizada. _Preencher no
 * sistema_ leva tudo o que está preenchido para uma janela do portal já no
 * boletim certo — e para aí. Salvar continua sendo do auxiliar de ensino.
 */
export function LancarNotas({
  caderneta,
  etapa,
  sessionId,
  onClose,
  onGravou,
}: LancarNotasProps) {
  const [estado, setEstado] = React.useState<Estado>({ status: "loading" });
  /**
   * A disciplina que o auxiliar de ensino escolheu. Nula enquanto ele não
   * escolheu nada: aí vale a que o servidor devolve, que é a primeira da
   * caderneta. Guardar só a escolha evita o efeito se realimentar.
   */
  const [disciplina, setDisciplina] = React.useState<string | null>(null);
  const [editadas, setEditadas] = React.useState<NotasEditadas>({});
  const [enviando, setEnviando] = React.useState(false);
  const [preenchendo, setPreenchendo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    loadBoletimDaEtapa(caderneta.id, etapa, disciplina ?? undefined)
      .then((boletim) => {
        if (!cancelled) setEstado({ status: "ready", boletim });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setEstado({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível ler o boletim.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [caderneta.id, etapa, disciplina, reloadToken]);

  /**
   * O que o portal já tem, como texto de campo. Trocar de disciplina troca
   * este mapa junto: as edições são uma camada por cima dele, e não uma cópia
   * que sobreviveria à troca e lançaria a nota de uma disciplina na outra.
   */
  const doPortal = React.useMemo(() => {
    const valores: NotasEditadas = {};

    if (estado.status !== "ready") return valores;

    for (const nota of estado.boletim.notas) {
      valores[chaveDaNota(nota.matricula, nota.avaliacao)] = String(nota.valor);
    }

    for (const nota of estado.boletim.notasDoEstudante) {
      if (nota.parcial !== null) {
        valores[chaveDoEstudante(nota.matricula, "parcial")] = String(nota.parcial);
      }
      if (nota.personalizada !== null) {
        valores[chaveDoEstudante(nota.matricula, "personalizada")] = String(
          nota.personalizada,
        );
      }
    }

    return valores;
  }, [estado]);

  /** O que a tela mostra: o portal, com as edições por cima. */
  const valores = React.useMemo(
    () => ({ ...doPortal, ...editadas }),
    [doPortal, editadas],
  );

  function recarregar() {
    setReloadToken((atual) => atual + 1);
  }

  async function preencher() {
    if (estado.status !== "ready") return;

    const { boletim } = estado;

    const notas: NotaDaCaderneta[] = [];

    for (const estudante of boletim.estudantes) {
      for (const avaliacao of boletim.avaliacoes) {
        const valor = paraNumero(
          valores[chaveDaNota(estudante.matricula, avaliacao.nome)],
        );

        if (valor === undefined) continue;

        notas.push({
          matricula: estudante.matricula,
          avaliacao: avaliacao.nome,
          valor,
        });
      }
    }

    // A parcial e a personalizada vão juntas, por estudante: são campos da
    // linha, não de uma avaliação.
    const notasDoEstudante = boletim.estudantes
      .map((estudante) => {
        const parcial = paraNumero(
          valores[chaveDoEstudante(estudante.matricula, "parcial")],
        );
        const personalizada = paraNumero(
          valores[chaveDoEstudante(estudante.matricula, "personalizada")],
        );

        return { matricula: estudante.matricula, parcial, personalizada };
      })
      .filter((nota) => nota.parcial !== undefined || nota.personalizada !== undefined);

    if (notas.length === 0 && notasDoEstudante.length === 0) {
      setErro("Preencha ao menos uma nota antes de mandar para o portal.");
      return;
    }

    setPreenchendo(true);
    setErro(null);

    try {
      await preencherNotasNoPortal(caderneta.id, etapa, notas, {
        disciplina: boletim.disciplina,
        notasDoEstudante,
      });
      setAberto(true);
      onGravou();
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o boletim no portal.",
      );
    } finally {
      setPreenchendo(false);
    }
  }

  const pronto = estado.status === "ready" ? estado.boletim : null;
  // Sem disciplina não há avaliação cadastrada: não há o que preencher.
  const semAvaliacao = pronto !== null && pronto.avaliacoes.length === 0;

  return (
    <Dialog open onOpenChange={(estaAberto) => !estaAberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Lançar Notas</DialogTitle>
          <DialogDescription>
            {caderneta.turma} <span aria-hidden="true">•</span> {etapa}
            {pronto?.disciplina && (
              <>
                {" "}
                <span aria-hidden="true">•</span> {pronto.disciplina}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {enviando ? (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <Button
              variant="ghost"
              className="self-start"
              onClick={() => setEnviando(false)}
            >
              <IconArrowLeft data-icon="inline-start" />
              Voltar para as notas
            </Button>

            <p className="text-sm text-muted-foreground">
              Solte a folha de notas que o professor mandou. O sistema
              descobre a avaliação e casa cada nota com o estudante.
            </p>

            <EnvioDeMaterial
              sessionId={sessionId}
              professorId={caderneta.professorId}
              cadernetaId={caderneta.id}
              semCard
              onGravou={() => {
                setEnviando(false);
                recarregar();
                onGravou();
              }}
            />
          </div>
        ) : (
          <>
            {pronto && pronto.disciplinas.length > 1 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="disciplina" className="shrink-0">
                  Disciplina
                </Label>
                <Select
                  value={pronto.disciplina ?? undefined}
                  onValueChange={(escolhida) => {
                    // As edições eram do boletim anterior; levá-las para a
                    // outra disciplina lançaria nota no lugar errado.
                    setEditadas({});
                    setErro(null);
                    setAberto(false);
                    setDisciplina(escolhida);
                  }}
                  disabled={preenchendo}
                >
                  <SelectTrigger id="disciplina" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <DisciplinasDoSelect
                      disciplinas={pronto.disciplinas}
                      disciplinasLancadas={pronto.disciplinasLancadas}
                    />
                  </SelectContent>
                </Select>
              </div>
            )}

            <GradeDeNotas
              estado={estado}
              editadas={valores}
              disabled={preenchendo}
              onEditar={(chave, valor) => {
                setEditadas((atuais) => ({ ...atuais, [chave]: valor }));
                setAberto(false);
              }}
              onTentarDeNovo={recarregar}
            />

            {erro && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}

            {aberto && !erro && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
                O portal está aberto no boletim de {etapa} com estas notas
                preenchidas. Confira e salve por lá — o sistema não salva
                por você.
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEnviando(true)}
                disabled={preenchendo || semAvaliacao}
              >
                <IconUpload data-icon="inline-start" />
                Enviar folha de notas
              </Button>
              <Button
                onClick={() => void preencher()}
                disabled={preenchendo || pronto === null || semAvaliacao}
              >
                {preenchendo ? (
                  <>
                    <IconLoader data-icon="inline-start" className="animate-spin" />
                    Abrindo o portal…
                  </>
                ) : (
                  <>
                    <IconExternalLink data-icon="inline-start" />
                    Preencher no sistema
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * As disciplinas do seletor. Enquanto nenhuma tem nota lançada nesta etapa,
 * uma lista só; assim que a primeira ganha nota, ela se separa das demais em
 * "A lançar" e "Já lançado" — do jeito que o auxiliar de ensino acompanha o
 * que ainda falta.
 */
function DisciplinasDoSelect({
  disciplinas,
  disciplinasLancadas,
}: {
  disciplinas: string[];
  disciplinasLancadas: string[];
}) {
  if (disciplinasLancadas.length === 0) {
    return disciplinas.map((nome) => (
      <SelectItem key={nome} value={nome}>
        {nome}
      </SelectItem>
    ));
  }

  const aLancar = disciplinas.filter((nome) => !disciplinasLancadas.includes(nome));
  const jaLancado = disciplinas.filter((nome) => disciplinasLancadas.includes(nome));

  return (
    <>
      {aLancar.length > 0 && (
        <SelectGroup>
          <SelectLabel>A lançar</SelectLabel>
          {aLancar.map((nome) => (
            <SelectItem key={nome} value={nome}>
              {nome}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
      {jaLancado.length > 0 && (
        <SelectGroup>
          <SelectLabel>Já lançado</SelectLabel>
          {jaLancado.map((nome) => (
            <SelectItem key={nome} value={nome}>
              {nome}
            </SelectItem>
          ))}
        </SelectGroup>
      )}
    </>
  );
}

function GradeDeNotas({
  estado,
  editadas,
  disabled,
  onEditar,
  onTentarDeNovo,
}: {
  estado: Estado;
  editadas: NotasEditadas;
  disabled: boolean;
  onEditar: (chave: string, valor: string) => void;
  onTentarDeNovo: () => void;
}) {
  if (estado.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
        <IconLoader className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando o boletim…</p>
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

  const { estudantes, avaliacoes, notasDoEstudante } = estado.boletim;

  if (estudantes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm font-medium">Nenhum estudante nesta turma</p>
        <p className="text-sm text-muted-foreground">
          O portal não lista estudantes para esta turma. Sincronize a caderneta
          se isso mudou.
        </p>
      </div>
    );
  }

  const calculadas = new Map(
    notasDoEstudante.map((nota) => [nota.matricula, nota]),
  );

  return (
    <div className="min-h-0 overflow-auto rounded-2xl border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Estudante
            </th>
            {avaliacoes.map((avaliacao) => (
              <th
                key={avaliacao.nome}
                className="px-3 py-2.5 text-left font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                <span className="flex flex-col">
                  {avaliacao.nome}
                  {avaliacao.valor !== null && (
                    <span className="text-[0.65rem] font-normal normal-case tabular-nums">
                      vale {avaliacao.valor}
                      {avaliacao.media !== null && ` • média ${avaliacao.media}`}
                    </span>
                  )}
                </span>
              </th>
            ))}
            <ColunaFixa titulo="Nota origem" nota="o portal preenche" />
            <ColunaFixa titulo="Nota calculada" nota="o portal calcula" />
            <ColunaFixa titulo="Nota parcial" />
            <ColunaFixa titulo="Nota personalizada" nota="sobrepõe a calculada" />
          </tr>
        </thead>
        <tbody>
          {estudantes.map((estudante) => (
            <LinhaDoEstudante
              key={estudante.matricula}
              estudante={estudante}
              avaliacoes={avaliacoes}
              calculadas={calculadas.get(estudante.matricula)}
              editadas={editadas}
              disabled={disabled}
              onEditar={onEditar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColunaFixa({ titulo, nota }: { titulo: string; nota?: string }) {
  return (
    <th className="px-3 py-2.5 text-left font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      <span className="flex flex-col">
        {titulo}
        {nota && (
          <span className="text-[0.65rem] font-normal normal-case">{nota}</span>
        )}
      </span>
    </th>
  );
}

function LinhaDoEstudante({
  estudante,
  avaliacoes,
  calculadas,
  editadas,
  disabled,
  onEditar,
}: {
  estudante: EstudanteDaCaderneta;
  avaliacoes: BoletimDaEtapa["avaliacoes"];
  calculadas: BoletimDaEtapa["notasDoEstudante"][number] | undefined;
  editadas: NotasEditadas;
  disabled: boolean;
  onEditar: (chave: string, valor: string) => void;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-card px-3 py-2 text-left align-middle font-medium"
      >
        <span className="flex flex-col">
          {estudante.nome}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {estudante.matricula}
          </span>
        </span>
      </th>

      {avaliacoes.map((avaliacao) => {
        const chave = chaveDaNota(estudante.matricula, avaliacao.nome);
        const valor = editadas[chave] ?? "";
        // Uma nota acima do valor da avaliação o portal recusaria: melhor
        // dizer isso aqui, enquanto ainda dá para corrigir.
        const numero = paraNumero(valor);
        const excedeu =
          avaliacao.valor !== null &&
          numero !== undefined &&
          numero > avaliacao.valor;

        return (
          <td key={avaliacao.nome} className="px-3 py-2 align-middle">
            <CampoDeNota
              valor={valor}
              onChange={(novo) => onEditar(chave, novo)}
              disabled={disabled}
              invalido={excedeu}
              rotulo={`Nota de ${estudante.nome} em ${avaliacao.nome}`}
            />
          </td>
        );
      })}

      {/* A origem e a calculada o portal preenche sozinho; aqui só se leem. */}
      <td className="px-3 py-2 align-middle">
        <NotaCalculada valor={calculadas?.origem ?? null} />
      </td>
      <td className="px-3 py-2 align-middle">
        <NotaCalculada valor={calculadas?.calculada ?? null} />
      </td>

      {(["parcial", "personalizada"] as const).map((campo) => {
        const chave = chaveDoEstudante(estudante.matricula, campo);

        return (
          <td key={campo} className="px-3 py-2 align-middle">
            <CampoDeNota
              valor={editadas[chave] ?? ""}
              onChange={(novo) => onEditar(chave, novo)}
              disabled={disabled}
              rotulo={
                campo === "parcial"
                  ? `Nota parcial de ${estudante.nome}`
                  : `Nota personalizada de ${estudante.nome}`
              }
            />
          </td>
        );
      })}
    </tr>
  );
}

function CampoDeNota({
  valor,
  onChange,
  disabled,
  invalido,
  rotulo,
}: {
  valor: string;
  onChange: (valor: string) => void;
  disabled: boolean;
  invalido?: boolean;
  rotulo: string;
}) {
  return (
    <Input
      value={valor}
      onChange={(evento) => onChange(evento.target.value)}
      disabled={disabled}
      inputMode="decimal"
      placeholder="—"
      aria-label={rotulo}
      aria-invalid={invalido}
      className={cn("w-20 tabular-nums", invalido && "border-destructive")}
    />
  );
}

/** O que o portal calculou: mostrado, nunca editado. */
function NotaCalculada({ valor }: { valor: number | null }) {
  return (
    <span className="inline-flex h-9 w-20 items-center justify-center rounded-2xl bg-muted/60 text-sm tabular-nums text-muted-foreground">
      {valor ?? "—"}
    </span>
  );
}
