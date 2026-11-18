import { Hono } from 'hono';

import { codigoDeAcessoSchema, contaSchema, entrarSchema, novaSenhaSchema } from '../shared/conta';
import { onlyDigits } from '../shared/professor';
import { pronounsSchema, type Pronouns } from '../shared/pronouns';
import { exigirAuxiliarDeEnsino, exigirSessao, type ContaEnv } from './conta/autenticacao';
import { abrirSessao, encerrarSessao, encerrarSessoesDaConta, renovarSessao } from './conta/sessoes';
import { textoConfere } from './conta/senhas';
import { atualizarConta, conferirSenhaDefinitiva, contaPrecisaVinculo, concluirPrimeiroAcesso, criarConta, lerConta, lerVinculoDaConta, vincularConta } from './conta/store';
import { AuthFailure, type AuthProvider, type AuthSession } from './conta/supabase';
import { env } from './env';
import { getDb } from './professores/db';
import { autenticarProfessor, getProfessorPorLogin } from './professores/store';
import { createEncryptionPort } from './encryption';

export const conta = new Hono<ContaEnv>();
const CREDENCIAIS_INVALIDAS = 'Login ou senha incorretos.';

function readPronouns(professorId: string): Pronouns {
  const row = getDb().prepare('SELECT pronouns FROM professores WHERE id = ?').get(professorId) as { pronouns: Pronouns } | undefined;
  return row?.pronouns === 'ele/dele' || row?.pronouns === 'ela/dela' ? row.pronouns : null;
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

function isAuxiliarLogin(login: string, auth: AuthProvider): boolean {
  return textoConfere(login, lerConta(getDb())?.login ?? env.conta.login) ||
    (Boolean(auth.auxiliarEmail) && textoConfere(login.toLowerCase(), auth.auxiliarEmail));
}

async function bindAuxiliar(auth: AuthProvider, remote: AuthSession, senhaLocal?: string) {
  const db = getDb();
  if (remote.userId !== auth.auxiliarId || remote.email !== auth.auxiliarEmail || !remote.emailVerified) {
    throw new AuthFailure('Esta identidade não tem acesso a esta instalação.', 403);
  }
  const binding = lerVinculoDaConta(db);
  if (binding && binding.id !== remote.userId) throw new AuthFailure('A instalação está vinculada a outra identidade.', 403);
  if (!binding && contaPrecisaVinculo(db) && (!senhaLocal || !await conferirSenhaDefinitiva(db, senhaLocal))) {
    throw new AuthFailure('Informe a senha anterior desta instalação para concluir o vínculo.', 422);
  }
  const local = lerConta(db) ?? criarConta(db, env.conta.login);
  return binding ? local : vincularConta(db, local.id, remote.userId, remote.email);
}

conta.get('/configuracao', (context) => context.json({
  configurada: context.get('auth').configured,
  precisaVincular: contaPrecisaVinculo(getDb()),
}));

conta.post('/codigos', async (context) => {
  const body = await context.req.json().catch(() => null);
  const login = typeof body?.login === 'string' ? body.login.trim() : '';
  if (!isAuxiliarLogin(login, context.get('auth'))) return context.json({ error: 'Use o acesso pelo CPF e senha do portal ou informe o login do auxiliar de ensino.' }, 400);
  if (body?.tipo !== undefined && !['setup', 'recovery'].includes(body.tipo)) return context.json({ error: 'Informe o tipo de confirmação.' }, 400);
  await context.get('auth').sendCode(undefined, body?.tipo ?? 'recovery');
  return context.json({ enviado: true });
});

conta.post('/codigos/verificacoes', async (context) => {
  const parsed = codigoDeAcessoSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: 'Informe o login e o código recebido.' }, 400);
  const auth = context.get('auth');
  if (!isAuxiliarLogin(parsed.data.login, auth)) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
  const remote = await auth.verifyCode(parsed.data.codigo);
  try {
    const local = await bindAuxiliar(auth, remote, parsed.data.senhaLocal);
    const token = abrirSessao({ papel: 'auxiliar de ensino', contaId: local.id }, remote, 'recovery');
    return context.json({ token, conta: { ...local, precisaTrocarSenha: true, acessoPorCodigo: true, papel: 'auxiliar de ensino' } });
  } catch (error) { await remote.signOut('local').catch(() => {}); throw error; }
});

