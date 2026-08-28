import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, protocol, shell } from 'electron';

import type { Hono } from 'hono';

/**
 * A SPA é servida por um esquema próprio em vez de `file://`: assim o
 * `BrowserRouter` continua funcionando e o mesmo handler pode responder `/api`
 * chamando a Hono direto, sem subir um servidor HTTP na máquina do usuário.
 */
const SCHEME = 'app';
const APP_URL = `${SCHEME}://esmeraldinha/`;

/** Definido por `dev:desktop`; a ausência dele significa build empacotado. */
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const rootDir = join(__dirname, '..');
const rendererDir = join(rootDir, 'dist');

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

/**
 * O import é tardio de propósito: `server/env.ts` lê `process.env` ao carregar,
 * então os caminhos precisam estar definidos antes.
 */
function getApi(): Promise<Hono> {
  if (!apiPromise) {
    process.env.PORTAL_DEBUG_DIR ||= join(app.getPath('userData'), 'portal-debug');
    process.env.PLAYWRIGHT_BROWSERS_PATH ||= app.isPackaged
      ? join(process.resourcesPath, 'pw-browsers')
      : join(rootDir, 'pw-browsers');

    apiPromise = import('../server/app')
      .then(({ createApp }) => createApp())
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

  // Um `..` no caminho não pode escapar do diretório do build.
  const inside =
    filePath === rendererDir || filePath.startsWith(`${rendererDir}${sep}`);
  const isFile = inside && (await stat(filePath).catch(() => null))?.isFile();

  // Rotas do react-router não existem em disco: caem no index.html.
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

/** O Vite pode ainda não estar de pé quando o Electron abre. */
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

  window.once('ready-to-show', () => window.show());

  // Links externos abrem no navegador do sistema, nunca dentro do app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
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

  // Sem isso os contextos do Playwright ficariam órfãos ao fechar o app.
  app.on('before-quit', (event) => {
    if (!apiPromise) return;

    event.preventDefault();
    apiPromise = null;

    void import('../server/portal-sessions')
      .then(({ closeAllSessions }) => closeAllSessions())
      .catch(() => {})
      .finally(() => app.quit());
  });
}
