# Esmeraldinha

SPA em React + TypeScript com [Vite](https://vite.dev), Tailwind CSS v4 e shadcn/ui.

## Desenvolvimento

```bash
pnpm install
pnpm dev
```

Abra [http://localhost:5173](http://localhost:5173).

A página inicial é o painel, em `src/pages/painel.tsx`; o shell da aplicação
(tema, sidebar, header) em `src/App.tsx`.

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

## Entrar na Esmeraldinha

O app fica atrás de uma conta: só o auxiliar de ensino entra, porque é dele o
acesso às credenciais dos professores guardadas aqui.

Na primeira execução, o login e a senha vêm do ambiente
(`ESMERALDINHA_LOGIN` e `ESMERALDINHA_SENHA_TEMPORARIA`, padrões `auxiliar` e
`esmeraldinha`). Essa senha é temporária: o primeiro acesso obriga a trocá-la
por uma definitiva, que fica no SQLite como hash `scrypt` e passa a ser a
única que entra. O perfil (nome, e-mail e foto) e a troca de senha vivem em
**Conta**, no menu do rodapé da barra lateral, ao lado de **Sair**.

As sessões moram na memória do processo da API: fechar o app já encerra a
sessão, e uma janela ociosa por `ESMERALDINHA_SESSAO_IDLE_MS` (8 horas por
padrão) pede a senha de novo.

### Login e senha nos builds do CI

O app instalado não lê `.env` — o instalador é um arquivo só. Por isso o login
e a senha temporária entram no bundle na hora de empacotar, a partir de dois
secrets do repositório (Settings → Secrets and variables → Actions):

| Secret | Vira |
| --- | --- |
| `ESMERALDINHA_LOGIN` | o login da conta do auxiliar de ensino |
| `ESMERALDINHA_SENHA_TEMPORARIA` | a senha do primeiro acesso |

Quem faz isso é [electron/build-defines.mjs](electron/build-defines.mjs), lido
por `pnpm build:electron`: cada variável presente no ambiente vira um `define`
do esbuild. Sem os secrets configurados, o build sai com os padrões de
`server/env.ts` (`auxiliar` / `esmeraldinha`) — que estão neste repositório
público, então configure os dois antes de distribuir. Localmente vale o mesmo
mecanismo: `ESMERALDINHA_LOGIN=... pnpm dist`.

Um valor embutido no bundle é extraível de dentro do instalador por quem
souber procurar — é obscuridade, não segredo. Ele serve para o primeiro
acesso e só: a senha definitiva que o auxiliar de ensino escolhe é a única
que entra depois, e ela nasce na máquina dele, como hash `scrypt` no SQLite.

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
- `src/components/welcome-tour.tsx` — passeio guiado pelas funcionalidades
  (react-joyride), aberto sozinho na primeira execução e depois pelo `?` no
  cabeçalho
- `src/components/ui` — componentes shadcn/ui (`pnpm dlx shadcn@latest add <componente>`)
- `src/globals.css` — Tailwind, tokens de tema e variáveis de fonte
- `public/` — arquivos estáticos servidos na raiz
