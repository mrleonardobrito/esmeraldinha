import * as React from "react";

import {
  entrar as entrarNaApi,
  lerConta,
  sair as sairDaApi,
  type Conta,
  type EntrarInput,
} from "@/lib/conta";
import { assinarSessao, lerToken } from "@/lib/sessao-do-auxiliar";

interface ContaContexto {
  /** Nula enquanto ninguém entrou: é o que leva à tela de entrada. */
  conta: Conta | null;
  /** Verdadeiro só na abertura, enquanto a sessão guardada é conferida. */
  carregando: boolean;
  entrar: (input: EntrarInput) => Promise<void>;
  sair: () => Promise<void>;
  /** Guarda a conta que a API devolveu depois de editar o perfil ou a senha. */
  guardarConta: (conta: Conta) => void;
}

const Contexto = React.createContext<ContaContexto | null>(null);

/**
 * Quem está usando a Esmeraldinha. Fica acima de tudo porque a resposta muda
 * a tela inteira: sem sessão só existe a entrada, e com a senha temporária
 * ainda em uso só existe o primeiro acesso.
 */
export function ContaProvider({ children }: { children: React.ReactNode }) {
  const [conta, setConta] = React.useState<Conta | null>(null);
  // Sem token guardado não há nada a conferir: a tela de entrada já pode vir.
  const [carregando, setCarregando] = React.useState(() => Boolean(lerToken()));

  React.useEffect(() => {
    if (!lerToken()) return;

    let cancelado = false;

    lerConta()
      .then((atual) => {
        if (!cancelado) setConta(atual);
      })
      .catch(() => {
        // A API fora do ar na abertura cai na tela de entrada, que é onde a
        // mensagem aparece quando se tenta entrar.
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  // Um token recusado no meio de qualquer pedido derruba a sessão aqui
  // também, e a tela de entrada volta sozinha.
  React.useEffect(
    () =>
      assinarSessao(() => {
        if (!lerToken()) setConta(null);
      }),
    [],
  );

  const value = React.useMemo<ContaContexto>(
    () => ({
      conta,
      carregando,
      entrar: async (input) => setConta(await entrarNaApi(input)),
      sair: async () => {
        await sairDaApi();
        setConta(null);
      },
      guardarConta: setConta,
    }),
    [conta, carregando],
  );

  return <Contexto.Provider value={value}>{children}</Contexto.Provider>;
}

export function useConta(): ContaContexto {
  const contexto = React.useContext(Contexto);
  if (!contexto) {
    throw new Error("useConta precisa estar dentro de <ContaProvider>.");
  }
  return contexto;
}
