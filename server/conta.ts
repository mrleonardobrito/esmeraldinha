import { Hono } from 'hono';

import { contaSchema, entrarSchema, novaSenhaSchema } from '../shared/conta';
import { onlyDigits } from '../shared/professor';
import { pronounsSchema, type Pronouns } from '../shared/pronouns';
import { exigirAuxiliarDeEnsino, exigirSessao, type ContaEnv } from './conta/autenticacao';
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
import { autenticarProfessor, getProfessorPorLogin } from './professores/store';
import { createEncryptionPort } from './encryption';

export const conta = new Hono<ContaEnv>();

const CREDENCIAIS_INVALIDAS = 'Login ou senha incorretos.';

function readPronouns(professorId: string): Pronouns {
  const row = getDb().prepare('SELECT pronouns FROM professores WHERE id = ?')
    .get(professorId) as { pronouns: Pronouns } | undefined;
  return row?.pronouns === 'ele/dele' || row?.pronouns === 'ela/dela'
    ? row.pronouns
    : null;
}

conta.put('/pronouns', exigirSessao, async (context) => {
  const identity = context.get('identidade');
  if (identity.papel !== 'professor') return context.json({ error: 'Access denied.' }, 403);
  const parsed = pronounsSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: 'Pronomes inválidos.' }, 400);
  getDb().prepare('UPDATE professores SET pronouns = ? WHERE id = ?')
    .run(parsed.data.pronouns, identity.professorId);
  return context.json(parsed.data);
});

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
    // Professor logins are CPFs. The cadastro persists only digits, while
    // people commonly type the formatted value shown in the portal.
    const cpf = onlyDigits(login);
    // Avoid initializing the encryption adapter for an unknown login. Apart
    // from being unnecessary, a fresh install may not have its key yet.
    if (!getProfessorPorLogin(db, cpf)) {
      return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
    }
    const cadastrado = getProfessorPorLogin(db, cpf);
    if (cadastrado && !cadastrado.acessoLiberado) {
      return context.json(
        { error: 'O auxiliar de ensino ainda não liberou o seu acesso.' },
        403,
      );
    }
    const professor = await autenticarProfessor(db, createEncryptionPort(), cpf, senha);
    if (!professor) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
    return context.json({
      token: abrirSessao({ papel: 'professor', professorId: professor.id }),
      conta: {
        ...professor,
        email: '',
        precisaTrocarSenha: false,
        papel: 'professor',
        professorId: professor.id,
        pronouns: readPronouns(professor.id),
      },
    });
  }

  const senhaOk = existente?.precisaTrocarSenha === false
    ? await conferirSenhaDefinitiva(db, senha)
    : textoConfere(senha, env.conta.senhaTemporaria);

  if (!senhaOk) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);

  const atual: Conta = existente ?? criarConta(db, env.conta.login);

  return context.json({
    token: abrirSessao({ papel: 'auxiliar de ensino', contaId: atual.id }),
    conta: { ...atual, papel: 'auxiliar de ensino' },
  });
});

/** A conta de quem está na sessão. É como o app sabe se ainda está logado. */
conta.get('/', exigirSessao, (context) => {
  const identidade = context.get('identidade');
  return context.json(
    identidade.papel === 'auxiliar de ensino'
      ? { ...context.get('conta')!, papel: identidade.papel }
      : {
          ...context.get('professor')!,
          email: '',
          precisaTrocarSenha: false,
          papel: identidade.papel,
          professorId: identidade.professorId,
          pronouns: readPronouns(identidade.professorId),
        },
  );
});

/** Sair: a sessão desta janela é encerrada e o token não vale mais. */
conta.post('/sair', exigirSessao, (context) => {
  encerrarSessao(context.get('token'));
  return context.body(null, 204);
});

/** Nome, e-mail e foto do perfil. O login não se edita. */
conta.put('/', exigirSessao, exigirAuxiliarDeEnsino, async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = contaSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados da conta inválidos.' },
      400,
    );
  }

  return context.json({
    ...atualizarConta(getDb(), context.get('conta')!.id, parsed.data),
    papel: 'auxiliar de ensino',
  });
});

/**
 * Trocar a senha. É por aqui que o primeiro acesso termina — a senha atual
 * informada é a temporária — e é por aqui que a senha definitiva é trocada
 * depois. As outras sessões da conta caem junto.
 */
conta.put('/senha', exigirSessao, exigirAuxiliarDeEnsino, async (context) => {
  const body = await context.req.json().catch(() => null);
  const parsed = novaSenhaSchema.safeParse(body);

  if (!parsed.success) {
    return context.json(
      { error: parsed.error.issues[0]?.message ?? 'Senha inválida.' },
      400,
    );
  }

  const db = getDb();
  const atual = context.get('conta')!;
  const { senhaAtual, senha } = parsed.data;

  const confere = atual.precisaTrocarSenha
    ? textoConfere(senhaAtual, env.conta.senhaTemporaria)
    : await conferirSenhaDefinitiva(db, senhaAtual);

  if (!confere) return context.json({ error: 'A senha atual está incorreta.' }, 422);

  if (textoConfere(senha, env.conta.senhaTemporaria)) {
    return context.json(
      { error: 'A senha definitiva precisa ser diferente da temporária.' },
      400,
    );
  }

  await definirSenha(db, atual.id, senha);
  encerrarSessoesDaConta(atual.id, context.get('token'));

  const atualizada = lerConta(db);
  return context.json({ ...atualizada, papel: 'auxiliar de ensino' });
});
