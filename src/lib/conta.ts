import { ApiError, requestApi } from "@/lib/api";
import { esquecerToken, guardarToken } from "@/lib/sessao-do-auxiliar";
import {
  contaSchema,
  entrarSchema,
  novaSenhaSchema,
  MIN_SENHA,
  type ContaField,
  type ContaInput,
  type EntrarInput,
  type NovaSenhaInput,
} from "@shared/conta";

export { contaSchema, entrarSchema, novaSenhaSchema, MIN_SENHA };
export type { ContaField, ContaInput, EntrarInput, NovaSenhaInput };

/** A conta do auxiliar de ensino como a API a devolve: nunca com a senha. */
export interface Conta {
  id: string;
  login: string;
  nome: string;
  email: string;
  /** Nulo quando não há foto: é assim que o banco a guarda. */
  imagem: string | null;
  /** Verdadeiro enquanto a senha em uso ainda é a temporária do ambiente. */
  precisaTrocarSenha: boolean;
}

const json = { "Content-Type": "application/json" };

/** Entra na Esmeraldinha e guarda o token da sessão. */
export async function entrar(input: EntrarInput): Promise<Conta> {
  const response = await requestApi("/api/conta/entrar", {
    method: "POST",
    headers: json,
    body: JSON.stringify(input),
  });

  const { token, conta } = (await response.json()) as {
    token: string;
    conta: Conta;
  };

  guardarToken(token);
  return conta;
}

/**
 * A conta da sessão em curso, ou `null` quando não há sessão — é como o app
 * decide, ao abrir, entre a tela de entrada e o resto.
 */
export async function lerConta(): Promise<Conta | null> {
  try {
    const response = await requestApi("/api/conta");
    return (await response.json()) as Conta;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Encerra a sessão. É o que o botão de sair faz. */
export async function sair(): Promise<void> {
  try {
    await requestApi("/api/conta/sair", { method: "POST" });
  } finally {
    // A sessão do lado de cá acaba mesmo que a API não tenha respondido:
    // ficar preso dentro do app por causa disso seria pior.
    esquecerToken();
  }
}

/** Atualiza o perfil: nome, e-mail e foto. O login não se edita. */
export async function atualizarConta(input: ContaInput): Promise<Conta> {
  const response = await requestApi("/api/conta", {
    method: "PUT",
    headers: json,
    body: JSON.stringify(input),
  });
  return (await response.json()) as Conta;
}

/** Troca a senha: termina o primeiro acesso e serve para trocá-la depois. */
export async function trocarSenha(input: NovaSenhaInput): Promise<Conta> {
  const response = await requestApi("/api/conta/senha", {
    method: "PUT",
    headers: json,
    body: JSON.stringify(input),
  });
  return (await response.json()) as Conta;
}
