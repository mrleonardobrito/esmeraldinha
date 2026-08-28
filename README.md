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

| Comando        | Descrição                                     |
| -------------- | --------------------------------------------- |
| `pnpm dev`     | Servidor de desenvolvimento com HMR           |
| `pnpm build`   | Type-check (`tsc -b`) + build de produção      |
| `pnpm preview` | Serve o build de `dist/` localmente            |
| `pnpm lint`    | ESLint                                        |

## Estrutura

- `index.html` — entrada do Vite, carrega as fontes do Google Fonts
- `src/main.tsx` — bootstrap do React
- `src/components/ui` — componentes shadcn/ui (`pnpm dlx shadcn@latest add <componente>`)
- `src/globals.css` — Tailwind, tokens de tema e variáveis de fonte
- `public/` — arquivos estáticos servidos na raiz
