import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnvioDeMaterial } from "@/components/envio-de-material";

export interface AnalisarDocumentosProps {
  sessionId: string;
  onClose: () => void;
  /** Chamado quando um envio grava algo, para a grade recarregar. */
  onGravou: () => void;
}

/**
 * O envio de material sem uma caderneta em volta: o auxiliar de ensino cola o
 * que o professor mandou e a Esmeraldinha descobre sozinha a turma, a etapa e
 * o mês. Fica num modal porque é uma tarefa que se abre e se fecha, não algo
 * que precise ocupar a tela enquanto se olha a grade.
 */
export function AnalisarDocumentos({
  sessionId,
  onClose,
  onGravou,
}: AnalisarDocumentosProps) {
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Analisar documentos</DialogTitle>
          <DialogDescription>
            Cole o texto ou solte as fotos e PDFs que o professor mandou. A
            Esmeraldinha descobre a turma, a etapa e o mês e grava no portal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col overflow-y-auto">
          <EnvioDeMaterial sessionId={sessionId} semCard onGravou={onGravou} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
