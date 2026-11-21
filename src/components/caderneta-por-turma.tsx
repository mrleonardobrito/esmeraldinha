import * as React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadCaderneta, turmasDaCaderneta, type Caderneta } from "@/lib/cadernetas";
import { nomeCurtoDaTurma } from "@/lib/turmas";

/** Remount the editor when changing turma so edits cannot cross turma boundaries. */
export function CadernetaPorTurma({ caderneta, onClose, children }: {
  caderneta: Caderneta;
  onClose: () => void;
  children: (scoped: Caderneta, picker: React.ReactNode) => React.ReactNode;
}) {
  const turmas = turmasDaCaderneta(caderneta);
  const [turma, setTurma] = React.useState(caderneta.turma);
  const [loaded, setLoaded] = React.useState<{ turma: string; caderneta: Caderneta } | null>(null);
  const [error, setError] = React.useState<{ turma: string; message: string } | null>(null);
  const grouped = turmas.length > 1;

  React.useEffect(() => {
    if (!grouped) return;
    let active = true;
    loadCaderneta(caderneta.id, turma)
      .then((scoped) => { if (active) setLoaded({ turma, caderneta: scoped }); })
      .catch((cause: unknown) => {
        if (active) setError({ turma, message: cause instanceof Error ? cause.message : "Could not load turma." });
      });
    return () => { active = false; };
  }, [caderneta, turma, grouped]);

  const picker = grouped ? (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">Turma</span>
      <select
        className="h-9 w-full rounded-md border bg-background px-3 text-foreground"
        value={turma}
        onChange={(event) => setTurma(event.target.value)}
      >
        {turmas.map((nome) => <option key={nome} value={nome}>{nomeCurtoDaTurma(nome)}</option>)}
      </select>
    </label>
  ) : null;

  if (!grouped) return children(caderneta, null);
  if (loaded?.turma === turma && loaded.caderneta.id === caderneta.id) {
    return <React.Fragment key={turma}>{children(loaded.caderneta, picker)}</React.Fragment>;
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Caderneta</DialogTitle></DialogHeader>
        {picker}
        {error?.turma === turma
          ? <p role="alert" className="text-sm text-destructive">{error.message}</p>
          : <p role="status" className="text-sm text-muted-foreground">Loading turma…</p>}
      </DialogContent>
    </Dialog>
  );
}
