import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { createApp as CreateApp } from '../../app';
import { authDeTeste, autenticar, SENHA_DE_TESTE } from '../../__tests__/sessao-de-teste';

const LOGIN = 'auxiliar-de-teste';
const SENHA_TEMPORARIA = 'senha-inicial-de-teste';
let auth: ReturnType<typeof authDeTeste>;

const originalEnv = {
  dbPath: process.env.ESMERALDINHA_DB_PATH,
  login: process.env.ESMERALDINHA_LOGIN,
  senha: process.env.ESMERALDINHA_SENHA_TEMPORARIA,
  encryptionKey: process.env.ESMERALDINHA_ENCRYPTION_KEY,
};

let tempDir: string;

async function freshApp() {
  const { createApp } = await import('../../app');
  auth = authDeTeste();
  return (createApp as typeof CreateApp)({ auth });
}

function entrar(senha: string, login = LOGIN) {
  return new Request('http://localhost/api/conta/entrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, senha }),
  });
}

function comToken(request: Request, token: string) {
  const autenticada = new Request(request);
  autenticada.headers.set('Authorization', `Bearer ${token}`);
  return autenticada;
}

describe('conta do auxiliar de ensino', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'esmeraldinha-conta-'));

    process.env.ESMERALDINHA_DB_PATH = join(tempDir, 'esmeraldinha.db');
    process.env.ESMERALDINHA_LOGIN = LOGIN;
    process.env.ESMERALDINHA_SENHA_TEMPORARIA = SENHA_TEMPORARIA;

    vi.resetModules();
  });

  afterEach(async () => {
    process.env.ESMERALDINHA_DB_PATH = originalEnv.dbPath;
    process.env.ESMERALDINHA_LOGIN = originalEnv.login;
    process.env.ESMERALDINHA_SENHA_TEMPORARIA = originalEnv.senha;
    process.env.ESMERALDINHA_ENCRYPTION_KEY = originalEnv.encryptionKey;

    const { closeDb } = await import('../../professores/db');
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('recusa quem não entrou nas rotas dos professores', async () => {
    const app = await freshApp();

    const response = await app.fetch(new Request('http://localhost/api/professores'));

    expect(response.status).toBe(401);
  });

  it('requires a definitive senha after the first Supabase entry', async () => {
    const app = await freshApp();

    const entrada = await app.fetch(entrar(SENHA_TEMPORARIA));
    expect(entrada.status).toBe(200);

    const { token, conta } = (await entrada.json()) as {
      token: string;
      conta: { login: string; precisaTrocarSenha: boolean };
    };
    expect(conta).toMatchObject({ login: LOGIN, precisaTrocarSenha: true });

    const professores = await app.fetch(
      comToken(new Request('http://localhost/api/professores'), token),
    );
    expect(professores.status).toBe(403);
  });

  it('recusa login ou senha que não conferem', async () => {
    const app = await freshApp();

    const senhaErrada = await app.fetch(entrar('outra-senha'));
    expect(senhaErrada.status).toBe(401);

    const loginErrado = await app.fetch(entrar(SENHA_TEMPORARIA, 'outro-login'));
    expect(loginErrado.status).toBe(401);
  });

  it('abre uma sessão de professor, limitada às próprias cadernetas', async () => {
    process.env.ESMERALDINHA_ENCRYPTION_KEY = 'chave-de-teste-para-professor';
    const app = await freshApp();
    const { createEncryptionPort } = await import('../../encryption');
    const { createProfessor, setProfessorAcesso } = await import('../../professores/store');
    const { getDb } = await import('../../professores/db');

    const professor = await createProfessor(getDb(), createEncryptionPort(), {
      nome: 'Maria Professora',
      login: '52998224725',
      senha: 'senha-do-portal',
      escola: 'Escola Municipal',
    });
    const bloqueada = await app.fetch(entrar('senha-do-portal', '529.982.247-25'));
    expect(bloqueada.status).toBe(403);
    setProfessorAcesso(getDb(), professor.id, true);
    auth.identities.set('professor@example.test', { id: '00000000-0000-4000-8000-000000000002', senha: 'senha-do-portal' });
    getDb().prepare("UPDATE professores SET auth_email = 'professor@example.test', supabase_auth_id = '00000000-0000-4000-8000-000000000002', auth_sync_status = 'ready' WHERE id = ?").run(professor.id);

    const entrada = await app.fetch(entrar('senha-do-portal', '529.982.247-25'));
    expect(entrada.status).toBe(200);
    const { token, conta } = (await entrada.json()) as {
      token: string;
      conta: { papel: string; professorId: string };
    };
    expect(conta).toMatchObject({ papel: 'professor', professorId: professor.id });

    const preference = await app.fetch(comToken(new Request('http://localhost/api/conta/pronouns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pronouns: 'ela/dela', professorId: 'another-professor' }),
    }), token));
    expect(preference.status).toBe(200);
    const reentry = await app.fetch(entrar('senha-do-portal', professor.login));
    await expect(reentry.json()).resolves.toMatchObject({ conta: { pronouns: 'ela/dela' } });
    const cleared = await app.fetch(comToken(new Request('http://localhost/api/conta/pronouns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pronouns: null }),
    }), token));
    expect(cleared.status).toBe(200);
    const current = await app.fetch(comToken(new Request('http://localhost/api/conta'), token));
    await expect(current.json()).resolves.toMatchObject({ pronouns: null });

    const proprias = await app.fetch(
      comToken(
        new Request(`http://localhost/api/cadernetas?professorId=${professor.id}`),
        token,
      ),
    );
    expect(proprias.status).toBe(200);

    setProfessorAcesso(getDb(), professor.id, false);
    const revogada = await app.fetch(entrar('senha-do-portal', '529.982.247-25'));
    expect(revogada.status).toBe(403);
    setProfessorAcesso(getDb(), professor.id, true);
    auth.identities.set('professor@example.test', { id: '00000000-0000-4000-8000-000000000002', senha: 'senha-do-portal' });
    getDb().prepare("UPDATE professores SET auth_email = 'professor@example.test', supabase_auth_id = '00000000-0000-4000-8000-000000000002', auth_sync_status = 'ready' WHERE id = ?").run(professor.id);

    const gestao = await app.fetch(
      comToken(new Request('http://localhost/api/professores'), token),
    );
    expect(gestao.status).toBe(403);

    for (const path of [
      '/api/cadernetas?professorId=another-professor',
      '/api/cadernetas/turmas?sessionId=unknown-session',
      '/api/cadernetas/sessoes/unknown-session',
    ]) {
      const denied = await app.fetch(comToken(new Request(`http://localhost${path}`), token));
      expect(denied.status).toBe(403);
    }

    for (const path of [
      '/api/cadernetas',
      '/api/cadernetas/sessoes/unknown-session/envios/aulas/preenchimentos-assistidos',
      '/api/cadernetas/sessoes/unknown-session/envios/boletim/preenchimentos-assistidos',
    ]) {
      const denied = await app.fetch(comToken(new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professorId: 'another-professor' }),
      }), token));
      expect(denied.status).toBe(403);
    }
  });

  it('depois da troca, só a senha definitiva entra', async () => {
    const app = await freshApp();
    await autenticar(app);

    const comTemporaria = await app.fetch(entrar(SENHA_TEMPORARIA));
    expect(comTemporaria.status).toBe(401);

    const comDefinitiva = await app.fetch(entrar(SENHA_DE_TESTE));
    expect(comDefinitiva.status).toBe(200);
    await expect(comDefinitiva.json()).resolves.toMatchObject({
      conta: { precisaTrocarSenha: false },
    });
  });

  it('libera as rotas protegidas depois do primeiro acesso', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const response = await sessao.fetch(
      new Request('http://localhost/api/professores'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it('rejects reusing the current senha as the definitive senha', async () => {
    const app = await freshApp();
    const { token } = (await (await app.fetch(entrar(SENHA_TEMPORARIA))).json()) as {
      token: string;
    };

    const response = await app.fetch(
      comToken(
        new Request('http://localhost/api/conta/senha', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senhaAtual: SENHA_TEMPORARIA,
            senha: SENHA_TEMPORARIA,
          }),
        }),
        token,
      ),
    );

    expect(response.status).toBe(400);
  });

  it('exige a senha atual para trocá-la', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const response = await sessao.fetch(
      new Request('http://localhost/api/conta/senha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual: 'chute', senha: 'outra-senha-boa' }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it('derruba as outras sessões ao trocar a senha', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const outra = (await (await app.fetch(entrar(SENHA_DE_TESTE))).json()) as {
      token: string;
    };

    const changed = await sessao.fetch(
      new Request('http://localhost/api/conta/senha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senhaAtual: SENHA_DE_TESTE,
          senha: 'terceira-senha',
        }),
      }),
    );

    const antiga = await app.fetch(
      comToken(new Request('http://localhost/api/conta'), outra.token),
    );
    expect(antiga.status).toBe(401);

    // A sessão que trocou a senha continua de pé: quem trocou não é deslogado.
    const rotated = (await changed.json()) as { token: string };
    const atual = await app.fetch(comToken(new Request('http://localhost/api/conta'), rotated.token));
    expect(atual.status).toBe(200);
  });

  it('edita nome, e-mail e foto do perfil', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const response = await sessao.fetch(
      new Request('http://localhost/api/conta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Joana Auxiliar',
          email: 'joana@escola.exemplo',
          imagem: 'data:image/png;base64,abc',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      nome: 'Joana Auxiliar',
      email: 'joana@escola.exemplo',
      imagem: 'data:image/png;base64,abc',
      login: LOGIN,
    });

    const relida = await sessao.fetch(new Request('http://localhost/api/conta'));
    await expect(relida.json()).resolves.toMatchObject({ nome: 'Joana Auxiliar' });
  });

  it('recusa e-mail inválido', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const response = await sessao.fetch(
      new Request('http://localhost/api/conta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Joana Auxiliar', email: 'joana' }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('sair invalida o token da sessão', async () => {
    const app = await freshApp();
    const sessao = await autenticar(app);

    const saida = await sessao.fetch(
      new Request('http://localhost/api/conta/sair', { method: 'POST' }),
    );
    expect(saida.status).toBe(204);

    const depois = await sessao.fetch(new Request('http://localhost/api/conta'));
    expect(depois.status).toBe(401);
  });
});
