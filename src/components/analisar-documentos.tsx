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
  professorId: string;
  onClose: () => void;
  /** Chamado quando um envio grava algo, para a grade recarregar. */
  onGravou: () => void;
  /** A sessão sumiu do servidor; quem abriu este modal é dono dela. */
  onSessaoExpirada: () => void;
}

export function AnalisarDocumentos({
  sessionId,
  professorId,
  onClose,
  onGravou,
  onSessaoExpirada,
}: AnalisarDocumentosProps) {
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Upload Inteligente</DialogTitle>
          <DialogDescription>
            Cole o texto ou solte as fotos, PDFs, Word ou Excel que o
            professor mandou — conteúdo das aulas ou notas dos estudantes. O
            sistema descobre a turma, a etapa e a que parte da caderneta o
            material pertence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col overflow-y-auto">
          <EnvioDeMaterial
            sessionId={sessionId}
            professorId={professorId}
            semCard
            onGravou={onGravou}
            onSessaoExpirada={onSessaoExpirada}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
