import type { Caderneta } from "@/lib/cadernetas";
import type { PortalSession } from "@/lib/portal-session";
import type { Professor } from "@/lib/professores";

/**
 * O que a tela de cadernetas tem em mãos: o professor escolhido, a sessão
 * aberta no portal para ele e as cadernetas já lidas.
 */
export interface SessaoDeTrabalho {
  professor: Professor;
  session: PortalSession | null;
  cadernetas: Caderneta[];
}

/**
 * Trocar de página desmonta a tela de cadernetas, e com ela iria embora a
 * sessão do portal — que custa um login inteiro para refazer. Guardar isso
 * fora do React deixa a volta ser instantânea.
 *
 * Mora em memória de propósito: uma sessão do portal não sobrevive a fechar o
 * app, e as credenciais que a abriram não são nossas para escrever em disco.
 */
let emAberto: SessaoDeTrabalho | null = null;

export function lerSessaoDeTrabalho(): SessaoDeTrabalho | null {
  return emAberto;
}

export function guardarSessaoDeTrabalho(sessao: SessaoDeTrabalho): void {
  emAberto = sessao;
}

/** Chamado ao trocar de professor ou encerrar a sessão: não há o que retomar. */
export function esquecerSessaoDeTrabalho(): void {
  emAberto = null;
}
