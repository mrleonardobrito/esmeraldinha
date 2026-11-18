import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authDeTeste, AUXILIAR_EMAIL, AUXILIAR_ID, INITIAL_SENHA } from './auth-de-teste';
import { autenticar } from './sessao-de-teste';

vi.mock('../portal-sessions', () => ({
  openSession: vi.fn(async () => ({ id: 'validated-portal-session' })), closeSession: vi.fn(async () => true),
  donoDaSessao: vi.fn(async () => 'other-professor'), touchSession: vi.fn(), retomarSessao: vi.fn(), getCatalogo: vi.fn(),
}));

const PROFESSOR_ID = '00000000-0000-4000-8000-000000000002';
const professorInput = { nome: 'Maria Professora', login: '52998224725', senha: 'senha-do-portal', escola: 'Escola Municipal', email: 'professor@example.test' };
let directory: string;
let auth: ReturnType<typeof authDeTeste>;

function request(path: string, body?: unknown, token?: string, method = 'POST') {
  return new Request(`http://localhost/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function app() { return (await import('../app')).createApp({ auth }); }
async function readyProfessor() {
  const { getDb } = await import('../professores/db');
  const { createProfessor } = await import('../professores/store');
  const { createEncryptionPort } = await import('../encryption');
  const professor = await createProfessor(getDb(), createEncryptionPort(), professorInput);
  getDb().prepare("UPDATE professores SET acesso_liberado = 1, auth_sync_status = 'ready', supabase_auth_id = ? WHERE id = ?").run(PROFESSOR_ID, professor.id);
  auth.identities.set(professorInput.email, { id: PROFESSOR_ID, senha: professorInput.senha });
  return professor;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'esmeraldinha-auth-'));
  vi.stubEnv('ESMERALDINHA_DB_PATH', join(directory, 'app.db'));
  vi.stubEnv('ESMERALDINHA_LOGIN', 'auxiliar');
  vi.stubEnv('ESMERALDINHA_ENCRYPTION_KEY', 'integration-test-encryption-key');
  vi.stubEnv('ENCRYPTION_ADAPTER', 'dev');
  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_AUXILIAR_AUTH_ID', 'SUPABASE_AUXILIAR_EMAIL']) vi.stubEnv(name, '');
  vi.resetModules();
  auth = authDeTeste();
});
afterEach(async () => {
  await (await import('../conta/sessoes')).encerrarTodasAsSessoes();
  (await import('../professores/db')).closeDb();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('Supabase admission and local identity binding', () => {
  it('keeps health available but rejects entry without complete public configuration', async () => {
    const current = (await import('../app')).createApp();
    expect((await current.fetch(request('/health', undefined, undefined, 'GET'))).status).toBe(200);
    expect(await (await current.fetch(request('/conta/configuracao', undefined, undefined, 'GET'))).json()).toMatchObject({ configurada: false });
    expect((await current.fetch(request('/conta/entrar', { login: 'auxiliar', senha: 'esmeraldinha' }))).status).toBe(503);
  });
  it('rejects a valid remote identity that is not the configured auxiliar', async () => {
    auth.identities.set(AUXILIAR_EMAIL, { id: PROFESSOR_ID, senha: INITIAL_SENHA });
    const response = await (await app()).fetch(request('/conta/entrar', { login: 'auxiliar', senha: INITIAL_SENHA }));
    expect(response.status).toBe(403);
    expect((await import('../conta/store')).lerConta((await import('../professores/db')).getDb())).toBeNull();
  });
  it('requires the legacy local senha once and preserves existing IDs and encrypted portal data', async () => {
    const { getDb } = await import('../professores/db');
    const { criarConta, definirSenha, lerVinculoDaConta } = await import('../conta/store');
    const original = criarConta(getDb(), 'auxiliar');
    await definirSenha(getDb(), original.id, 'previous-local-senha');
    const professor = await readyProfessor();
    const originalCipher = getDb().prepare('SELECT senha_encrypted FROM professores WHERE id = ?').get(professor.id);
    const current = await app();
    expect((await current.fetch(request('/conta/entrar', { login: 'auxiliar', senha: INITIAL_SENHA }))).status).toBe(422);
    expect(lerVinculoDaConta(getDb())).toBeNull();
    const response = await current.fetch(request('/conta/entrar', { login: 'auxiliar', senha: INITIAL_SENHA, senhaLocal: 'previous-local-senha' }));
    expect(await response.json()).toMatchObject({ conta: { id: original.id, precisaTrocarSenha: true } });
    expect(getDb().prepare('SELECT senha_hash FROM conta').get()).toEqual({ senha_hash: null });
    expect(lerVinculoDaConta(getDb())?.id).toBe(AUXILIAR_ID);
    expect(getDb().prepare('SELECT senha_encrypted FROM professores WHERE id = ?').get(professor.id)).toEqual(originalCipher);
  });
  it('restricts an email-code recovery session until a senha is set and rotates its token', async () => {
    const current = await app();
    const existing = await autenticar(current);
    const response = await current.fetch(request('/conta/codigos/verificacoes', { login: 'auxiliar', codigo: '123456' }));
    const { token } = await response.json() as { token: string };
    expect((await current.fetch(request('/professores', undefined, token, 'GET'))).status).toBe(403);
    expect((await current.fetch(request('/conta', { nome: 'Unsafe recovery edit' }, token, 'PUT'))).status).toBe(403);
    const changed = await current.fetch(request('/conta/senha', { senha: 'new-recovered-senha' }, token, 'PUT'));
    const rotated = await changed.json() as { token: string };
    expect(changed.status).toBe(200);
    expect(rotated.token).not.toBe(token);
    expect((await current.fetch(request('/conta', undefined, token, 'GET'))).status).toBe(401);
    expect((await existing.fetch(request('/conta', undefined, undefined, 'GET'))).status).toBe(401);
    expect((await current.fetch(request('/professores', undefined, rotated.token, 'GET'))).status).toBe(200);
  });
  it('expires the app token by idleness even while the provider can still refresh', async () => {
    const current = await app();
    const signed = await autenticar(current);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 9 * 60 * 60_000);
    expect((await signed.fetch(request('/conta', undefined, undefined, 'GET'))).status).toBe(401);
  });
  it('does not read a contact email as a new authorization identity', async () => {
    const signed = await autenticar(await app());
    expect((await signed.fetch(request('/conta', { nome: 'Auxiliar Local', email: 'contact@example.test' }, undefined, 'PUT'))).status).toBe(200);
    expect((await import('../conta/store')).lerVinculoDaConta((await import('../professores/db')).getDb())).toEqual({ id: AUXILIAR_ID, email: AUXILIAR_EMAIL });
  });
  it('cleans up an idle session without waiting for another API request', async () => {
    vi.useFakeTimers();
    const sessions = await import('../conta/sessoes');
    const cleanup = vi.fn(async () => {});
    sessions.registrarLimpezaDeSessao(cleanup);
    const token = sessions.abrirSessao({ papel: 'auxiliar de ensino', contaId: 'local-conta' }, auth.session(auth.auxiliarEmail));
    await vi.advanceTimersByTimeAsync(9 * 60 * 60_000);
    expect(sessions.sessaoAindaAtiva(token)).toBe(false);
    expect(cleanup).toHaveBeenCalledWith(token);
  });
});

describe('CPF and portal-senha compatibility', () => {
  it('accepts a formatted CPF and denies both foreign references and privileged management', async () => {
    const current = await app();
    const professor = await readyProfessor();
    const response = await current.fetch(request('/conta/entrar', { login: '529.982.247-25', senha: professorInput.senha }));
    expect(response.status).toBe(200);
    const { token } = await response.json() as { token: string };
    expect((await current.fetch(request(`/cadernetas?professorId=${professor.id}`, undefined, token, 'GET'))).status).toBe(200);
    for (const path of ['/professores', '/cadernetas?professorId=foreign', '/cadernetas/sessoes/foreign']) expect((await current.fetch(request(path, undefined, token, 'GET'))).status).toBe(403);
    const form = new FormData(); form.append('professorId', 'foreign');
    expect((await current.fetch(new Request('http://localhost/api/cadernetas/sessoes/foreign/envios', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }))).status).toBe(403);
  });
  it('does not accept an independent provider senha or fall back to the local encrypted senha', async () => {
    const current = await app(); await readyProfessor();
    auth.identities.get(professorInput.email)!.senha = 'independent-provider-senha';
    for (const senha of [professorInput.senha, 'independent-provider-senha']) expect((await current.fetch(request('/conta/entrar', { login: professorInput.login, senha }))).status).toBe(401);
  });
  it('denies an already-issued token immediately after local access is revoked', async () => {
    const current = await app(); const signed = await autenticar(current); const professor = await readyProfessor();
    const { token } = await (await current.fetch(request('/conta/entrar', { login: professorInput.login, senha: professorInput.senha }))).json() as { token: string };
    auth.administer.mockResolvedValue({ id: PROFESSOR_ID, email: professorInput.email, verified: true });
    expect((await signed.fetch(request(`/professores/${professor.id}/acesso`, { liberado: false }, undefined, 'PUT'))).status).toBe(200);
    expect((await current.fetch(request('/conta', undefined, token, 'GET'))).status).toBe(401);
    expect((await current.fetch(request('/conta/entrar', { login: professorInput.login, senha: professorInput.senha }))).status).toBe(403);
  });
  it('keeps a failed synchronization encrypted and reuses its operation ID on retry', async () => {
    const current = await app(); const signed = await autenticar(current); const professor = await readyProfessor();
    const { AuthFailure } = await import('../conta/supabase');
    auth.administer.mockRejectedValueOnce(new AuthFailure('Offline', 503)).mockResolvedValue({ id: PROFESSOR_ID, email: professorInput.email, verified: true });
    const update = { ...professorInput, senha: 'replacement-portal-senha' };
    expect((await signed.fetch(request(`/professores/${professor.id}`, update, undefined, 'PUT'))).status).toBe(503);
    const { getDb } = await import('../professores/db');
    const pending = getDb().prepare('SELECT operation_id, payload FROM professor_auth_operations WHERE professor_id = ?').get(professor.id) as { operation_id: string; payload: Uint8Array };
    expect(Buffer.from(pending.payload).toString()).not.toContain(update.senha);
    expect((await current.fetch(request('/conta/entrar', { login: professorInput.login, senha: professorInput.senha }))).status).toBe(403);
    expect((await signed.fetch(request(`/professores/${professor.id}/auth/reconciliacoes`))).status).toBe(200);
    expect(auth.administer.mock.calls[1][1].operationId).toBe(pending.operation_id);
    const stored = await (await import('../professores/store')).getProfessorCredenciais(getDb(), (await import('../encryption')).createEncryptionPort(), professor.id);
    expect(stored?.senha).toBe(update.senha);
    expect(getDb().prepare('SELECT professor_id FROM professor_auth_operations').all()).toEqual([]);
  });
  it('leaves no resumable remote operation when the local access gate cannot be saved', async () => {
    const professor = await readyProfessor();
    const db = (await import('../professores/db')).getDb();
    db.exec("CREATE TRIGGER reject_pending BEFORE UPDATE OF auth_sync_status ON professores WHEN NEW.auth_sync_status = 'pending' BEGIN SELECT RAISE(ABORT, 'Injected write failure'); END");
    const { updateProfessorWithAuth } = await import('../professores/acesso');
    await expect(updateProfessorWithAuth(professor.id, { ...professorInput, senha: 'replacement-portal-senha' }, auth, auth.session(auth.auxiliarEmail))).rejects.toThrow('Injected write failure');
    expect(auth.administer).not.toHaveBeenCalled();
    expect(db.prepare('SELECT professor_id FROM professor_auth_operations').all()).toEqual([]);
    expect(db.prepare('SELECT acesso_liberado, auth_sync_status FROM professores WHERE id = ?').get(professor.id)).toEqual({ acesso_liberado: 1, auth_sync_status: 'ready' });
    const stored = await (await import('../professores/store')).getProfessorCredenciais(db, (await import('../encryption')).createEncryptionPort(), professor.id);
    expect(stored?.senha).toBe(professorInput.senha);
  });
  it('requires email verification and a portal senha even after an email code is verified', async () => {
    const current = await app(); const signed = await autenticar(current);
    const { getDb } = await import('../professores/db');
    const professor = await (await import('../professores/store')).createProfessor(getDb(), (await import('../encryption')).createEncryptionPort(), professorInput);
    let verified = false;
    auth.administer.mockImplementation(async () => {
      auth.identities.set(professorInput.email, { id: PROFESSOR_ID, senha: professorInput.senha });
      return { id: PROFESSOR_ID, email: professorInput.email, verified };
    });
    const enrollment = await signed.fetch(request(`/professores/${professor.id}/acesso`, { liberado: true }, undefined, 'PUT'));
    expect(await enrollment.json()).toMatchObject({ acessoLiberado: false, authStatus: 'verifying' });
    expect((await current.fetch(request('/conta/entrar', { login: professorInput.login, senha: professorInput.senha }))).status).toBe(403);
    expect((await signed.fetch(request(`/professores/${professor.id}/auth/verificacoes`, { codigo: '000000' }))).status).toBe(422);
    expect((await signed.fetch(request('/conta', undefined, undefined, 'GET'))).status).toBe(200);
    verified = true;
    expect((await signed.fetch(request(`/professores/${professor.id}/auth/verificacoes`, { codigo: '123456' }))).status).toBe(200);
    expect((await current.fetch(request('/conta/entrar', { login: professorInput.email, senha: professorInput.senha }))).status).toBe(401);
    expect((await current.fetch(request('/conta/entrar', { login: professorInput.login, senha: professorInput.senha }))).status).toBe(200);
  });
  it('allows correction after a definitive provider policy rejection without enabling access', async () => {
    const current = await app(); const signed = await autenticar(current); const professor = await readyProfessor();
    const { AuthFailure } = await import('../conta/supabase');
    auth.administer.mockRejectedValue(new AuthFailure('Policy rejection', 422));
    expect((await signed.fetch(request(`/professores/${professor.id}`, { ...professorInput, senha: 'new-portal-senha' }, undefined, 'PUT'))).status).toBe(422);
    const db = (await import('../professores/db')).getDb();
    expect(db.prepare('SELECT professor_id FROM professor_auth_operations').all()).toEqual([]);
    expect(db.prepare('SELECT acesso_liberado FROM professores WHERE id = ?').get(professor.id)).toEqual({ acesso_liberado: 0 });
  });
});
