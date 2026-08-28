# Esmeraldinha

SPA React 19 + TypeScript servida pelo Vite 7, com uma API Node local que faz
scraping do portal do professor via Playwright. Não há SSR nem Next.js — não use
`next/*` nem `"use client"`.

## Frontend (`src/`)

- Alias `@/*` aponta para `src/*`.
- Estilo: Tailwind CSS v4 via `@tailwindcss/vite` (sem `tailwind.config`); tokens
  de tema e variáveis de fonte ficam em `src/globals.css`.
- Componentes de UI vêm do shadcn/ui em `src/components/ui` (`components.json`
  já aponta para `src/globals.css`, `rsc: false`).
- Tema claro/escuro via `next-themes` (funciona em React puro) no `src/App.tsx`.
- Fontes carregadas por `<link>` no `index.html`, não por `next/font`.
- Rotas com `react-router` (`/professores`, `/cadernetas`) declaradas em
  `src/App.tsx`; a navegação fica em `src/components/app-sidebar.tsx`.

## Backend (`server/`) e scraping (`scrape/`)

- `server/` é uma API Hono rodando em Node (`tsx`), separada do Vite. O Vite faz
  proxy de `/api` para ela em desenvolvimento.
- `scrape/` tem o Playwright que opera o portal (PrimeFaces). `server/` só
  orquestra: `server/portal-sessions.ts` mantém as sessões headless em memória.
- Configuração por env em `.env` (veja `.env.example`): `PORTAL_URL`,
  `SERVER_PORT`, `PORTAL_HEADLESS`, `PORTAL_SESSION_IDLE_MS`.
- `tsconfig.server.json` cobre `server/` e `scrape/`, e inclui a lib DOM porque
  os callbacks de `page.evaluate` rodam dentro do navegador.

## Convenções

- Identificadores em inglês; o vocabulário do domínio fica em português
  (`Professor`, `nome`, `login`, `senha`, `escola`, `imagem`, `cpf`). Onde os
  dois se encontram: `loadProfessores`, `formatCpf`, `isLoginTaken`.
- Texto visível ao usuário sempre em português.
- `src/` usa aspas duplas; `server/` e `scrape/` usam aspas simples.

## Comandos

- `pnpm dev` sobe Vite e API juntos (`dev:web` e `dev:api` rodam separados).
- Verifique alterações com `pnpm build` (roda `tsc -b`) e `pnpm lint`.
- O Playwright precisa do navegador instalado: `pnpm exec playwright install chromium`.
