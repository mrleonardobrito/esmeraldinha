import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { enviarCodigoDoProfessor, verificarCodigoDoProfessor, type Professor } from '@/lib/professores';

export function AcessoDoProfessor({ professor, onClose, onVerified }: { professor: Professor | null; onClose: () => void; onVerified: (professor: Professor) => void }) {
  const [codigo, setCodigo] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!professor) return;
    setBusy(true);
    setError(null);
    try { onVerified(await verificarCodigoDoProfessor(professor.id, codigo)); setCodigo(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível confirmar o acesso.'); }
    finally { setBusy(false); }
  }
  async function resend() {
    if (!professor) return;
    setBusy(true);
    setError(null);
    try { await enviarCodigoDoProfessor(professor.id); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível reenviar o código.'); }
    finally { setBusy(false); }
  }
  return <Dialog open={Boolean(professor)} onOpenChange={(open) => { if (!open && !busy) { setCodigo(''); setError(null); onClose(); } }}>
    <DialogContent>
      <DialogHeader><DialogTitle>Confirmar acesso de {professor?.nome}</DialogTitle><DialogDescription>Informe o código enviado para {professor?.email}. A entrada do professor continua sendo pelo CPF e senha do portal.</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-4" onSubmit={verify}>
        <Label htmlFor="codigo-do-professor">Código de confirmação</Label>
        <Input id="codigo-do-professor" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(event) => setCodigo(event.target.value)} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !codigo}>{busy ? 'Confirmando…' : 'Confirmar acesso'}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void resend()}>Reenviar código</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
