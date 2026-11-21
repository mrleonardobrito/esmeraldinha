import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requestApi } from "@/lib/api";
import { turmasDaCaderneta, type Caderneta } from "@/lib/cadernetas";

export function EditarValoresDaCaderneta({ caderneta, onClose, onSaved }: { caderneta: Caderneta; onClose: () => void; onSaved: (caderneta: Caderneta) => void }) {
  const [valorRecebido, setValorRecebido] = React.useState(caderneta.valorRecebido?.toString() ?? "");
  const [valorAReceber, setValorAReceber] = React.useState(caderneta.valorAReceber?.toString() ?? "");
  const [saving, setSaving] = React.useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await requestApi(`/api/cadernetas/${caderneta.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorRecebido: valorRecebido === "" ? null : Number(valorRecebido), valorAReceber: valorAReceber === "" ? null : Number(valorAReceber) }),
      });
      onSaved(await response.json() as Caderneta);
      toast.success("Valores atualizados.");
      onClose();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar os valores."); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Editar valores</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{turmasDaCaderneta(caderneta).join(", ")}</p><form onSubmit={(event) => void save(event)} className="space-y-4"><label className="block space-y-1"><span>Valor recebido (R$)</span><Input type="number" min="0" step="0.01" value={valorRecebido} onChange={(event) => setValorRecebido(event.target.value)} /></label><label className="block space-y-1"><span>Valor a receber (R$)</span><Input type="number" min="0" step="0.01" value={valorAReceber} onChange={(event) => setValorAReceber(event.target.value)} /></label><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
