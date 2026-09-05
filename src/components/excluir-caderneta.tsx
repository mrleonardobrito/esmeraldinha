import * as React from "react";
import { IconAlertTriangle, IconLoader } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { excluirCaderneta, type Caderneta } from "@/lib/cadernetas";

export interface ExcluirCadernetaProps {
  caderneta: Caderneta;
  onClose: () => void;
  onExcluiu: (caderneta: Caderneta) => void;
}

/**
 * Excluir uma caderneta joga fora as aulas e os estudantes que a raspagem
 * trouxe — não o que já está no portal, que continua lá. Confirmar existe por
 * isso: o que se perde é a leitura, e ela custa minutos para refazer.
 */
export function ExcluirCaderneta({
  caderneta,
  onClose,
  onExcluiu,
}: ExcluirCadernetaProps) {
  const [excluindo, setExcluindo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function excluir() {
    setExcluindo(true);
    setErro(null);

    try {
      await excluirCaderneta(caderneta.id);
      onExcluiu(caderneta);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a caderneta.",
      );
      setExcluindo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !excluindo && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Excluir caderneta</DialogTitle>
          <DialogDescription>
            A caderneta de <strong>{caderneta.turma}</strong> sai da
            Esmeraldinha, com as aulas e os estudantes que ela leu. O que já
            está gravado no portal continua lá.
          </DialogDescription>
        </DialogHeader>

        {erro && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{erro}</span>
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={excluindo}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void excluir()}
            disabled={excluindo}
          >
            {excluindo && (
              <IconLoader className="animate-spin" data-icon="inline-start" />
            )}
            {excluindo ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
