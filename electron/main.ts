import { appendFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol, shell } from 'electron';

import type { Hono } from 'hono';

const SCHEME = 'app';
const APP_URL = `${SCHEME}://esmeraldinha/`;

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const rootDir = join(__dirname, '..');
const rendererDir = join(rootDir, 'dist');

// O AppImage não deixa stdout/stderr em lugar nenhum: sem isso, um crash do
// motor do Chromium (GPU, renderer) ou um erro não tratado no Node some sem
// deixar rastro nenhum, como aconteceu antes desse arquivo existir.
const logPath = join(app.getPath('userData'), 'crash.log');
function logToFile(linha: string): void {
  const stamp = new Date().toISOString();
  void appendFile(logPath, `[${stamp}] ${linha}\n`, 'utf8').catch(() => {});
}

process.on('uncaughtException', (error) => {
  logToFile(`uncaughtException: ${error.stack ?? error}`);
});
process.on('unhandledRejection', (reason) => {
  logToFile(`unhandledRejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
});

// Máquinas de auxiliar de ensino não têm GPU dedicada nem precisam de
// aceleração gráfica para telas de formulário/tabela; desligar remove o
// processo GPU do Chromium do caminho crítico — a classe de crash nativo
// mais comum em Electron empacotado como AppImage no Linux.
app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

let apiPromise: Promise<Hono> | null = null;
function getApi(): Promise<Hono> {
  if (!apiPromise) {
    process.env.PORTAL_DEBUG_DIR ||= join(app.getPath('userData'), 'portal-debug');
    process.env.ESMERALDINHA_DB_PATH ||= join(app.getPath('userData'), 'esmeraldinha.db');
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= app.isPackaged
      ? join(process.resourcesPath, 'pw-browsers')
      : join(rootDir, 'pw-browsers');

    apiPromise = import('../server/app')
      .then(({ createApp }) => {
        const api = createApp();
        void import('../server/cadernetas/agenda').then(({ iniciarAgendaSemanal }) =>
          iniciarAgendaSemanal(),
        );
        return api;
      })
      .catch((error: unknown) => {
        apiPromise = null;
        throw error;
      });
  }
  return apiPromise;
}

async function serveAsset(pathname: string): Promise<Response> {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = resolve(rendererDir, relative);

  const inside =
    filePath === rendererDir || filePath.startsWith(`${rendererDir}${sep}`);
  const isFile = inside && (await stat(filePath).catch(() => null))?.isFile();

  const target = isFile ? filePath : join(rendererDir, 'index.html');

  return net.fetch(pathToFileURL(target).toString());
}

function registerProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const api = await getApi();
      return api.fetch(request);
    }

    return serveAsset(pathname);
  });
}

async function loadDevServer(window: BrowserWindow, url: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await window.loadURL(url);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  throw new Error(`Servidor de desenvolvimento não respondeu em ${url}`);
}

// Se o crash for determinístico (não um flake do driver gráfico), recriar a
// janela sem limite viraria um loop batendo CPU a 100% em vez de um app morto
// — pior que o problema original.
let quedasRecentes = 0;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    title: 'Esmeraldinha',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    quedasRecentes = 0;
    window.show();
  });

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Um crash do processo de renderização (o motor Chromium abortando por um
  // CHECK interno, por exemplo) antes só deixava a janela travada em branco.
  // Registrar o evento dá evidência real da próxima vez, e recriar a janela
  // evita que o auxiliar de ensino fique com o app morto sem saber por quê.
  window.webContents.on('render-process-gone', (_event, details) => {
    logToFile(`render-process-gone: ${JSON.stringify(details)}`);
    window.destroy();

    quedasRecentes += 1;
    if (quedasRecentes > 3) {
      logToFile('render-process-gone: 3 quedas seguidas, desistindo de recriar a janela.');
      app.quit();
      return;
    }
    createWindow();
  });

  if (devServerUrl) {
    void loadDevServer(window, devServerUrl);
  } else {
    void window.loadURL(APP_URL);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // Cobre o processo GPU e utilitários do Chromium: um crash ali (o que o
  // coredump anterior não conseguiu confirmar por falta de símbolos) some
  // sem esse log, mesmo com `render-process-gone` capturando o processo de
  // renderização.
  app.on('child-process-gone', (_event, details) => {
    logToFile(`child-process-gone: ${JSON.stringify(details)}`);
  });

  void app.whenReady().then(() => {
    registerProtocol();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (!apiPromise) return;

    event.preventDefault();
    apiPromise = null;

    void import('../server/cadernetas/agenda')
      .then(({ pararAgendaSemanal }) => pararAgendaSemanal())
      .catch(() => {});

    void Promise.all([
      import('../server/portal-sessions').then(({ closeAllSessions }) =>
        closeAllSessions(),
      ),
      import('../server/sessoes-headed').then(({ fecharSessoesHeaded }) =>
        fecharSessoesHeaded(),
      ),
    ])
      .catch(() => {})
      .finally(() => app.quit());
  });
}