conta.post('/entrar', async (context) => {
  const parsed = entrarSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? 'Dados de acesso inválidos.' }, 400);
  const auth = context.get('auth');
  if (!auth.configured) throw new AuthFailure('Configure a autenticação do Supabase nesta instalação.', 503);
  const { login, senha, senhaLocal } = parsed.data;
  if (isAuxiliarLogin(login, auth)) {
    const remote = await auth.signIn(auth.auxiliarEmail, senha);
    try {
      const local = await bindAuxiliar(auth, remote, senhaLocal ?? senha);
      const token = abrirSessao({ papel: 'auxiliar de ensino', contaId: local.id }, remote, local.precisaTrocarSenha ? 'setup' : 'full');
      return context.json({ token, conta: { ...local, papel: 'auxiliar de ensino' } });
    } catch (error) { await remote.signOut('local').catch(() => {}); throw error; }
  }

  const cpf = onlyDigits(login);
  const cadastrado = getProfessorPorLogin(getDb(), cpf);
  if (!cadastrado) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
  const binding = getDb().prepare('SELECT supabase_auth_id, auth_email, auth_sync_status, auth_revision FROM professores WHERE id = ?').get(cadastrado.id) as {
    supabase_auth_id: string | null; auth_email: string; auth_sync_status: string; auth_revision: number;
  };
  if (!cadastrado.acessoLiberado || binding.auth_sync_status !== 'ready' || !binding.supabase_auth_id) return context.json({ error: 'O auxiliar de ensino precisa concluir a liberação do seu acesso.' }, 403);
  const professor = await autenticarProfessor(getDb(), createEncryptionPort(), cpf, senha);
  if (!professor) return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
  const remote = await auth.signIn(binding.auth_email, senha);
  if (remote.userId !== binding.supabase_auth_id || !remote.emailVerified) {
    await remote.signOut('local').catch(() => {});
    return context.json({ error: CREDENCIAIS_INVALIDAS }, 401);
  }
  return context.json({
    token: abrirSessao({ papel: 'professor', professorId: professor.id, authRevision: binding.auth_revision }, remote),
    conta: { ...professor, email: '', precisaTrocarSenha: false, papel: 'professor', professorId: professor.id, pronouns: readPronouns(professor.id) },
  });
});

conta.get('/', exigirSessao, (context) => {
  const identidade = context.get('identidade');
  return context.json(identidade.papel === 'auxiliar de ensino'
    ? { ...context.get('conta')!, precisaTrocarSenha: context.get('conta')!.precisaTrocarSenha || context.get('sessao').purpose !== 'full', acessoPorCodigo: context.get('sessao').purpose === 'recovery', papel: identidade.papel }
    : { ...context.get('professor')!, email: '', precisaTrocarSenha: false, papel: identidade.papel, professorId: identidade.professorId, pronouns: readPronouns(identidade.professorId) });
});

conta.post('/sair', exigirSessao, async (context) => {
  await encerrarSessao(context.get('token'));
  return context.body(null, 204);
});

conta.put('/', exigirSessao, exigirAuxiliarDeEnsino, async (context) => {
  if (context.get('sessao').purpose !== 'full') return context.json({ error: 'Defina sua senha antes de continuar.' }, 403);
  const parsed = contaSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? 'Dados da conta inválidos.' }, 400);
  return context.json({ ...atualizarConta(getDb(), context.get('conta')!.id, parsed.data), papel: 'auxiliar de ensino' });
});

conta.put('/senha', exigirSessao, exigirAuxiliarDeEnsino, async (context) => {
  const parsed = novaSenhaSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: parsed.error.issues[0]?.message ?? 'Senha inválida.' }, 400);
  const sessao = context.get('sessao');
  const { senhaAtual, senha } = parsed.data;
  if (senhaAtual && textoConfere(senha, senhaAtual)) return context.json({ error: 'A nova senha precisa ser diferente da atual.' }, 400);
  if (sessao.purpose !== 'recovery') {
    if (!senhaAtual) return context.json({ error: 'Informe a senha atual.' }, 422);
    let proof: AuthSession;
    try { proof = await context.get('auth').signIn(sessao.provider.email, senhaAtual); }
    catch (error) {
      if (error instanceof AuthFailure && error.status === 401) return context.json({ error: 'A senha atual está incorreta.' }, 422);
      throw error;
    }
    const valid = proof.userId === sessao.provider.userId;
    await proof.signOut('local').catch(() => {});
    if (!valid) return context.json({ error: 'A senha atual está incorreta.' }, 422);
  }
  await sessao.provider.changeSenha(senha, senhaAtual || undefined);
  await encerrarSessoesDaConta(context.get('conta')!.id, context.get('token'));
  await sessao.provider.signOut('others');
  concluirPrimeiroAcesso(getDb(), context.get('conta')!.id);
  return context.json({ ...lerConta(getDb())!, papel: 'auxiliar de ensino', token: renovarSessao(context.get('token')) });
});

conta.put('/pronouns', exigirSessao, async (context) => {
  const identidade = context.get('identidade');
  if (identidade.papel !== 'professor') return context.json({ error: 'Access denied.' }, 403);
  const parsed = pronounsSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: 'Invalid pronouns.' }, 400);
  getDb().prepare('UPDATE professores SET pronouns = ? WHERE id = ?').run(parsed.data.pronouns, identidade.professorId);
  return context.json(parsed.data);
});
