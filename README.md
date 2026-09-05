# Esmeraldinha

SPA em React + TypeScript com [Vite](https://vite.dev), Tailwind CSS v4 e shadcn/ui.

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

Abra [http://localhost:5173](http://localhost:5173).

A página inicial fica em `src/pages/home.tsx`; o shell da aplicação (tema, sidebar,
header) em `src/App.tsx`.

## Scripts

| Comando                 | Descrição                                                    |
| ------------------------ | ------------------------------------------------------------- |
| `pnpm dev`               | Servidor de desenvolvimento (Vite + API) com HMR              |
| `pnpm dev:web`           | Só o Vite                                                     |
| `pnpm dev:api`           | Só a API (Hono), com watch                                    |
| `pnpm dev:electron`      | Vite + Electron apontando pro dev server                      |
| `pnpm start:api`         | A API sem watch                                               |
| `pnpm typecheck`         | `tsc -b` sem gerar build                                       |
| `pnpm build`             | Type-check + build de produção do renderer                    |
| `pnpm build:electron`    | Builda o processo principal do Electron (`dist-electron/`)    |
| `pnpm playwright:install`| Baixa o Chromium do Playwright                                 |
| `pnpm dist`              | Builda tudo e empacota os instaladores da plataforma atual    |
| `pnpm dist:win`          | Idem, só o instalador Windows (precisa rodar no Windows)      |
| `pnpm dist:linux`        | Idem, só os pacotes Linux                                      |
| `pnpm preview`           | Serve o build de `dist/` localmente                            |
| `pnpm lint`              | ESLint                                                         |
| `pnpm test`              | Testes (Vitest)                                                |

## Estrutura

- `index.html` — entrada do Vite, carrega as fontes do Google Fonts
- `src/main.tsx` — bootstrap do React
- `src/components/ui` — componentes shadcn/ui (`pnpm dlx shadcn@latest add <componente>`)
- `src/globals.css` — Tailwind, tokens de tema e variáveis de fonte
- `public/` — arquivos estáticos servidos na raiz
- `server/` — API Hono, compartilhada entre `pnpm dev:api` e o processo principal
  do Electron
- `electron/` — o shell desktop: `main.ts` roteia `app://` e `/api/*` in-process,
  `build.mjs` bundla o processo principal com esbuild

## Distribuição

O app é distribuído como instalador desktop (Electron), não hospedado. Pra
empacotar localmente:

```bash
PLAYWRIGHT_BROWSERS_PATH=$PWD/pw-browsers pnpm playwright:install
pnpm dist
```

O Chromium do Playwright precisa estar em `pw-browsers/` antes do empacotamento —
é grande demais pro asar e o `electron-builder.yml` o copia como recurso externo.
Buildar o instalador Windows exige rodar no Windows (ou CI); não há cross-build
via wine/docker configurado.

Os binários **não são assinados** (sem certificado de assinatura de código
ainda). No Windows, o SmartScreen mostra "Windows protected your PC" — clique em
*More info* e depois *Run anyway* para instalar.

