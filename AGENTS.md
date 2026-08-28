# Esmeraldinha

SPA React 19 + TypeScript servida pelo Vite 7. Não há SSR, rotas de servidor nem
Next.js — não use `next/*`, `"use client"` ou APIs de servidor.

- Alias `@/*` aponta para `src/*`.
- Estilo: Tailwind CSS v4 via `@tailwindcss/vite` (sem `tailwind.config`); tokens
  de tema e variáveis de fonte ficam em `src/globals.css`.
- Componentes de UI vêm do shadcn/ui em `src/components/ui` (`components.json`
  já aponta para `src/globals.css`, `rsc: false`).
- Tema claro/escuro via `next-themes` (funciona em React puro) no `src/App.tsx`.
- Fontes carregadas por `<link>` no `index.html`, não por `next/font`.
- Só existe uma rota; se precisar de mais, adicione um router (ex.: react-router).

Verifique alterações com `pnpm build` (roda `tsc -b`) e `pnpm lint`.
