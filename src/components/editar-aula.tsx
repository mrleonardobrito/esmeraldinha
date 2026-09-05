import * as React from "react";
import { IconExternalLink, IconLoader } from "@tabler/icons-react";

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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  preencherAulaNoPortal,
  type AulaDaCaderneta,
  type Caderneta,
  type ConteudoEditado,
} from "@/lib/cadernetas";

type SimNao = "Sim" | "Não";

/** Nenhuma escolha ainda: o portal fica com o que já tiver na linha. */
const SEM_ESCOLHA = "manter";

export interface EditarAulaProps {
  caderneta: Caderneta;
  aula: AulaDaCaderneta;
  onClose: () => void;
}

/**
 * O conteúdo de uma aula, editável. O botão _Preencher no sistema_ leva o que
 * está aqui para uma janela do portal já na linha certa — e para aí. Salvar
 * continua sendo do auxiliar de ensino: a Esmeraldinha só facilita o
 * preenchimento.
 */
export function EditarAula({ caderneta, aula, onClose }: EditarAulaProps) {
  const [conteudo, setConteudo] = React.useState<ConteudoEditado>({
    codigoCR: aula.codigoCR ?? "",
    desenvolvimento: aula.desenvolvimento ?? "",
    ferramentas: aula.ferramentas ?? "",
    isRecuperacao: null,
    isInteracao: null,
  });
  const [preenchendo, setPreenchendo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);

  function editar<C extends keyof ConteudoEditado>(
    campo: C,
    valor: ConteudoEditado[C],
  ) {
    setConteudo((atual) => ({ ...atual, [campo]: valor }));
    setAberto(false);
  }

  async function preencher() {
    setPreenchendo(true);
    setErro(null);

    try {
      await preencherAulaNoPortal(caderneta.id, aula, conteudo);
      setAberto(true);
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a aula no portal.",
      );
    } finally {
      setPreenchendo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(estaAberto) => !estaAberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading tabular-nums">
            Aula {aula.data}
          </DialogTitle>
          <DialogDescription>
            {caderneta.turma} <span aria-hidden="true">•</span> {aula.etapa}
            {aula.ordem !== null && (
              <>
                {" "}
                <span aria-hidden="true">•</span> ordem {aula.ordem}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-0.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="codigo-cr">Código CR</Label>
            <Input
              id="codigo-cr"
              value={conteudo.codigoCR}
              onChange={(evento) => editar("codigoCR", evento.target.value)}
              disabled={preenchendo}
              placeholder="A referência curricular da aula"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desenvolvimento">Desenvolvimento / Metodologia</Label>
            <textarea
              id="desenvolvimento"
              value={conteudo.desenvolvimento}
              onChange={(evento) => editar("desenvolvimento", evento.target.value)}
              disabled={preenchendo}
              rows={6}
              placeholder="Como a aula foi dada"
              className="min-h-32 w-full resize-y rounded-2xl border border-transparent bg-input/50 p-3 text-sm outline-none transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ferramentas">Ferramentas utilizadas</Label>
            <textarea
              id="ferramentas"
              value={conteudo.ferramentas}
              onChange={(evento) => editar("ferramentas", evento.target.value)}
              disabled={preenchendo}
              rows={3}
              placeholder="Os recursos usados na aula"
              className="min-h-20 w-full resize-y rounded-2xl border border-transparent bg-input/50 p-3 text-sm outline-none transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <EscolhaSimNao
              id="recuperacao"
              rotulo="Recuperação"
              valor={conteudo.isRecuperacao}
              onChange={(valor) => editar("isRecuperacao", valor)}
              disabled={preenchendo}
            />
            <EscolhaSimNao
              id="interacao"
              rotulo="Interação"
              valor={conteudo.isInteracao}
              onChange={(valor) => editar("isInteracao", valor)}
              disabled={preenchendo}
            />
          </div>
        </div>

        {erro && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        {aberto && !erro && (
          <p className="rounded-xl bg-primary/10 px-3 py-2 text-sm">
            O portal está aberto na aula de{" "}
            <span className="tabular-nums">{aula.data}</span> com este conteúdo
            preenchido. Confira e salve por lá — a Esmeraldinha não salva por você.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={preenchendo}>
            Fechar
          </Button>
          <Button onClick={() => void preencher()} disabled={preenchendo}>
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
      </DialogContent>
    </Dialog>
  );
}

/**
 * Um campo Sim/Não do portal. Sem escolha é uma opção de verdade: quer dizer
 * deixar como está na linha, e é o padrão porque a tela não sabe o que o
 * portal tem ali.
 */
function EscolhaSimNao({
  id,
  rotulo,
  valor,
  onChange,
  disabled,
}: {
  id: string;
  rotulo: string;
  valor: SimNao | null;
  onChange: (valor: SimNao | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select
        value={valor ?? SEM_ESCOLHA}
        onValueChange={(escolha) =>
          onChange(escolha === SEM_ESCOLHA ? null : (escolha as SimNao))
        }
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_ESCOLHA}>Manter como está</SelectItem>
          <SelectItem value="Sim">Sim</SelectItem>
          <SelectItem value="Não">Não</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
