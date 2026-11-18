import * as React from 'react';
import { toast } from 'sonner';
import { requestApi } from '@/lib/api';
import { useConta } from './conta-provider';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';

export function LocalDataImport() {
  const { sair } = useConta();
  const [available, setAvailable] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    requestApi('/api/migration')
      .then((response) => response.json())
      .then((value: { available: boolean }) => {
        if (!cancelled) setAvailable(value.available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  async function transfer() {
    setBusy(true);
    try {
      const response = await requestApi('/api/migration', { method: 'POST' });
      const result = (await response.json()) as { requiresLogin: boolean };
      toast.success(
        result.requiresLogin
          ? 'Dados importados. Entre novamente para continuar.'
          : 'Estes dados já foram importados.',
      );
      if (result.requiresLogin) await sair();
      else setAvailable(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível importar os dados.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!available) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados anteriores</CardTitle>
        <CardDescription>
          Transfira os cadastros e cadernetas desta instalação para sua conta. A
          conta ainda não pode ter professores cadastrados. Depois da
          importação, será necessário entrar novamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={busy} onClick={() => void transfer()}>
          {busy ? 'Importando…' : 'Importar dados anteriores'}
        </Button>
      </CardContent>
    </Card>
  );
}
