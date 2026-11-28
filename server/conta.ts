import { Hono, type MiddlewareHandler } from 'hono';

import { contaSchema, entrarSchema, novaSenhaSchema } from '../shared/conta';
import { pronounsSchema, type Pronouns } from '../shared/pronouns';
import { exigirAuxiliarDeEnsino, type ContaEnv } from './conta/autenticacao';
import { textoConfere } from './conta/senhas';
import {
  atualizarConta,
  conferirSenhaDefinitiva,
  definirSenha,
  lerConta,
} from './conta/store';
import { env } from './env';
import type { IdentidadeDaSessao, IdentityService } from './modules/identity';
import { getDb } from './professores/db';
import { getProfessor } from './professores/store';

const CREDENCIAIS_INVALIDAS = 'Login ou senha incorretos.';

function contaDaIdentidade(identidade: IdentidadeDaSessao) {
  if (identidade.papel === 'auxiliar de ensino') {
    return { ...lerConta(getDb())!, papel: identidade.papel };
  }
  return {
    ...getProfessor(getDb(), identidade.professorId)!,
    email: '',
    precisaTrocarSenha: false,
    papel: identidade.papel,
    professorId: identidade.professorId,
    pronouns: readPronouns(identidade.professorId),
  };
}

function readPronouns(professorId: string): Pronouns {
  const row = getDb().prepare('SELECT pronouns FROM professores WHERE id = ?')
    .get(professorId) as { pronouns: Pronouns } | undefined;
  return row?.pronouns === 'ele/dele' || row?.pronouns === 'ela/dela'
    ? row.pronouns
    : null;
}

export function createContaRoutes(
  identity: IdentityService,
  exigirSessao: MiddlewareHandler<ContaEnv>,
) {
  const conta = new Hono<ContaEnv>();

  conta.put('/pronouns', exigirSessao, async (context) => {
    const identidade = context.get('identidade');
    if (identidade.papel !== 'professor') return context.json({ error: 'Access denied.' }, 403);
    const parsed = pronounsSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'Pronomes inválidos.' }, 400);
    getDb().prepare('UPDATE professores SET pronouns = ? WHERE id = ?')
      .run(parsed.data.pronouns, identidade.professorId);
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

    const result = await identity.signIn(parsed.data);
    if (result.status === 'invalid_credentials') {
      return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
    }
    if (result.status === 'access_denied') {
      return context.json(
        { error: 'O auxiliar de ensino ainda não liberou o seu acesso.' },
        403,
      );
    }

    return context.json({ token: result.token, conta: contaDaIdentidade(result.identidade) });
  });

  /** A conta de quem está na sessão. É como o app sabe se ainda está logado. */
  conta.get('/', exigirSessao, (context) =>
    context.json(contaDaIdentidade(context.get('identidade'))),
  );

  /** Sair: a sessão desta janela é encerrada e o token não vale mais. */
  conta.post('/sair', exigirSessao, (context) => {
    identity.signOut(context.get('token'));
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
    identity.closeOtherSessions(atual.id, context.get('token'));

    const atualizada = lerConta(db);
    return context.json({ ...atualizada, papel: 'auxiliar de ensino' });
  });

  return conta;
}
