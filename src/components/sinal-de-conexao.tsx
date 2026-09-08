import { Badge } from "@/components/ui/badge";

/** Os dois estados da sessão no portal que têm símbolo próprio. */
export type EstadoDaConexao = "connecting" | "connected";

/**
 * O selo da sessão no portal. Fica sem papel de acessibilidade de propósito:
 * na tela das cadernetas ele anuncia uma mudança de estado, e no guia é só um
 * exemplo — quem chama diz qual dos dois é.
 */
export function SinalDeConexao({
  estado,
  ...props
}: { estado: EstadoDaConexao } & React.ComponentProps<typeof Badge>) {
  if (estado === "connecting") {
    return (
      <Badge variant="outline" className="h-8 gap-2 px-3" {...props}>
        <span className="relative inline-flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-2 rounded-full bg-primary/50 animate-ping-ring" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        Conectando…
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="h-8 gap-2 px-3" {...props}>
      <span
        className="inline-flex size-2 rounded-full bg-primary"
        aria-hidden="true"
      />
      Conectado
    </Badge>
  );
}
