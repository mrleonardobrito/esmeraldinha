import { Hono } from 'hono';
import { expect, it } from 'vitest';
import type { ContaEnv } from '../autenticacao';
import { restringirValores } from '../valores';

for (const papel of ['professor', 'auxiliar de ensino'] as const) {
  it(`restricts financial response fields for ${papel}`, async () => {
    const app = new Hono<ContaEnv>();
    app.use('*', async (c, next) => {
      c.set('identidade', papel === 'professor' ? { papel, professorId: 'p1', authRevision: 0 } : { papel, contaId: 'a1' });
      await next();
    });
    app.use('*', restringirValores);
    const caderneta = { id: 'c1', valorRecebido: 20, valorAReceber: 50, notas: [{ valor: 8 }] };
    app.get('/', (c) => c.json({ cadernetas: [caderneta], valorRecebidoTotal: 20, valorAReceberTotal: 50 }));
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(papel === 'professor'
      ? { cadernetas: [{ id: 'c1', notas: [{ valor: 8 }] }] }
      : { cadernetas: [caderneta], valorRecebidoTotal: 20, valorAReceberTotal: 50 });
  });
}
