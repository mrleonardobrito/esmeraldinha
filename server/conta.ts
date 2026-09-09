import { Hono } from 'hono';

import { contaSchema, entrarSchema, novaSenhaSchema } from '../shared/conta';
import { exigirSessao, type ContaEnv } from './conta/autenticacao';
import {
  abrirSessao,
  encerrarSessao,
  encerrarSessoesDaConta,
} from './conta/sessoes';
import { textoConfere } from './conta/senhas';
import {
  atualizarConta,
  conferirSenhaDefinitiva,
  criarConta,
  definirSenha,
  lerConta,
  type Conta,
} from './conta/store';
import { env } from './env';
import { getDb } from './professores/db';

export const conta = new Hono<ContaEnv>();

const CREDENCIAIS_INVALIDAS = 'Login ou senha incorretos.';

/**
 * Entrar na Esmeraldinha. Enquanto não houver senha definitiva, só o par
 * login/senha temporária do ambiente é aceito — é ele que faz a conta nascer.
 * Depois de definida a senha, a temporária deixa de valer.
 */
conta.post('/entrar', async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = entrarSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados de acesso inválidos.' },
      400,
    );
  }

  const db = getDb();
  const existente = lerConta(db);
  const { login, senha } = parsed.data;

  const loginEsperado = existente?.login ?? env.conta.login;
  if (!textoConfere(login, loginEsperado)) {
    return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
  }

  const senhaOk = existente?.precisaTrocarSenha === false
    ? await conferirSenhaDefinitiva(db, senha)
    : textoConfere(senha, env.conta.senhaTemporaria);

  if (!senhaOk) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);

  const atual: Conta = existente ?? criarConta(db, env.conta.login);

  return context.json({ token: abrirSessao(atual.id), conta: atual });
});

/** A conta de quem está na sessão. É como o app sabe se ainda está logado. */
conta.get('/', exigirSessao, (context) => context.json(context.get('conta')));

/** Sair: a sessão desta janela é encerrada e o token não vale mais. */
conta.post('/sair', exigirSessao, (context) => {
  encerrarSessao(context.get('token'));
  return context.body(null, 204);
});

/** Nome, e-mail e foto do perfil. O login não se edita. */
conta.put('/', exigirSessao, async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = contaSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados da conta inválidos.' },
      400,
    );
  }

  return context.json(atualizarConta(getDb(), context.get('conta').id, parsed.data));
});

/**
 * Trocar a senha. É por aqui que o primeiro acesso termina — a senha atual
 * informada é a temporária — e é por aqui que a senha definitiva é trocada
 * depois. As outras sessões da conta caem junto.
 */
conta.put('/senha', exigirSessao, async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = novaSenhaSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? 'Senha inválida.' },
      400,
    );
  }

  const db = getDb();
  const atual = context.get('conta');
  const { senhaAtual, senha } = parsed.data;

  const confere = atual.precisaTrocarSenha
    ? textoConfere(senhaAtual, env.conta.senhaTemporaria)
    : await conferirSenhaDefinitiva(db, senhaAtual);

  if (!confere) return context.json({ error: 'A senha atual está incorreta.' }, 401);

  if (textoConfere(senha, env.conta.senhaTemporaria)) {
    return context.json(
      { error: 'A senha definitiva precisa ser diferente da temporária.' },
      400,
    );
  }

  await definirSenha(db, atual.id, senha);
  encerrarSessoesDaConta(atual.id, context.get('token'));

  const atualizada = lerConta(db);
  return context.json(atualizada);
});
