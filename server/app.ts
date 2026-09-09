import { Hono } from 'hono';

import { cadernetas } from './cadernetas';
import { conta } from './conta';
import { exigirSenhaDefinitiva, exigirSessao } from './conta/autenticacao';
import { professores } from './professores';
import { turmas } from './turmas';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/api/health', (context) => context.json({ ok: true }));
  app.route('/api/conta', conta);

  // Tudo que fala com o portal ou com os dados dos professores exige uma
  // sessão do auxiliar de ensino com a senha definitiva já no lugar. O
  // caminho da raiz e o com sufixo são dois padrões distintos para o Hono,
  // e a listagem mora no primeiro: os dois precisam ser cobertos.
  for (const rota of ['/api/cadernetas', '/api/professores', '/api/turmas']) {
    app.use(rota, exigirSessao, exigirSenhaDefinitiva);
    app.use(`${rota}/*`, exigirSessao, exigirSenhaDefinitiva);
  }

  app.route('/api/cadernetas', cadernetas);
  app.route('/api/professores', professores);
  app.route('/api/turmas', turmas);

  return app;
}
