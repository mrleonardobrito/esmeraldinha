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

| Comando                 | Descrição                                            |
| ----------------------- | ---------------------------------------------------- |
| `pnpm dev`              | Vite + API, com HMR                                  |
| `pnpm dev:electron`     | Vite + Electron, exercitando o roteamento `app://`   |
| `pnpm build`            | Type-check (`tsc -b`) + build de produção            |
| `pnpm build:electron`   | Empacota o processo principal em `dist-electron/`    |
| `pnpm typecheck`        | `tsc -b`                                             |
| `pnpm lint`             | ESLint                                               |
| `pnpm test`             | Vitest                                               |
| `pnpm preview`          | Serve o build de `dist/` localmente                  |
| `pnpm playwright:install` | Baixa o Chromium usado no empacotamento            |
| `pnpm dist`             | Instaladores para a plataforma atual                 |
| `pnpm dist:win`         | Instalador Windows (NSIS x64)                        |
| `pnpm dist:linux`       | Instaladores Linux (AppImage + deb x64)              |

`pnpm dev` roda a API como processo separado (`tsx`), que é o caminho do dia a
dia. `pnpm dev:electron` sobe o app de verdade, com a API Hono in-process — use
quando a mudança tocar o processo principal ou o roteamento `app://`.

## Distribuição

Esmeraldinha é um app Electron desktop: a API roda dentro do processo
principal, o SQLite fica em `userData` e as senhas dos professores são cifradas
pelo chaveiro do sistema operacional. Não há versão hospedada.

O Node precisa ser o 24 (veja `.nvmrc`) — é o que o Electron 44 embute.

```bash
# O Chromium do Playwright é empacotado junto e precisa estar em pw-browsers/.
PLAYWRIGHT_BROWSERS_PATH="$PWD/pw-browsers" pnpm playwright:install
pnpm dist
```

Os instaladores saem em `release/`.

### Os binários não são assinados

Sem certificado de assinatura de código, o Windows mostra a tela azul do
SmartScreen na primeira execução. Para instalar: **More info → Run anyway**.

No Linux, o `safeStorage` do Electron precisa de um chaveiro (gnome-keyring ou
kwallet) para cifrar as senhas. O `.deb` declara essa dependência; quem usa o
AppImage precisa garantir que um chaveiro esteja instalado e destravado.

## Estrutura

- `index.html` — entrada do Vite, carrega as fontes do Google Fonts
- `src/main.tsx` — bootstrap do React
- `src/components/ui` — componentes shadcn/ui (`pnpm dlx shadcn@latest add <componente>`)
- `src/globals.css` — Tailwind, tokens de tema e variáveis de fonte
- `public/` — arquivos estáticos servidos na raiz
